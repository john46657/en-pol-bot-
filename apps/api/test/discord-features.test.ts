import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const TOKEN = 'feature-bot-token-0123456789-abcdefghijklmnop';
let app: INestApplication; let prisma: PrismaService;
const http = () => request(app.getHttpServer());
const bot = (discordId?: string) => ({ Authorization: `Bot ${TOKEN}`, ...(discordId ? { 'X-Discord-User': discordId } : {}) });
const D_OFF = '400000000000000001', D_DISP = '400000000000000002', D_APPLICANT = '400000000000000009';

async function link(username: string, discordId: string) {
  const { agent } = await login(app, username);
  const { body } = await agent.post('/api/v1/discord/link-code');
  expect((await http().post('/api/v1/bot/link').set(bot()).send({ code: body.code, discordId })).status).toBe(200);
}

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'f_admin', ['System Administrator']);
  await makeUser(prisma, 'f_off', ['Police Member']);
  await makeUser(prisma, 'f_disp', ['Police Member', 'Dispatch']);
  await link('f_off', D_OFF);
  await link('f_disp', D_DISP);
});
afterAll(async () => {
  await prisma.systemSetting.deleteMany({ where: { key: { in: ['discord.channels', 'danger.current', 'team.rankOrder'] } } });
  delete process.env.BOT_API_TOKEN;
  await app.close();
});

describe('danger level (Gefahrenstatus)', () => {
  it('is readable by officers, settable only with dispatch.manage, audited, and announced once per change', async () => {
    const adm = (await login(app, 'f_admin')).agent;
    await prisma.discordOutbox.deleteMany();
    expect((await adm.put('/api/v1/admin/settings/discord.channels').send({ value: { danger: '500000000000000001' } })).status).toBe(200);
    expect((await http().get('/api/v1/danger-level').set(bot(D_OFF))).body.level).toBe('STATUS_1');
    expect((await http().put('/api/v1/danger-level').set(bot(D_OFF)).send({ level: 'STATUS_4' })).status).toBe(403); // Police Member darf nicht
    // Stufe per Schlüssel oder Name („Status 4“)
    const res = await http().put('/api/v1/danger-level').set(bot(D_DISP)).send({ level: 'Status 4', reason: 'Bank robbery in progress' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ level: 'STATUS_4', reason: 'Bank robbery in progress', def: { name: 'Status 4', title: 'Extreme Kriminalität.' } });
    expect((await http().put('/api/v1/danger-level').set(bot(D_DISP)).send({ level: 'PURPLE' })).status).toBe(400);
    expect(await prisma.auditLog.count({ where: { action: 'danger.set' } })).toBe(1);
    const out = await prisma.discordOutbox.findMany({ where: { type: 'danger.changed' } });
    expect(out).toHaveLength(1);
    expect(out[0]!.payload).toMatchObject({ level: 'STATUS_4', name: 'Status 4', previous: null, setBy: 'f_disp' });
    await http().put('/api/v1/danger-level').set(bot(D_DISP)).send({ level: 'STATUS_4' }); // unverändert -> keine zweite Meldung
    expect(await prisma.discordOutbox.count({ where: { type: 'danger.changed' } })).toBe(1);
    expect((await http().get('/api/v1/bot/danger').set(bot())).body.level).toBe('STATUS_4');
  });

  it('levels, texts, colours and the ping role are configured in the dashboard', async () => {
    const adm = (await login(app, 'f_admin')).agent;
    const cfg = (await adm.get('/api/v1/danger-level/config')).body;
    expect(cfg.levels.map((l: { name: string }) => l.name)).toEqual(['Status 1', 'Status 2', 'Status 3', 'Status 4']);
    const levels = [{ ...cfg.levels[0], title: 'Ruhig.' }, { key: 'ALARM', name: 'Alarm', title: 'Großlage', text: 'Alle Einheiten!', emoji: '🚨', color: '#ff0000', buttonStyle: 'danger' }];
    expect((await adm.put('/api/v1/danger-level/config').send({ ...cfg, levels: [levels[0], levels[0]] })).status).toBe(400); // doppelte Schlüssel
    expect((await adm.put('/api/v1/danger-level/config').send({ ...cfg, levels, pingRoleIds: ['500000000000000077'] })).status).toBe(200);
    // alter Stand (STATUS_4 gibt es nicht mehr) → erste Stufe
    expect((await http().get('/api/v1/danger-level').set(bot(D_OFF))).body.def.title).toBe('Ruhig.');
    await http().put('/api/v1/danger-level').set(bot(D_DISP)).send({ level: 'alarm' });
    const out = await prisma.discordOutbox.findFirst({ where: { type: 'danger.changed' }, orderBy: { createdAt: 'desc' } });
    expect(out!.payload).toMatchObject({ name: 'Alarm', title: 'Großlage', text: 'Alle Einheiten!', pingRoleIds: ['500000000000000077'] });
  });

  it('the button panel can be sent to any channel from the dashboard (settings.manage)', async () => {
    const off = (await login(app, 'f_off')).agent;
    expect((await off.post('/api/v1/danger-level/panel').send({ channelId: '600000000000000001' })).status).toBe(403);
    const adm = (await login(app, 'f_admin')).agent;
    expect((await adm.post('/api/v1/danger-level/panel').send({ channelId: 'abc' })).status).toBe(400);
    expect((await adm.post('/api/v1/danger-level/panel').send({ channelId: '600000000000000001' })).status).toBe(202);
    expect((await prisma.discordOutbox.findFirst({ where: { type: 'danger.panel' } }))!.payload).toEqual({ channelId: '600000000000000001' });
    expect(await prisma.auditLog.count({ where: { action: 'danger.panel' } })).toBe(1);
    await http().put('/api/v1/bot/state/danger-panel').set(bot()).send({ value: { channelId: '600000000000000001', messageId: '700000000000000001' } });
    expect((await adm.get('/api/v1/danger-level/panel')).body).toEqual({ channelId: '600000000000000001', posted: true });
  });
});

