import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const CH = '480000000000000001', CH2 = '480000000000000002', ROLE = '580000000000000001';
let app: INestApplication; let prisma: PrismaService;
const started = new Date();
const last = async () => (await prisma.discordOutbox.findFirst({ where: { type: 'academy.course', createdAt: { gte: started } }, orderBy: { createdAt: 'desc' } }))?.payload as Record<string, unknown> | undefined;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'aca_admin', ['System Administrator']);
  await makeUser(prisma, 'aca_off', ['Police Member']);
});
afterAll(async () => {
  await prisma.systemSetting.deleteMany({ where: { key: 'academy.config' } });
  await prisma.discordOutbox.deleteMany({ where: { createdAt: { gte: started } } });
  await app.close();
});

describe('academy course announcement in Discord', () => {
  it('a new course can be announced with role ping, date and place; defaults are used for later announcements', async () => {
    const admin = (await login(app, 'aca_admin')).agent;
    const off = (await login(app, 'aca_off')).agent;
    expect((await off.put('/api/v1/academy/config').send({ channelId: CH, pingRoleIds: [ROLE] })).status).toBe(403);
    const when = new Date(Date.now() + 86_400_000).toISOString();
    const r = await admin.post('/api/v1/academy/courses').send({ title: 'Verkehrskontrolle', description: 'Grundkurs', passScore: 80, announce: { channelId: CH, pingRoleIds: [ROLE], when, location: 'Wache' } });
    expect(r.status).toBe(201);
    expect(r.body.announced).toEqual({ channelId: CH, pingRoleIds: [ROLE] });
    expect(await last()).toMatchObject({ title: 'Verkehrskontrolle', description: 'Grundkurs', passScore: 80, channelId: CH, pingRoleIds: [ROLE], when, location: 'Wache', instructorName: 'aca_admin' });
    // ohne Ankündigung → nichts in Discord
    const before = await prisma.discordOutbox.count({ where: { type: 'academy.course' } });
    const quiet = await admin.post('/api/v1/academy/courses').send({ title: 'Funkkunde' });
    expect(quiet.body.announced).toBeNull();
    expect(await prisma.discordOutbox.count({ where: { type: 'academy.course' } })).toBe(before);
    // Standard speichern → spätere Ankündigung ohne Angaben nutzt ihn
    expect((await admin.put('/api/v1/academy/config').send({ channelId: CH2, pingRoleIds: [ROLE] })).body).toEqual({ channelId: CH2, pingRoleIds: [ROLE] });
    expect((await admin.post(`/api/v1/academy/courses/${quiet.body.id}/announce`).send({})).status).toBe(202);
    expect(await last()).toMatchObject({ title: 'Funkkunde', channelId: CH2, pingRoleIds: [ROLE], when: null });
    expect((await off.post(`/api/v1/academy/courses/${quiet.body.id}/announce`).send({})).status).toBe(403);
  });
});
