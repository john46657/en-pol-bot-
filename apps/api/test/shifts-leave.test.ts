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
    expect((await off.get('/api/v1/shifts/config')).body).toMatchObject({ enabled: false, types: [] });
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
    const started = await lastOutbox('duty.changed');
    expect(started).toMatchObject({ discordId: OFF_D, status: 'ON_DUTY', shiftType: 'Im Dienst', channelId: CH.log, shiftId: expect.stringMatching(/^\d{17,20}$/), totalSeconds: 0, roles: { add: [R.shift], remove: expect.arrayContaining([R.brk, R.shift2]) } });
    expect((await off.put('/api/v1/team/me/status').send({ status: 'BREAK' })).status).toBe(200);
    expect(await lastOutbox('duty.changed')).toMatchObject({ status: 'BREAK', shiftType: 'Im Dienst', shiftId: started!.shiftId, roles: { add: [R.brk], remove: expect.arrayContaining([R.shift, R.shift2]) } });
    // Schicht wechseln, ohne den Dienst zu verlassen
    expect((await off.put('/api/v1/team/me/status').send({ status: 'ON_DUTY', shiftType: 'sek' })).status).toBe(200);
    expect((await off.put('/api/v1/team/me/status').send({ status: 'ON_DUTY', shiftType: 'sek' })).status).toBe(409);
    const sek = await lastOutbox('duty.changed');
    expect(sek).toMatchObject({ shiftType: 'SEK Einsatz', shiftId: started!.shiftId, roles: { add: [R.shift2] } });
    expect(sek!.channelId).toBeUndefined(); // ohne eigenen Log-Channel → normaler Dienst-Channel
    expect((await off.put('/api/v1/team/me/status').send({ status: 'ON_DUTY', shiftType: 'gibtsnicht' })).status).toBe(404);
    const team = (await off.get('/api/v1/team/overview')).body as { name: string; shiftType: string | null }[];
    expect(team.find((t) => t.name === 'sl_off')?.shiftType).toBe('SEK Einsatz');
    expect((await off.put('/api/v1/team/me/status').send({ status: 'OFF_DUTY' })).status).toBe(200);
    expect(await lastOutbox('duty.changed')).toMatchObject({ status: 'OFF_DUTY', shiftId: started!.shiftId, shiftStartedAt: expect.any(String), totalSeconds: expect.any(Number), roles: { add: [], remove: expect.arrayContaining([R.shift, R.brk, R.shift2]) } });
    // Modul aus → keine Schicht-Auswahl möglich
    await (await login(app, 'sl_admin')).agent.put('/api/v1/shifts/config').send({ enabled: false, types: [] });
    expect((await off.put('/api/v1/team/me/status').send({ status: 'ON_DUTY', shiftType: 'sek' })).status).toBe(400);
  });

  it('shift logs: one entry per shift with type, duration, breaks and who started/ended it; team.manage only', async () => {
    const off = (await login(app, 'sl_off')).agent;
    expect((await off.get('/api/v1/team/shifts')).status).toBe(403);
    // gelöschte Schichtart → ID statt Name; wieder angelegt → Name
    await (await login(app, 'sl_admin')).agent.put('/api/v1/shifts/config').send({ enabled: true, types: [{ id: 'im-dienst', name: 'Im Dienst' }, { id: 'sek', name: 'SEK Einsatz' }] });
    const lead = (await login(app, 'sl_lead')).agent;
    const r = await lead.get('/api/v1/team/shifts?days=1');
    expect(r.status).toBe(200);
    const mine = (r.body.items as { name: string }[]).filter((x) => x.name === 'sl_off');
    // Im Dienst → Pause → SEK → Außer Dienst = eine Schicht; danach Modul aus (keine neue)
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ active: false, status: 'OFF_DUTY', shiftType: 'Im Dienst', shiftTypeNames: ['Im Dienst', 'SEK Einsatz'], breaks: 1, callsign: 'SL-1', startedBy: 'sl_off', endedBy: 'sl_off', minutes: expect.any(Number) });
    // durch die Schichtleitung gestartet → läuft noch
    const offId = (await prisma.user.findFirstOrThrow({ where: { username: 'sl_off' } })).id;
    expect((await lead.put(`/api/v1/team/${offId}/status`).send({ status: 'ON_DUTY' })).status).toBe(200);
    const again = ((await lead.get(`/api/v1/team/shifts?userId=${offId}`)).body.items as { active: boolean; startedBy: string; endedBy: string | null }[]);
    expect(again).toHaveLength(2);
    expect(again[0]).toMatchObject({ active: true, startedBy: 'sl_lead', endedBy: null });
    await lead.put(`/api/v1/team/${offId}/status`).send({ status: 'OFF_DUTY' });
    // Discord: `/schicht admin mitglied:@…` (per Discord-ID) und `/schicht verlauf` (eigene Schichten, ohne team.manage)
    const byDiscord = (await http().get(`/api/v1/team/shifts?discordId=${OFF_D}`).set(bot(LEAD_D))).body;
    expect(byDiscord.member).toEqual({ userId: offId, name: 'sl_off' });
    expect(byDiscord.items).toHaveLength(2);
    expect((await http().get('/api/v1/team/shifts?discordId=599999999999999999').set(bot(LEAD_D))).body).toMatchObject({ member: null, items: [] });
    expect((await http().get(`/api/v1/team/shifts?discordId=${LEAD_D}`).set(bot(OFF_D))).status).toBe(403);
    const own = (await http().get('/api/v1/team/me/shifts?days=1').set(bot(OFF_D))).body.items as { userId: string }[];
    expect(own).toHaveLength(2);
    expect(own.every((x) => x.userId === offId)).toBe(true);
    // „Schicht beenden“-Button: Schichtleitung ja, normales Mitglied nicht
    await off.put('/api/v1/team/me/status').send({ status: 'ON_DUTY' });
    expect((await http().put(`/api/v1/team/${offId}/status`).set(bot(OFF_D)).send({ status: 'OFF_DUTY' })).status).toBe(403);
    expect((await http().put(`/api/v1/team/${offId}/status`).set(bot(LEAD_D)).send({ status: 'OFF_DUTY' })).status).toBe(200);
    expect((await lead.get('/api/v1/team/shifts?shiftType=sek')).body.items.filter((x: { name: string }) => x.name === 'sl_off')).toHaveLength(1);
    await (await login(app, 'sl_admin')).agent.put('/api/v1/shifts/config').send({ enabled: false, types: [] });
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
    // Kalender: laufende/genehmigte ja, abgelehnte nicht
    const cal = (await lead.get('/api/v1/leave?status=CALENDAR')).body.items.map((x: { id: string }) => x.id);
    expect(cal).toContain(mine.id);
    expect(cal).not.toContain(other.id);
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

