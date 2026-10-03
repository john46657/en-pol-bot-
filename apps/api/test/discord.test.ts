import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const TOKEN = 'test-bot-token-0123456789-abcdefghijklmnop';
let app: INestApplication; let prisma: PrismaService;
const http = () => request(app.getHttpServer());
const bot = (discordId?: string) => ({ Authorization: `Bot ${TOKEN}`, ...(discordId ? { 'X-Discord-User': discordId } : {}) });
const D1 = '100000000000000001', D2 = '100000000000000002', D3 = '100000000000000003';

async function link(username: string, discordId: string) {
  const { agent } = await login(app, username);
  const { body } = await agent.post('/api/v1/discord/link-code');
  const r = await http().post('/api/v1/bot/link').set(bot()).send({ code: body.code, discordId });
  expect(r.status).toBe(200);
}

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'd_admin', ['System Administrator']);
  await makeUser(prisma, 'd_off', ['Police Member']);
  await makeUser(prisma, 'd_none', []);
  await makeUser(prisma, 'd_sup', ['Police Member', 'Supervisor']);
  await link('d_off', D1);
  await link('d_none', D2);
});
afterAll(async () => {
  await prisma.systemSetting.deleteMany({ where: { key: 'discord.channels' } });
  delete process.env.BOT_API_TOKEN;
  await app.close();
});

