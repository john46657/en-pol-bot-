import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ErlcService } from '../src/cad/erlc.service';
import { ErlcClient } from '../src/cad/erlc-client';
import { encryptSecret } from '../src/cad/erlc-crypto';
import { DiscordService } from '../src/discord/discord.service';

/**
 * Automatischer ER:LC-Fahndungsabgleich gegen eine gefälschte ER:LC-API (GET /v2/server, Spieler als „Name:RobloxId“ wie in der Doku).
 * Geprüft wird über echte Abrufe (ErlcService.poll) – so wie der Planer im Betrieb.
 */
let app: INestApplication; let prisma: PrismaService; let erlc: ErlcService;
let replies: (() => Response | Promise<Response>)[] = [];
const players = (...ps: string[]) => () => new Response(JSON.stringify({ Name: 'EN', CurrentPlayers: ps.length, MaxPlayers: 40, Players: ps.map((p) => ({ Player: p, Team: 'Civilian', Permission: 'Normal', WantedStars: 0 })) }), { status: 200, headers: { 'content-type': 'application/json' } });
const down = () => () => Promise.reject(new TypeError('fetch failed'));
const CHANNEL = '720000000000000001';
let serverId = '';
const ids: Record<string, string> = {};
let channelsBefore: unknown;

async function poll(reply: () => Response | Promise<Response>) {
  replies = [reply];
  const r = await erlc.poll(serverId, true);
  expect(replies).toHaveLength(0); // genau eine Anfrage je Abruf – der Abgleich kostet keine zusätzlichen API-Aufrufe
  return r;
}
const hits = () => prisma.wantedHit.findMany({ where: { erlcServerId: serverId }, orderBy: { detectedAt: 'asc' } });
const hitCount = () => prisma.wantedHit.count({ where: { erlcServerId: serverId } });

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  erlc = app.get(ErlcService);
  erlc.useClient(new ErlcClient(async () => { const n = replies.shift(); if (!n) throw new Error('no fake reply'); return n(); }, 'https://erlc.test'));
  await makeUser(prisma, 'wm_admin', ['System Administrator']);
  await makeUser(prisma, 'wm_member', ['Police Member']);
  await makeUser(prisma, 'wm_super', ['Police Member', 'Supervisor']);
  serverId = (await prisma.erlcServer.create({ data: { name: 'EN Haupt', keyCipher: encryptSecret('SecretKey-1234567890'), features: ['players'], pollSeconds: 10 } })).id;
  channelsBefore = (await prisma.systemSetting.findUnique({ where: { key: 'discord.channels' } }))?.value;
  await prisma.systemSetting.upsert({ where: { key: 'discord.channels' }, create: { key: 'discord.channels', value: { wanted: CHANNEL } }, update: { value: { wanted: CHANNEL } } });
  const admin = (await login(app, 'wm_admin')).agent;
  const person = async (robloxUsername: string, robloxUserId?: string) => { const r = await admin.post('/api/v1/persons').send({ robloxUsername, ...(robloxUserId ? { robloxUserId } : {}) }); expect(r.body.person).toMatchObject({ id: expect.any(String) }); return r.body.person.id as string; };
  const wanted = async (personId: string, reason: string) => { const r = await admin.post('/api/v1/wanted').send({ personId, reason, priority: 'HIGH', description: 'Bewaffnet, Adresse Musterstraße 1' }); expect(r.status).toBe(201); return r.body.id as string; };
  ids.robber = await person('Wm_Robber', '777000111');
  ids.robberW = await wanted(ids.robber, 'Bankraub');
  ids.nameOnly = await person('Wm_NameOnly');
  ids.nameOnlyW = await wanted(ids.nameOnly, 'Fahrerflucht');
  ids.old = await person('Wm_OldCase', '777000555');
  ids.oldW = await wanted(ids.old, 'Alter Fall');
  expect((await admin.post(`/api/v1/wanted/${ids.oldW}/clear`).send({ reason: 'erledigt' })).status).toBe(201);
  expect((await admin.post(`/api/v1/wanted/${ids.oldW}/archive`).send({ reason: 'archivieren' })).status).toBe(201);
  ids.clean = await person('Wm_Clean', '777000777');
});
afterAll(async () => {
  // Nichts für andere Testdateien hinterlassen (gemeinsame Test-DB): ER:LC-Server (Sitzungen per Cascade) und Einstellungen
  await prisma.erlcServer.deleteMany({ where: { id: serverId } });
  await prisma.systemSetting.deleteMany({ where: { key: { in: ['wanted.erlcMatch', 'wanted.erlcMatch.state'] } } });
  if (channelsBefore === undefined) await prisma.systemSetting.deleteMany({ where: { key: 'discord.channels' } });
  else await prisma.systemSetting.update({ where: { key: 'discord.channels' }, data: { value: channelsBefore as never } });
  await app.close();
});