describe('/leave admin (Leitung für ein Mitglied)', () => {
  it('management sees the member history by Discord id and starts a leave for the member (approved at once)', async () => {
    const admin = (await login(app, 'sl_admin')).agent;
    await admin.put('/api/v1/leave/config').send({ enabled: true, maxDays: 30 });
    await prisma.leaveRequest.deleteMany({ where: { user: { username: 'sl_off' } } });
    const body = { startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), reason: 'Urlaub', forDiscordId: OFF_D };
    // Mitglieder dürfen keine Abmeldung für andere starten und keine fremden Verläufe sehen
    expect((await http().post('/api/v1/leave').set(bot(OFF_D)).send({ ...body, forDiscordId: LEAD_D })).status).toBe(403);
    expect((await http().get(`/api/v1/leave?discordId=${LEAD_D}`).set(bot(OFF_D))).status).toBe(403);
    const r = await admin.post('/api/v1/leave').send(body);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'APPROVED', active: true, name: 'sl_off', discordId: OFF_D });
    const list = (await admin.get(`/api/v1/leave?discordId=${OFF_D}&status=ALL`)).body;
    expect(list.member).toMatchObject({ name: 'sl_off' });
    expect(list.items.map((x: { number: string }) => x.number)).toEqual([r.body.number]);
    expect((await admin.get('/api/v1/leave?discordId=599999999999999999')).status).toBe(404);
    expect((await admin.post(`/api/v1/leave/${r.body.id}/cancel`)).body).toMatchObject({ status: 'ENDED' });
  });
});


