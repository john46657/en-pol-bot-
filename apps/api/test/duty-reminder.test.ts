import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { DutyService } from '../src/duty/duty.service';

const D = '650000000000000001';
let app: INestApplication; let prisma: PrismaService; let userId: string;
const min = 60_000;
const later = (m: number) => new Date(Date.now() + m * min);
const lastReminder = async () => (await prisma.discordOutbox.findFirst({ where: { type: 'duty.reminder' }, orderBy: { createdAt: 'desc' } }))?.payload as Record<string, unknown> | undefined;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  userId = (await makeUser(prisma, 'dr_off', ['Police Member'])).id;
  await makeUser(prisma, 'dr_admin', ['System Administrator']);
  await prisma.discordLink.create({ data: { userId, discordId: D } });
  // offene Schichten aus anderen Testdateien würden mitgezählt
  await prisma.dutySession.updateMany({ where: { endedAt: null }, data: { endedAt: new Date() } });
});
afterAll(async () => {
  await prisma.systemSetting.deleteMany({ where: { key: 'shifts.config' } });
  await app.close();
});

describe('reminder when on duty but inactive', () => {
  it('only ON_DUTY; reminds once after the idle time; activity resets; auto off after no reaction', async () => {
    const svc = app.get(DutyService);
    const admin = (await login(app, 'dr_admin')).agent;
    const off = (await login(app, 'dr_off')).agent;
    expect((await admin.put('/api/v1/shifts/config').send({ enabled: false, types: [], reminder: { enabled: true, afterMinutes: 2 } })).status).toBe(400); // min. 5
    expect((await admin.put('/api/v1/shifts/config').send({ enabled: false, types: [], reminder: { enabled: true, afterMinutes: 30, autoOffMinutes: 15 } })).body.reminder).toEqual({ enabled: true, afterMinutes: 30, autoOffMinutes: 15 });

    // Pause zählt nicht
    await off.put('/api/v1/team/me/status').send({ status: 'BREAK' });
    expect((await svc.remindTick(later(120))).reminded).toBe(0);
    await off.put('/api/v1/team/me/status').send({ status: 'ON_DUTY' });
    expect((await svc.remindTick(later(10))).reminded).toBe(0); // noch zu früh
    expect(await svc.remindTick(later(31))).toEqual({ reminded: 1, ended: 0 });
    expect(await lastReminder()).toMatchObject({ kind: 'reminder', discordId: D, autoOffMinutes: 15 });
    expect(await svc.remindTick(later(32))).toEqual({ reminded: 0, ended: 0 }); // nur einmal
    expect((await prisma.notification.findFirst({ where: { userId, type: 'DUTY_REMINDER' } }))?.title).toBe('Bist du noch im Dienst?');

    // „Bin noch im Dienst“ → Zähler beginnt neu (die Erinnerung lag in Wirklichkeit vor der Reaktion)
    await prisma.dutySession.updateMany({ where: { userId, endedAt: null }, data: { remindedAt: new Date(Date.now() - min) } });
    expect((await off.post('/api/v1/team/me/active')).body).toEqual({ onDuty: true, status: 'ON_DUTY' });
    expect(await svc.remindTick(later(20))).toEqual({ reminded: 0, ended: 0 });
    expect(await svc.remindTick(later(31))).toEqual({ reminded: 1, ended: 0 });
    // keine Reaktion → nach 15 Minuten automatisch außer Dienst
    expect(await svc.remindTick(later(40))).toEqual({ reminded: 0, ended: 0 });
    expect(await svc.remindTick(later(47))).toEqual({ reminded: 0, ended: 1 });
    expect(await prisma.dutySession.count({ where: { userId, endedAt: null } })).toBe(0);
    expect(await lastReminder()).toMatchObject({ kind: 'ended', discordId: D });
  });

  it('any action counts as activity; reading does not', async () => {
    const svc = app.get(DutyService);
    const off = (await login(app, 'dr_off')).agent;
    await off.put('/api/v1/team/me/status').send({ status: 'ON_DUTY' });
    const s = await prisma.dutySession.findFirstOrThrow({ where: { userId, endedAt: null } });
    await prisma.dutySession.update({ where: { id: s.id }, data: { startedAt: new Date(Date.now() - 60 * min), lastActivityAt: new Date(Date.now() - 60 * min) } });
    (svc as unknown as { touched: Map<string, number> }).touched.clear();
    await off.get('/api/v1/team/overview');
    expect((await prisma.dutySession.findUniqueOrThrow({ where: { id: s.id } })).lastActivityAt!.getTime()).toBeLessThan(Date.now() - 50 * min);
    await off.post('/api/v1/persons').send({ robloxUsername: 'Dr_Activity_Test' });
    await new Promise((r) => setTimeout(r, 100));
    expect((await prisma.dutySession.findUniqueOrThrow({ where: { id: s.id } })).lastActivityAt!.getTime()).toBeGreaterThan(Date.now() - min);
    await prisma.person.deleteMany({ where: { robloxUsername: 'Dr_Activity_Test' } });
    await off.put('/api/v1/team/me/status').send({ status: 'OFF_DUTY' });
    // Modul aus → nichts
    await (await login(app, 'dr_admin')).agent.put('/api/v1/shifts/config').send({ enabled: false, types: [] });
    expect(await svc.remindTick(later(500))).toEqual({ reminded: 0, ended: 0 });
  });
});
