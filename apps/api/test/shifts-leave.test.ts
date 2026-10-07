import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { LeaveService } from '../src/leave/leave.service';

const TOKEN = 'test-bot-token-shifts-leave-0123456789abcdef';
const bot = (discordId?: string) => ({ Authorization: `Bot ${TOKEN}`, ...(discordId ? { 'X-Discord-User': discordId } : {}) });
const OFF_D = '510000000000000001', LEAD_D = '510000000000000002';
const R = { shift: '520000000000000001', brk: '520000000000000002', shift2: '520000000000000003', loa: '520000000000000009' };
const CH = { log: '530000000000000001', approve: '530000000000000002', loaLog: '530000000000000003' };
let app: INestApplication; let prisma: PrismaService;
const http = () => request(app.getHttpServer());
const lastOutbox = async (type: string) => (await prisma.discordOutbox.findFirst({ where: { type }, orderBy: { createdAt: 'desc' } }))?.payload as Record<string, unknown> | undefined;

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  const off = await makeUser(prisma, 'sl_off', ['Police Member']);
  const lead = await makeUser(prisma, 'sl_lead', ['Police Member', 'Police Administration']);
  await makeUser(prisma, 'sl_admin', ['System Administrator']);
  await prisma.discordLink.create({ data: { userId: off.id, discordId: OFF_D } });
  await prisma.personnel.create({ data: { userId: off.id, callsign: 'SL-1' } });
  await prisma.discordLink.create({ data: { userId: lead.id, discordId: LEAD_D } });
});
afterAll(async () => { delete process.env.BOT_API_TOKEN; await app.close(); });

describe('Shifts module', () => {
  it('only settings.manage configures shift types; names unique; first type becomes default', async () => {
    const admin = (await login(app, 'sl_admin')).agent;
    const off = (await login(app, 'sl_off')).agent;
    expect((await off.get('/api/v1/shifts/config')).body).toEqual({ enabled: false, types: [] });
    const cfg = { enabled: true, types: [
      { id: 'im-dienst', name: 'Im Dienst', onShiftRoleIds: [R.shift], onBreakRoleIds: [R.brk], logChannelId: CH.log },
      { id: 'sek', name: 'SEK Einsatz', onShiftRoleIds: [R.shift2], onBreakRoleIds: [R.brk] },
    ] };
    expect((await off.put('/api/v1/shifts/config').send(cfg)).status).toBe(403);
    expect((await admin.put('/api/v1/shifts/config').send({ ...cfg, types: [cfg.types[0], { ...cfg.types[1], name: 'im dienst' }] })).status).toBe(400);
    expect((await admin.put('/api/v1/shifts/config').send({ ...cfg, types: [{ ...cfg.types[0], onShiftRoleIds: ['abc'] }] })).status).toBe(400);
    const saved = await admin.put('/api/v1/shifts/config').send(cfg);
    expect(saved.status).toBe(200);
    expect(saved.body.types.map((t: { isDefault: boolean }) => t.isDefault)).toEqual([true, false]);
    expect((await http().get('/api/v1/bot/shifts').set(bot())).body.types).toHaveLength(2);
  });

  it('on duty / break / other type / off duty: roles and log channel of the shift type', async () => {
    const off = (await login(app, 'sl_off')).agent;
    // per Discord-Button ohne Auswahl → Standard-Schicht
    expect((await http().put('/api/v1/team/me/status').set(bot(OFF_D)).send({ status: 'ON_DUTY' })).status).toBe(200);
    expect(await lastOutbox('duty.changed')).toMatchObject({ discordId: OFF_D, status: 'ON_DUTY', shiftType: 'Im Dienst', channelId: CH.log, roles: { add: [R.shift], remove: expect.arrayContaining([R.brk, R.shift2]) } });
    expect((await off.put('/api/v1/team/me/status').send({ status: 'BREAK' })).status).toBe(200);
    expect(await lastOutbox('duty.changed')).toMatchObject({ status: 'BREAK', shiftType: 'Im Dienst', roles: { add: [R.brk], remove: expect.arrayContaining([R.shift, R.shift2]) } });
    // Schicht wechseln, ohne den Dienst zu verlassen
    expect((await off.put('/api/v1/team/me/status').send({ status: 'ON_DUTY', shiftType: 'sek' })).status).toBe(200);
    expect((await off.put('/api/v1/team/me/status').send({ status: 'ON_DUTY', shiftType: 'sek' })).status).toBe(409);
    const sek = await lastOutbox('duty.changed');
    expect(sek).toMatchObject({ shiftType: 'SEK Einsatz', roles: { add: [R.shift2] } });
    expect(sek!.channelId).toBeUndefined(); // ohne eigenen Log-Channel → normaler Dienst-Channel
    expect((await off.put('/api/v1/team/me/status').send({ status: 'ON_DUTY', shiftType: 'gibtsnicht' })).status).toBe(404);
    const team = (await off.get('/api/v1/team/overview')).body as { name: string; shiftType: string | null }[];
    expect(team.find((t) => t.name === 'sl_off')?.shiftType).toBe('SEK Einsatz');
    expect((await off.put('/api/v1/team/me/status').send({ status: 'OFF_DUTY' })).status).toBe(200);
    expect(await lastOutbox('duty.changed')).toMatchObject({ status: 'OFF_DUTY', roles: { add: [], remove: expect.arrayContaining([R.shift, R.brk, R.shift2]) } });
    // Modul aus → keine Schicht-Auswahl möglich
    await (await login(app, 'sl_admin')).agent.put('/api/v1/shifts/config').send({ enabled: false, types: [] });
    expect((await off.put('/api/v1/team/me/status').send({ status: 'ON_DUTY', shiftType: 'sek' })).status).toBe(400);
  });
});