describe('linking', () => {
  it('codes are single-use, time-limited, hashed, and one Discord account maps to one user', async () => {
    const { agent } = await login(app, 'd_sup');
    const { body } = await agent.post('/api/v1/discord/link-code');
    expect(body.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const rows = await prisma.discordLinkCode.findMany({ where: { usedAt: null } });
    expect(rows.every((r) => !r.codeHash.includes(body.code.replace('-', '')))).toBe(true); // nur Hash gespeichert
    expect((await http().post('/api/v1/bot/link').set(bot()).send({ code: 'AAAA-BBBB', discordId: D3 })).status).toBe(400); // falscher Code
    expect((await http().post('/api/v1/bot/link').set(bot()).send({ code: body.code, discordId: D1 })).status).toBe(409); // D1 gehört d_off
    // abgelaufen
    await prisma.discordLinkCode.updateMany({ where: { usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await http().post('/api/v1/bot/link').set(bot()).send({ code: body.code, discordId: D3 })).status).toBe(400);
    const fresh = (await agent.post('/api/v1/discord/link-code')).body.code;
    expect((await http().post('/api/v1/bot/link').set(bot()).send({ code: fresh.toLowerCase(), discordId: D3 })).status).toBe(200); // Eingabe ohne Beachtung der Groß-/Kleinschreibung
    expect((await http().post('/api/v1/bot/link').set(bot()).send({ code: fresh, discordId: D3 })).status).toBe(400); // einmalig
    expect((await agent.post('/api/v1/discord/link-code')).status).toBe(409); // bereits verknüpft
    expect(await prisma.auditLog.count({ where: { action: 'discord.link' } })).toBeGreaterThanOrEqual(3);
  });
  it('users and admins can unlink; the bot then loses access', async () => {
    const { agent } = await login(app, 'd_sup');
    expect((await http().get('/api/v1/persons').set(bot(D3))).status).toBe(200);
    expect((await agent.delete('/api/v1/discord/link')).status).toBe(204);
    expect((await http().get('/api/v1/persons').set(bot(D3))).status).toBe(401);
    const adm = (await login(app, 'd_admin')).agent;
    const u = await prisma.user.findUniqueOrThrow({ where: { username: 'd_none' } });
    expect((await adm.delete(`/api/v1/discord/links/${u.id}`)).status).toBe(204);
    expect((await http().get('/api/v1/persons').set(bot(D2))).status).toBe(401);
    await link('d_none', D2); // wieder verknüpfen für spätere Tests
  });
});

describe('bot authentication & authorization', () => {
  it('rejects missing/wrong tokens (and logs security events) and does not accept session cookies on bot-only routes', async () => {
    expect((await http().get('/api/v1/bot/outbox')).status).toBe(401);
    expect((await http().get('/api/v1/bot/outbox').set({ Authorization: 'Bot wrong-token-wrong-token-wrong-token-xx' })).status).toBe(401);
    expect(await prisma.securityEvent.count({ where: { type: 'INVALID_TOKEN', detail: { contains: 'bot' } } })).toBeGreaterThanOrEqual(1);
    const { agent } = await login(app, 'd_admin');
    expect((await agent.get('/api/v1/bot/outbox')).status).toBe(401); // auch ein Admin-Cookie öffnet Bot-Routen nicht
    expect((await http().get('/api/v1/persons').set({ Authorization: 'Bot wrong-token-wrong-token-wrong-token-xx', 'X-Discord-User': D1 })).status).toBe(401);
  });
  it('requires a linked, active user; acts with exactly that user’s permissions', async () => {
    expect((await http().get('/api/v1/persons').set(bot())).status).toBe(400); // Header fehlt
    expect((await http().get('/api/v1/persons').set(bot('999999999999999999'))).status).toBe(401); // nicht verknüpft
    expect((await http().get('/api/v1/persons').set(bot(D1))).status).toBe(200); // d_off: persons.view
    expect((await http().get('/api/v1/persons').set(bot(D2))).status).toBe(403); // d_none: keine Rolle → kein Zugriff
    await prisma.user.update({ where: { username: 'd_off' }, data: { active: false } });
    expect((await http().get('/api/v1/persons').set(bot(D1))).status).toBe(401); // deaktiviert
    await prisma.user.update({ where: { username: 'd_off' }, data: { active: true } });
  });
  it('only allowlisted routes are reachable through the bot', async () => {
    for (const [m, p] of [['get', '/api/v1/users'], ['get', '/api/v1/audit'], ['post', '/api/v1/auth/logout'], ['put', '/api/v1/users/00000000-0000-4000-8000-000000000000/roles'], ['post', '/api/v1/roles'], ['put', '/api/v1/admin/settings/org.name'], ['get', '/api/v1/admin/settings'], ['get', '/api/v1/personnel'], ['post', '/api/v1/communication/channels/ANNOUNCEMENT/messages'], ['delete', '/api/v1/users/00000000-0000-4000-8000-000000000000/overrides/audit.view']] as const) {
      const r = await http()[m](p).set(bot(D1)).send({});
      expect(r.status, `${m} ${p}`).toBe(403);
      expect(r.body.message).toMatch(/not available to the bot/);
    }
  });
  it('writes through the bot are attributed to the linked user and audited', async () => {
    const adm = (await login(app, 'd_admin')).agent;
    const person = (await adm.post('/api/v1/persons').send({ robloxUsername: 'Bot_Target' })).body.person;
    const t = await http().post('/api/v1/tickets').set(bot(D1)).send({ personId: person.id, reason: 'Parking via Discord' });
    expect(t.status).toBe(201);
    const u = await prisma.user.findUniqueOrThrow({ where: { username: 'd_off' } });
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: t.body.id } })).officerId).toBe(u.id);
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: 'ticket.create', entityId: t.body.id } })).actorUserId).toBe(u.id);
    // Leitstellen-Recht fehlt → 403 auch über den Bot
    expect((await http().post('/api/v1/incidents').set(bot(D2)).send({ title: 'Nope nope' })).status).toBe(403);
    // Dienststatus über den Bot
    expect((await http().put('/api/v1/team/me/status').set(bot(D1)).send({ status: 'ON_DUTY' })).status).toBe(200);
  });
  it('new allowlisted write routes still enforce the user\u2019s own permissions', async () => {
    const adm = (await login(app, 'd_admin')).agent;
    const person = (await adm.post('/api/v1/persons').send({ robloxUsername: 'Bot_Perm_Target' })).body.person;
    // d_off (Police Member): Bericht ja, Fahndung/Ermittlung/Beweis nein?  -> Police Member hat reports.create + evidence.create + complaints.create
    expect((await http().post('/api/v1/reports').set(bot(D1)).send({ type: 'PATROL', title: 'Via Discord', content: { body: 'text' } })).status).toBe(201);
    expect((await http().post('/api/v1/complaints').set(bot(D1)).send({ category: 'Conduct', description: 'Filed through the Discord bot.' })).status).toBe(201);
    expect((await http().post('/api/v1/evidence').set(bot(D1)).send({ type: 'Photo', description: 'Scene photo' })).status).toBe(201);
    expect((await http().post('/api/v1/wanted').set(bot(D1)).send({ personId: person.id, reason: 'Nope' })).status).toBe(403); // wanted.create fehlt
    expect((await http().post('/api/v1/investigations').set(bot(D1)).send({ title: 'Nope nope' })).status).toBe(403); // investigations.create fehlt
    expect((await http().get('/api/v1/auth/me').set(bot(D1))).body.username).toBe('d_off');
    // Unlink über den Bot (eigene Verknüpfung)
    const d4 = '100000000000000004';
    await makeUser(prisma, 'd_tmp', ['Police Member']);
    await link('d_tmp', d4);
    expect((await http().delete('/api/v1/discord/link').set(bot(d4))).status).toBe(204);
    expect((await http().get('/api/v1/auth/me').set(bot(d4))).status).toBe(401);
  });
  it('bot access is fully disabled when BOT_API_TOKEN is not configured', async () => {
    const saved = process.env.BOT_API_TOKEN; delete process.env.BOT_API_TOKEN;
    const t = await createTestApp();
    const r = await request(t.app.getHttpServer()).get('/api/v1/persons').set(bot(D1));
    expect(r.status).toBe(401);
    expect((await request(t.app.getHttpServer()).get('/api/v1/bot/outbox').set(bot())).status).toBe(401);
    await t.app.close();
    process.env.BOT_API_TOKEN = saved;
  });
});