describe('Abmeldung verlängern (wie Trident „Extend“)', () => {
  const day = 86_400_000;
  it('own approved leave → extension request for management; management extends at once', async () => {
    const admin = (await login(app, 'sl_admin')).agent;
    const off = (await login(app, 'sl_off')).agent;
    const lead = (await login(app, 'sl_lead')).agent;
    await admin.put('/api/v1/leave/config').send({ enabled: true, approvalChannelId: CH.approve, logChannelId: CH.loaLog, maxDays: 30 });
    await prisma.leaveRequest.deleteMany({ where: { user: { username: 'sl_off' } } });
    const r = await off.post('/api/v1/leave').send({ startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 2 * day).toISOString(), reason: 'Urlaub' });
    // noch offener Antrag: Verlängerung gilt sofort (die Leitung sieht beim Entscheiden das neue Ende)
    const pend = await off.post(`/api/v1/leave/${r.body.id}/extend`).send({ minutes: 24 * 60, reason: 'Flug verschoben' });
    expect(pend.body).toMatchObject({ extensionPending: false });
    expect(Date.parse(pend.body.endsAt) - Date.parse(r.body.endsAt)).toBe(day);
    await lead.post(`/api/v1/leave/${r.body.id}/decision`).send({ status: 'APPROVED' });
    // genehmigt: eigene Verlängerung wird zum Antrag, das Ende bleibt bis zur Entscheidung
    const req = await http().post(`/api/v1/leave/${r.body.id}/extend`).set(bot(OFF_D)).send({ minutes: 2 * 24 * 60, reason: 'Noch krank' });
    expect(req.body).toMatchObject({ extensionPending: true, extensionMinutes: 2880, endsAt: pend.body.endsAt });
    expect(await lastOutbox('leave.extension')).toMatchObject({ id: r.body.id, channelId: CH.approve, extensionMinutes: 2880, extensionReason: 'Noch krank' });
    expect((await off.post(`/api/v1/leave/${r.body.id}/extend`).send({ minutes: 60, reason: 'noch mehr' })).status).toBe(409);
    expect((await off.post(`/api/v1/leave/${r.body.id}/extend`).send({ minutes: 60 * 24 * 40, reason: 'zu lang' })).status).toBe(400);
    expect((await off.post(`/api/v1/leave/${r.body.id}/extension-decision`).send({ status: 'APPROVED' })).status).toBe(403);
    // Leitung nimmt an (per Button) → neues Ende, Log, DM, Antragsnachricht markiert
    const ok = await http().post(`/api/v1/leave/${r.body.id}/extension-decision`).set(bot(LEAD_D)).send({ status: 'APPROVED' });
    expect(ok.body).toMatchObject({ extensionMinutes: null, decidedByName: 'sl_lead' });
    expect(Date.parse(ok.body.endsAt) - Date.parse(pend.body.endsAt)).toBe(2 * day);
    expect(await lastOutbox('leave.log')).toMatchObject({ event: 'extended', extendReason: 'Noch krank', decidedByName: 'sl_lead' });
    expect(await lastOutbox('leave.extension.decided')).toMatchObject({ discordId: OFF_D, status: 'APPROVED', extensionMinutes: 2880 });
    expect(await lastOutbox('message.decided')).toMatchObject({ key: `msg-e-${r.body.id}`, badge: { label: 'Angenommen' } });
    expect((await lead.post(`/api/v1/leave/${r.body.id}/extension-decision`).send({ status: 'APPROVED' })).status).toBe(409);
    // abgelehnt: Ende bleibt
    await off.post(`/api/v1/leave/${r.body.id}/extend`).send({ minutes: 24 * 60, reason: 'nochmal' });
    const no = await lead.post(`/api/v1/leave/${r.body.id}/extension-decision`).send({ status: 'DENIED', reason: 'Personalmangel' });
    expect(no.body).toMatchObject({ extensionMinutes: null, endsAt: ok.body.endsAt });
    expect(await lastOutbox('leave.log')).toMatchObject({ event: 'extension_denied', decisionReason: 'Personalmangel' });
    // Leitung verlängert selbst: sofort
    const direct = await lead.post(`/api/v1/leave/${r.body.id}/extend`).send({ minutes: 60, reason: 'Absprache' });
    expect(direct.body).toMatchObject({ extensionPending: false });
    expect(Date.parse(direct.body.endsAt) - Date.parse(ok.body.endsAt)).toBe(60 * 60_000);
  });
});

describe('Schichtart mit erlaubten Rollen (wie Trident „Permitted Roles“)', () => {
  it('only members with a permitted Discord role may start it; without a choice the first permitted type is used', async () => {
    const admin = (await login(app, 'sl_admin')).agent;
    const PERMIT = '540000000000000001';
    await admin.put('/api/v1/shifts/config').send({ enabled: true, types: [
      { id: 'sek', name: 'SEK', isDefault: true, permittedRoleIds: [PERMIT] },
      { id: 'streife', name: 'Streife', permittedRoleIds: [] },
    ] });
    const asBot = (roles: string[]) => ({ ...bot(OFF_D), 'X-Discord-Roles': roles.join(',') });
    await http().put('/api/v1/team/me/status').set(bot(OFF_D)).send({ status: 'OFF_DUTY' });
    const denied = await http().put('/api/v1/team/me/status').set(asBot(['540000000000000099'])).send({ status: 'ON_DUTY', shiftType: 'sek' });
    expect(denied.status).toBe(403);
    // ohne Auswahl: Standard (SEK) ist gesperrt → Streife
    expect((await http().put('/api/v1/team/me/status').set(asBot(['540000000000000099'])).send({ status: 'ON_DUTY' })).body).toMatchObject({ shiftType: 'streife' });
    await http().put('/api/v1/team/me/status').set(bot(OFF_D)).send({ status: 'OFF_DUTY' });
    expect((await http().put('/api/v1/team/me/status').set(asBot([PERMIT])).send({ status: 'ON_DUTY', shiftType: 'sek' })).body).toMatchObject({ shiftType: 'sek' });
    await http().put('/api/v1/team/me/status').set(bot(OFF_D)).send({ status: 'OFF_DUTY' });
    await admin.put('/api/v1/shifts/config').send({ enabled: false, types: [] });
  });
});