describe('Leave of Absences', () => {
  const day = 86_400_000;
  it('requests need the module on, a sensible period and no overlap; posted for approval', async () => {
    const off = (await login(app, 'sl_off')).agent;
    const admin = (await login(app, 'sl_admin')).agent;
    const body = { startsAt: new Date(Date.now() + day).toISOString(), endsAt: new Date(Date.now() + 5 * day).toISOString(), reason: 'Urlaub' };
    expect((await off.post('/api/v1/leave').send(body)).status).toBe(409); // deaktiviert
    expect((await off.put('/api/v1/leave/config').send({ enabled: true })).status).toBe(403);
    expect((await admin.put('/api/v1/leave/config').send({ enabled: true, approvalChannelId: CH.approve, logChannelId: CH.loaLog, roleIds: [R.loa], maxDays: 30 })).status).toBe(200);
    expect((await off.post('/api/v1/leave').send({ ...body, endsAt: body.startsAt })).status).toBe(400);
    expect((await off.post('/api/v1/leave').send({ ...body, endsAt: new Date(Date.now() + 40 * day).toISOString() })).status).toBe(400);
    const r = await off.post('/api/v1/leave').send(body);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'PENDING', name: 'sl_off', discordId: OFF_D, days: 4 });
    expect((await off.post('/api/v1/leave').send({ ...body, startsAt: new Date(Date.now() + 2 * day).toISOString() })).status).toBe(409);
    expect(await lastOutbox('leave.requested')).toMatchObject({ id: r.body.id, channelId: CH.approve, discordId: OFF_D, reason: 'Urlaub' });
    expect(await lastOutbox('leave.pending')).toMatchObject({ id: r.body.id, discordId: OFF_D, guildName: expect.any(String) });
    // per Discord (Bot im Namen des Mitglieds)
    const viaBot = await http().post('/api/v1/leave').set(bot(LEAD_D)).send({ ...body, reason: 'Prüfungen' });
    expect(viaBot.status).toBe(201);
    // Sichtbarkeit: eigene vs. alle (leave.view)
    expect((await off.get('/api/v1/leave')).body).toMatchObject({ all: false, items: [{ id: r.body.id }] });
    const lead = (await login(app, 'sl_lead')).agent;
    expect((await lead.get('/api/v1/leave?status=PENDING')).body.items).toHaveLength(2);
    expect((await lead.get('/api/v1/leave?mine=true')).body.items).toHaveLength(1);
  });

  it('approve/deny needs leave.manage; role from start to end; ending early removes it; log + DM', async () => {
    const off = (await login(app, 'sl_off')).agent;
    const lead = (await login(app, 'sl_lead')).agent;
    const list = (await lead.get('/api/v1/leave?status=PENDING')).body.items as { id: string; name: string }[];
    const mine = list.find((x) => x.name === 'sl_off')!, other = list.find((x) => x.name === 'sl_lead')!;
    expect((await off.post(`/api/v1/leave/${mine.id}/decision`).send({ status: 'APPROVED' })).status).toBe(403);
    // per Button im Freigabe-Channel
    const ok = await http().post(`/api/v1/leave/${mine.id}/decision`).set(bot(LEAD_D)).send({ status: 'APPROVED' });
    expect(ok.body).toMatchObject({ status: 'APPROVED', decidedByName: 'sl_lead', active: false });
    expect((await lead.post(`/api/v1/leave/${mine.id}/decision`).send({ status: 'DENIED' })).status).toBe(409);
    expect(await lastOutbox('leave.decided')).toMatchObject({ discordId: OFF_D, status: 'APPROVED', reason: 'Urlaub', guildName: expect.any(String) });
    expect(await lastOutbox('leave.log')).toMatchObject({ event: 'approved', channelId: CH.loaLog });
    const deny = await lead.post(`/api/v1/leave/${other.id}/decision`).send({ status: 'DENIED', reason: 'Zu kurzfristig' });
    expect(deny.body).toMatchObject({ status: 'DENIED', decisionReason: 'Zu kurzfristig' });
    // Entscheidung im Dashboard → der Bot passt die Antragsnachricht in Discord an (Farbe, Entscheidung, Buttons weg)
    expect(await lastOutbox('message.decided')).toMatchObject({ key: `msg-l-${other.id}`, text: expect.stringContaining('❌ Abgelehnt von'), color: 0xef4444 });
    expect(String((await lastOutbox('message.decided') as { text: string }).text)).toContain('Zu kurzfristig');
    // Beginn erreicht → Rolle; noch einmal prüfen vergibt sie nicht doppelt
    await prisma.leaveRequest.update({ where: { id: mine.id }, data: { startsAt: new Date(Date.now() - 1000) } });
    const svc = app.get(LeaveService);
    expect(await svc.tick()).toEqual({ started: 1, ended: 0 });
    expect(await svc.tick()).toEqual({ started: 0, ended: 0 });
    expect(await lastOutbox('member.roles')).toMatchObject({ discordId: OFF_D, add: [R.loa], remove: [] });
    expect((await lead.get('/api/v1/leave?status=ACTIVE')).body.items.map((x: { id: string }) => x.id)).toEqual([mine.id]);
    // vorzeitig beenden (eigene) → Rolle weg, Log
    const end = await off.post(`/api/v1/leave/${mine.id}/cancel`);
    expect(end.body.status).toBe('ENDED');
    expect(await lastOutbox('member.roles')).toMatchObject({ discordId: OFF_D, add: [], remove: [R.loa] });
    expect(await lastOutbox('leave.log')).toMatchObject({ event: 'ended_early' });
    expect((await off.post(`/api/v1/leave/${mine.id}/cancel`)).status).toBe(409);
  });

  it('ends automatically at the end date and removes the role', async () => {
    const off = (await login(app, 'sl_off')).agent;
    const lead = (await login(app, 'sl_lead')).agent;
    const r = await off.post('/api/v1/leave').send({ startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 60_000).toISOString(), reason: 'Kurz weg' });
    expect(r.status).toBe(201);
    await lead.post(`/api/v1/leave/${r.body.id}/decision`).send({ status: 'APPROVED' }); // beginnt sofort → Rolle
    expect(await lastOutbox('member.roles')).toMatchObject({ add: [R.loa] });
    await prisma.leaveRequest.update({ where: { id: r.body.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    expect(await app.get(LeaveService).tick()).toEqual({ started: 0, ended: 1 });
    expect(await lastOutbox('member.roles')).toMatchObject({ remove: [R.loa] });
    expect(await lastOutbox('leave.log')).toMatchObject({ event: 'ended', id: r.body.id });
    // jemand anderes darf fremde nicht zurückziehen
    const other = await lead.post('/api/v1/leave').send({ startsAt: new Date(Date.now() + 86_400_000).toISOString(), endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), reason: 'Termin' });
    expect((await off.post(`/api/v1/leave/${other.body.id}/cancel`)).status).toBe(403);
    expect((await lead.post(`/api/v1/leave/${other.body.id}/cancel`)).body.status).toBe('CANCELLED');
  });
});