describe('radio whitelist (Funk-Freigabe)', () => {
  it('needs personnel.edit to change, resolves by linked Discord id, rejects duplicates and unlinked accounts', async () => {
    const adm = (await login(app, 'f_admin')).agent;
    expect((await http().post('/api/v1/radio-whitelist').set(bot(D_OFF)).send({ discordId: D_OFF })).status).toBe(403);
    expect((await adm.post('/api/v1/radio-whitelist').send({ discordId: D_OFF })).status).toBe(200);
    expect((await adm.post('/api/v1/radio-whitelist').send({ discordId: D_OFF })).status).toBe(409);
    expect((await adm.post('/api/v1/radio-whitelist').send({ discordId: '999999999999999999' })).status).toBe(404); // nicht verknüpft
    expect((await adm.post('/api/v1/radio-whitelist').send({})).status).toBe(400);
    expect((await adm.post('/api/v1/radio-whitelist').send({ discordId: D_OFF, userId: '00000000-0000-4000-8000-000000000000' })).status).toBe(400);
    expect((await http().get(`/api/v1/radio-whitelist/check?discordId=${D_OFF}`).set(bot(D_DISP))).body).toMatchObject({ whitelisted: true });
    expect((await http().get(`/api/v1/radio-whitelist/check?discordId=${D_DISP}`).set(bot(D_DISP))).body).toMatchObject({ whitelisted: false });
    expect((await http().get('/api/v1/radio-whitelist').set(bot(D_DISP))).body).toHaveLength(1);
    expect((await adm.post('/api/v1/radio-whitelist/remove').send({ discordId: D_OFF })).status).toBe(200);
    expect((await adm.post('/api/v1/radio-whitelist/remove').send({ discordId: D_OFF })).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: { in: ['radio.add', 'radio.remove'] } } })).toBe(2);
  });
});