describe('ER:LC-Fahndungsabgleich', () => {
  it('confirms a hit only on an exact Roblox-ID match and notifies dashboard + Discord once', async () => {
    const r = await poll(players('Wm_Robber:777000111', 'Wm_Clean:777000777', 'Wm_OldCase:777000555', 'Wm_Random:777000888'));
    expect(r.ok).toBe(true);
    const h = await hits();
    // Kein Fahndungseintrag (Wm_Clean, Random) und archivierte Fahndung (Wm_OldCase) → kein Treffer
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ wantedId: ids.robberW, personId: ids.robber, playerName: 'Wm_Robber', robloxUserId: '777000111', matchType: 'ROBLOX_ID', reviewStatus: 'CONFIRMED', wantedReason: 'Bankraub', wantedPriority: 'HIGH', erlcServerName: 'EN Haupt', notifyStatus: 'QUEUED' });
    const out = await prisma.discordOutbox.findMany({ where: { type: 'wanted.hit' } });
    expect(out).toHaveLength(1);
    expect(out[0]!.payload).toMatchObject({ player: 'Wm_Robber', robloxUserId: '777000111', reason: 'Bankraub', confirmed: true, channelIds: [CHANNEL], reference: expect.stringMatching(/^FA-[0-9A-F]{8}$/) });
    expect(JSON.stringify(out[0]!.payload)).not.toContain('Musterstraße'); // keine unnötigen sensiblen Daten
    const n = await prisma.notification.findMany({ where: { type: 'wanted.hit', title: { contains: 'Wm_Robber' } } });
    expect(n.length).toBeGreaterThan(0);
    expect(new Set(n.map((x) => x.userId)).size).toBe(n.length); // je Empfänger genau eine
    // nichts im Spiel ausgelöst: es gab keinen Befehl
    expect(await prisma.erlcCommandLog.count({ where: { serverId } })).toBe(0);
  });

  it('a player staying online over several polls creates no further hits or messages', async () => {
    for (let i = 0; i < 3; i++) await poll(players('Wm_Robber:777000111', 'Wm_Clean:777000777', 'Wm_OldCase:777000555', 'Wm_Random:777000888'));
    expect(await hitCount()).toBe(1);
    expect(await prisma.discordOutbox.count({ where: { type: 'wanted.hit' } })).toBe(1);
    expect(await prisma.erlcPlayerSession.count({ where: { erlcServerId: serverId, leftAt: null } })).toBe(4);
  });

  it('same name but different Roblox-ID → only a possible match, flagged for manual review, not posted to Discord by default', async () => {
    await poll(players('Wm_Robber:777000111', 'Wm_NameOnly:777004242'));
    let h = await prisma.wantedHit.findMany({ where: { wantedId: ids.nameOnlyW } });
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ matchType: 'NAME', reviewStatus: 'PENDING', robloxUserId: '777004242', notifyStatus: 'NONE' });
    expect(h[0]!.matchNote).toContain('keine Roblox-ID');
    // Akte bleibt unverändert: keine ID über den Namen nachgetragen, kein Duplikat
    expect((await prisma.person.findUniqueOrThrow({ where: { id: ids.nameOnly } })).robloxUserId).toBeNull();
    expect(await prisma.person.count({ where: { robloxUsername: { equals: 'Wm_NameOnly', mode: 'insensitive' } } })).toBe(1);
    // Spieler mit gleichem Namen wie der ID-Gesuchte, aber anderer ID
    await poll(players('Wm_Robber:777000111', 'Wm_NameOnly:777004242', 'wm_robber:777000999'));
    h = await prisma.wantedHit.findMany({ where: { robloxUserId: '777000999' } });
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ wantedId: ids.robberW, matchType: 'NAME', reviewStatus: 'PENDING' });
    expect(h[0]!.matchNote).toContain('weicht von der Akte ab');
    expect(await prisma.discordOutbox.count({ where: { type: 'wanted.hit' } })).toBe(1);
  });

  it('leaving and rejoining starts a new session → exactly one new hit', async () => {
    await poll(players('Wm_NameOnly:777004242'));
    expect(await prisma.erlcPlayerSession.count({ where: { playerKey: 'id:777000111', leftAt: { not: null } } })).toBe(1);
    await poll(players('Wm_NameOnly:777004242', 'Wm_Robber:777000111'));
    const h = await prisma.wantedHit.findMany({ where: { robloxUserId: '777000111' } });
    expect(h).toHaveLength(2);
    expect(h[0]!.sessionId).not.toBe(h[1]!.sessionId);
    expect(await prisma.discordOutbox.count({ where: { type: 'wanted.hit' } })).toBe(2);
  });

  it('API outage: no invented hits, sessions and data kept, status shown, sync resumes afterwards', async () => {
    const before = await hitCount();
    const r = await poll(down());
    expect(r.ok).toBe(false);
    expect(await hitCount()).toBe(before);
    expect(await prisma.erlcPlayerSession.count({ where: { erlcServerId: serverId, leftAt: null } })).toBe(2); // nichts geschlossen
    const member = (await login(app, 'wm_member')).agent;
    const s = await member.get('/api/v1/wanted-hits/summary');
    expect(s.status).toBe(200);
    const srv = s.body.servers.find((x: { id: string }) => x.id === serverId);
    expect(srv).toMatchObject({ status: 'OFFLINE', playersEnabled: true, lastError: expect.stringContaining('nicht erreichbar') });
    expect(srv.lastSyncAt).toBeTruthy();
    expect(srv.match.lastOkAt).toBeTruthy();
    expect(JSON.stringify(s.body)).not.toContain('SecretKey');
    // nach dem Ausfall: gleiche Spieler → keine erneuten Treffer
    await poll(players('Wm_NameOnly:777004242', 'Wm_Robber:777000111'));
    expect(await hitCount()).toBe(before);
  });

  it('a failed Discord delivery keeps the hit and shows the failure', async () => {
    const hit = (await prisma.wantedHit.findMany({ where: { notifyStatus: 'QUEUED' }, orderBy: { detectedAt: 'desc' } }))[0]!;
    const discord = app.get(DiscordService);
    for (let i = 0; i < 5; i++) await discord.ack(hit.notifyOutboxId!, false, `${CHANNEL}: Missing Access`);
    const member = (await login(app, 'wm_member')).agent;
    const r = await member.get(`/api/v1/wanted-hits/${hit.id}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ delivery: 'FAILED', deliveryError: expect.stringContaining('Missing Access'), reviewStatus: 'CONFIRMED', wanted: { status: 'ACTIVE' } });
    // erfolgreiche Zustellung des anderen Treffers
    const other = (await prisma.wantedHit.findMany({ where: { notifyStatus: 'QUEUED', id: { not: hit.id } } }))[0]!;
    await discord.ack(other.notifyOutboxId!, true);
    expect((await member.get(`/api/v1/wanted-hits/${other.id}`)).body.delivery).toBe('SENT');
  });

  it('Discord notification without a configured channel is skipped (hit still stored)', async () => {
    await prisma.systemSetting.update({ where: { key: 'discord.channels' }, data: { value: {} } });
    await poll(players('Wm_NameOnly:777004242'));
    await poll(players('Wm_NameOnly:777004242', 'Wm_Robber:777000111'));
    const last = (await prisma.wantedHit.findMany({ where: { robloxUserId: '777000111' }, orderBy: { detectedAt: 'desc' } }))[0]!;
    expect(last).toMatchObject({ reviewStatus: 'CONFIRMED', notifyStatus: 'SKIPPED', notifyError: expect.stringContaining('Kein Discord-Kanal') });
    await prisma.systemSetting.update({ where: { key: 'discord.channels' }, data: { value: { wanted: CHANNEL } } });
  });

  it('permissions are checked on the server; review confirms a possible match and can store the Roblox-ID', async () => {
    const pending = (await prisma.wantedHit.findFirstOrThrow({ where: { wantedId: ids.nameOnlyW, reviewStatus: 'PENDING' } }));
    const member = (await login(app, 'wm_member')).agent;
    const sup = (await login(app, 'wm_super')).agent;
    expect((await member.get('/api/v1/wanted-hits?status=PENDING')).body.items.length).toBeGreaterThan(0);
    expect((await member.post(`/api/v1/wanted-hits/${pending.id}/review`).send({ decision: 'VERIFIED', note: 'Stimmt' })).status).toBe(403);
    expect((await member.put('/api/v1/wanted-hits/settings').send({ notifyPossible: true })).status).toBe(403);
    expect((await sup.post(`/api/v1/wanted-hits/${pending.id}/review`).send({ decision: 'VERIFIED' })).status).toBe(400); // Begründung Pflicht
    const ok = await sup.post(`/api/v1/wanted-hits/${pending.id}/review`).send({ decision: 'VERIFIED', note: 'Im Spiel überprüft', storeRobloxId: true });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ reviewStatus: 'VERIFIED', robloxIdStored: true });
    expect((await sup.post(`/api/v1/wanted-hits/${pending.id}/review`).send({ decision: 'DISMISSED', note: 'doch nicht' })).status).toBe(409);
    expect((await prisma.person.findUniqueOrThrow({ where: { id: ids.nameOnly } })).robloxUserId).toBe('777004242');
    expect(await prisma.auditLog.count({ where: { action: 'wanted.hit_verified', entityId: pending.id } })).toBe(1);
    // Ab jetzt ist die Person über die ID eindeutig erkennbar
    await poll(players('Wm_Robber:777000111'));
    await poll(players('Wm_Robber:777000111', 'Wm_NameOnly:777004242'));
    const latest = (await prisma.wantedHit.findMany({ where: { wantedId: ids.nameOnlyW }, orderBy: { detectedAt: 'desc' } }))[0]!;
    expect(latest).toMatchObject({ matchType: 'ROBLOX_ID', reviewStatus: 'CONFIRMED' });
    // falscher ID-Treffer kann verworfen werden
    const d = await sup.post(`/api/v1/wanted-hits/${latest.id}/review`).send({ decision: 'DISMISSED', note: 'Falsche ID in der Akte' });
    expect(d.status).toBe(201);
  });

  it('settings: switching the match off stops new hits; possible matches can optionally go to Discord', async () => {
    const admin = (await login(app, 'wm_admin')).agent;
    expect((await admin.put('/api/v1/wanted-hits/settings').send({ enabled: false })).body.enabled).toBe(false);
    const before = await hitCount();
    await poll(players());
    await poll(players('Wm_Robber:777000111'));
    expect(await hitCount()).toBe(before);
    expect((await admin.put('/api/v1/wanted-hits/settings').send({ enabled: true, notifyPossible: true, channelId: '720000000000000002' })).status).toBe(200);
    expect((await admin.put('/api/v1/wanted-hits/settings').send({ channelId: 'abc' })).status).toBe(400);
    await poll(players('Wm_Robber:777000111', 'Wm_Robber:777031337'));
    const out = (await prisma.discordOutbox.findMany({ where: { type: 'wanted.hit' }, orderBy: { createdAt: 'desc' }, take: 1 }))[0]!;
    expect(out.payload).toMatchObject({ robloxUserId: '777031337', confirmed: false, channelIds: ['720000000000000002'] });
  });

  it('players feature off: nothing is matched, the reason is shown; history survives an archived wanted record', async () => {
    await prisma.erlcServer.update({ where: { id: serverId }, data: { features: [] } });
    const before = await hitCount();
    replies = [() => new Response(JSON.stringify({ Name: 'EN', CurrentPlayers: 1, MaxPlayers: 40 }), { status: 200 })];
    await erlc.poll(serverId, true);
    expect(await hitCount()).toBe(before);
    const admin = (await login(app, 'wm_admin')).agent;
    const s = (await admin.get('/api/v1/wanted-hits/summary')).body;
    expect(s.servers.find((x: { id: string }) => x.id === serverId)).toMatchObject({ playersEnabled: false, match: { lastError: expect.stringContaining('nicht freigegeben') } });
    await prisma.erlcServer.update({ where: { id: serverId }, data: { features: ['players'] } });
    // Fahndung erledigt + archiviert → Treffer-Historie bleibt, Status ist sichtbar
    expect((await admin.post(`/api/v1/wanted/${ids.robberW}/clear`).send({ reason: 'gefasst' })).status).toBe(201);
    expect((await admin.post(`/api/v1/wanted/${ids.robberW}/archive`).send({ reason: 'abgeschlossen' })).status).toBe(201);
    const list = (await admin.get(`/api/v1/wanted-hits?wantedId=${ids.robberW}&pageSize=100`)).body;
    expect(list.total).toBeGreaterThanOrEqual(3);
    expect(list.items[0].wanted.status).toBe('ARCHIVED');
    const now = await hitCount();
    await poll(players());
    await poll(players('Wm_Robber:777000111'));
    expect(await hitCount()).toBe(now); // archivierte Fahndung löst nichts mehr aus
  });
});