describe('outbox', () => {
  it('only queues when channels are configured; bot polls and acknowledges; failed sends are retried up to 5 times', async () => {
    const disp = (await login(app, 'd_admin')).agent;
    await prisma.discordOutbox.deleteMany();
    await disp.post('/api/v1/incidents').send({ title: 'Before config' });
    expect(await prisma.discordOutbox.count()).toBe(0); // kein Channel → kein Datenanfall

    expect((await disp.put('/api/v1/admin/settings/discord.channels').send({ value: { dispatch: 'abc' } })).status).toBe(400); // ungültige ID
    expect((await disp.put('/api/v1/admin/settings/discord.channels').send({ value: { dispatch: '200000000000000001, abc' } })).status).toBe(400); // eine ungültige in der Liste
    expect((await disp.put('/api/v1/admin/settings/discord.channels').send({ value: { dispatch: '200000000000000001, 200000000000000009', wanted: '200000000000000002', announcements: '200000000000000003' } })).status).toBe(200);
    const inc = (await disp.post('/api/v1/incidents').send({ title: 'Bank alarm', priority: 'HIGH', location: 'Main St' })).body;
    const unit = (await disp.post('/api/v1/dispatch/units').send({ callsign: 'dc-1' })).body;
    await disp.put(`/api/v1/dispatch/units/${unit.id}/status`).send({ status: 'AVAILABLE' });
    await disp.post(`/api/v1/dispatch/incidents/${inc.id}/assign`).send({ unitId: unit.id });
    const person = (await disp.post('/api/v1/persons').send({ robloxUsername: 'Outbox_Guy' })).body.person;
    await disp.post('/api/v1/wanted').send({ personId: person.id, reason: 'Robbery' });
    await disp.post('/api/v1/communication/channels/ANNOUNCEMENT/messages').send({ body: 'Briefing at 20:00' });

    const list = (await http().get('/api/v1/bot/outbox').set(bot())).body as { id: string; type: string; channelKey: string; payload: Record<string, string> }[];
    expect(list.map((i) => i.type)).toEqual(['incident.created', 'incident.assigned', 'wanted.created', 'announcement']);
    expect(list[0]).toMatchObject({ channelKey: 'dispatch', payload: { title: 'Bank alarm', priority: 'HIGH', location: 'Main St' } });
    expect(list[1]!.payload.callsign).toBe('DC-1');
    expect(list[2]).toMatchObject({ channelKey: 'wanted', payload: { subject: 'Outbox_Guy', kind: 'person' } });
    expect(JSON.stringify(list)).not.toMatch(/robloxUserId|passwordHash|notes/);

    expect((await http().get('/api/v1/bot/config').set(bot())).body).toMatchObject({ dispatch: '200000000000000001, 200000000000000009' });
    expect((await http().post(`/api/v1/bot/outbox/${list[0]!.id}/ack`).set(bot()).send({ ok: true })).status).toBe(204);
    expect((await http().post(`/api/v1/bot/outbox/${list[0]!.id}/ack`).set(bot()).send({ ok: true })).status).toBe(404); // schon quittiert
    for (let i = 0; i < 5; i++) expect((await http().post(`/api/v1/bot/outbox/${list[1]!.id}/ack`).set(bot()).send({ ok: false, error: 'Missing Access' })).status).toBe(204);
    const after = (await http().get('/api/v1/bot/outbox').set(bot())).body as { id: string }[];
    expect(after.map((i) => i.id)).toEqual([list[2]!.id, list[3]!.id]); // erledigte und 5x fehlgeschlagene fallen raus
    expect((await prisma.discordOutbox.findUniqueOrThrow({ where: { id: list[1]!.id } })).lastError).toBe('Missing Access');
  });
});