describe('bot service data', () => {
  it('team data for the live team list exposes display fields only, ordered by the configured rank order', async () => {
    const adm = (await login(app, 'f_admin')).agent;
    expect((await adm.put('/api/v1/admin/settings/team.rankOrder').send({ value: ['Chief', 'Officer'] })).status).toBe(200);
    const off = await prisma.user.findUniqueOrThrow({ where: { username: 'f_off' } });
    // Personal ist je Discord-Server getrennt; die Teamliste zeigt das Personal des Heimat-Servers der Leitstelle
    const HOME = '740000000000000001';
    expect((await adm.put('/api/v1/cad/config').send({ homeGuildId: HOME })).status).toBe(200);
    expect((await adm.post('/api/v1/personnel').set('x-guild-id', HOME).send({ userId: off.id, rank: 'Officer', callsign: 'f-1', team: 'Patrol' })).status).toBe(201);
    const t = (await http().get('/api/v1/bot/team').set(bot())).body;
    expect(t.rankOrder).toEqual(['Chief', 'Officer']);
    const m = t.members.find((x: { callsign: string }) => x.callsign === 'F-1');
    expect(m).toMatchObject({ name: 'f_off', rank: 'Officer', team: 'Patrol', dutyStatus: 'OFF_DUTY' });
    expect(Object.keys(m).sort()).toEqual(['callsign', 'dutyStatus', 'name', 'rank', 'team', 'unit']); // keine IDs/Mailadressen
    expect((await adm.get('/api/v1/bot/team')).status).toBe(401); // kein Session-Zugriff
  });
  it('bot state is a validated key/value store, bot-token only', async () => {
    expect((await http().put('/api/v1/bot/state/teamlist:123').set(bot()).send({ value: { channelId: '1', messageId: '2' } })).status).toBe(204);
    expect((await http().get('/api/v1/bot/state/teamlist:123').set(bot())).body.value).toEqual({ channelId: '1', messageId: '2' });
    expect((await http().get('/api/v1/bot/state/never-set').set(bot())).body.value).toBeNull();
    expect((await http().put('/api/v1/bot/state/BAD KEY!').set(bot()).send({ value: 1 })).status).toBe(400);
    expect((await http().get('/api/v1/bot/state/teamlist:123')).status).toBe(401);
    await prisma.systemSetting.deleteMany({ where: { key: { startsWith: 'bot.state.' } } });
  });
});

describe('applications from Discord', () => {
  const answers = { experience: 'Two years', availability: 'Evenings', motivation: 'Structured RP', roleplayKnowledge: 'FRP / NITRP' };
  it('the bot route stores the Discord id, posts the full application to the staff channel (like Appy), and DMs the decision', async () => {
    const form = (await http().get('/api/v1/applications/form')).body as { key: string; required: boolean }[];
    expect(form.filter((f) => f.required).length).toBeLessThanOrEqual(4);
    const adm = (await login(app, 'f_admin')).agent;
    await prisma.discordOutbox.deleteMany();
    await adm.put('/api/v1/admin/settings/discord.channels').send({ value: { applications: '600000000000000001' } });
    expect((await http().post('/api/v1/bot/application').send({ robloxUsername: 'X', discordId: D_APPLICANT, answers })).status).toBe(401); // nur mit Bot-Token
    expect((await http().post('/api/v1/bot/application').set(bot()).send({ robloxUsername: 'Disc_Applicant', discordId: D_APPLICANT, answers: { experience: 'only this' } })).status).toBe(400); // Pflichtfelder
    const ok = await http().post('/api/v1/bot/application').set(bot()).send({ robloxUsername: 'Disc_Applicant', robloxUserId: '8123456', discordId: D_APPLICANT, answers });
    expect(ok.status).toBe(201);
    const row = await prisma.application.findFirstOrThrow({ where: { number: ok.body.number } });
    expect(row).toMatchObject({ discordId: D_APPLICANT, source: 'DISCORD', robloxUsername: 'Disc_Applicant' });
    const submitted = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'application.submitted' } });
    expect(submitted.payload).toMatchObject({ number: ok.body.number, discordId: D_APPLICANT, source: 'DISCORD' });
    expect(JSON.stringify(submitted.payload)).toContain('Structured RP'); // Antworten stehen (wie bei Appy) im Team-Channel – nur interne Channels eintragen

    for (const s of ['SCREENING', 'INTERVIEW', 'PENDING_DECISION']) expect((await adm.put(`/api/v1/applications/${row.id}/status`).send({ status: s })).status).toBe(200);
    // Entscheidungs-DM wird auch ohne konfigurierten Channel eingereiht (always) und enthält den internen Grund nicht
    await adm.put('/api/v1/admin/settings/discord.channels').send({ value: { dispatch: '600000000000000002' } });
    expect((await adm.post(`/api/v1/applications/${row.id}/decide`).send({ accept: false, reason: 'INTERNAL-NOTE too inexperienced' })).status).toBe(201);
    const decided = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'application.decided' } });
    expect(decided.payload).toMatchObject({ discordId: D_APPLICANT, status: 'REJECTED', number: ok.body.number, reason: null, roleIds: [], removeRoleIds: [] });
    expect(JSON.stringify(decided.payload)).not.toContain('INTERNAL-NOTE');
  });
  it('web submissions are unchanged: no Discord id, no DM', async () => {
    await prisma.discordOutbox.deleteMany({ where: { type: 'application.decided' } });
    const r = await http().post('/api/v1/applications').send({ robloxUsername: 'Web_Applicant', answers });
    expect(r.status).toBe(201);
    expect((await prisma.application.findFirstOrThrow({ where: { number: r.body.number } })).source).toBe('WEB');
  });
});
