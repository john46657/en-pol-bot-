import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser, registerServer } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ErlcService } from '../src/cad/erlc.service';
import { ErlcClient } from '../src/cad/erlc-client';
import { DiscordService } from '../src/discord/discord.service';

const HOME = '640000000000000001';
const CH = { hits: '650000000000000001', possible: '650000000000000002' };

let app: INestApplication; let prisma: PrismaService; let erlc: ErlcService; let discord: DiscordService;
let serverId = '';

/** Gefälschte ER:LC-API: Antworten der Reihe nach; mitgeschrieben werden Methode + Pfad (es darf nie ein Befehl gesendet werden). */
const sent: { method: string; path: string }[] = [];
let replies: (() => Response)[] = [];
const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const server = (players: string[], joinLogs: { player: string; ts: number }[] = [], stars: Record<string, number> = {}) => json(200, {
  Name: 'EN Test', OwnerId: 1, CoOwnerIds: [], CurrentPlayers: players.length, MaxPlayers: 40, JoinKey: 'ENTEST', AccVerifiedReq: 'Disabled', TeamBalance: true,
  Players: players.map((p) => ({ Player: p, Team: 'Civilian', Permission: 'Normal', WantedStars: stars[p] ?? 0 })),
  JoinLogs: joinLogs.map((j) => ({ Join: true, Timestamp: j.ts, Player: j.player })),
});
const poll = async (reply: () => Response) => { replies = [reply]; return erlc.poll(serverId, true); };
const hits = () => prisma.erlcWantedHit.findMany({ orderBy: { detectedAt: 'asc' } });

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  erlc = app.get(ErlcService);
  discord = app.get(DiscordService);
  erlc.useClient(new ErlcClient(async (url, init) => {
    sent.push({ method: String(init.method), path: url.replace('https://erlc.test', '') });
    const next = replies.shift();
    if (!next) throw new Error('no fake reply');
    return next();
  }, 'https://erlc.test'));
  await makeUser(prisma, 'wh_admin', ['System Administrator']);
  await makeUser(prisma, 'wh_officer', ['Police Member']);
  await makeUser(prisma, 'wh_senior', ['Police Member', 'Senior Officer']);
  await makeUser(prisma, 'wh_nobody', []);
  await registerServer(prisma, HOME, (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id));
});
afterAll(async () => { await app.close(); });

describe('ER:LC-Fahndungsabgleich', () => {
  const ids = { wantedA: '', wantedB: '', archived: '', personA: '', personB: '', personC: '' };

  it('setup: ER:LC-Server, Personen mit/ohne Roblox-ID, aktive und archivierte Fahndungen, Discord-Kanäle', async () => {
    const admin = (await login(app, 'wh_admin')).agent;
    const r = await admin.post('/api/v1/erlc/servers').send({ name: 'Fahndung Testserver', key: 'SuperSecretServerKey-1234567890', guildId: HOME, pollSeconds: 15, features: ['players', 'joinLogs'] });
    expect(r.status).toBe(201);
    serverId = r.body.id;
    const g = { 'X-Guild-Id': HOME };
    // A: Roblox-ID bekannt · B: Name bekannt, andere ID · C: nur Name (ohne ID), gesucht · D: ohne Fahndung
    const person = async (d: Record<string, unknown>) => (await admin.post('/api/v1/persons').set(g).send(d)).body.person?.id as string;
    ids.personA = await person({ robloxUsername: 'BadGuy', robloxUserId: '771001' });
    ids.personB = await person({ robloxUsername: 'SameName', robloxUserId: '772002' });
    ids.personC = await person({ robloxUsername: 'NoIdGuy', aliases: ['Shadow'] });
    const personArchived = await person({ robloxUsername: 'OldCase', robloxUserId: '774004' });
    for (const id of [ids.personA, ids.personB, ids.personC, personArchived]) expect(id).toBeTruthy();
    const mk = async (personId: string, reason: string) => { const w = await admin.post('/api/v1/wanted').set(g).send({ personId, reason, priority: 'HIGH' }); expect(w.status).toBe(201); return w.body; };
    const a = await mk(ids.personA, 'Bankraub Hauptstraße');
    expect(a.number).toMatch(/^F-\d{4}-[A-Z2-9]{6}$/);
    ids.wantedA = a.id;
    ids.wantedB = (await mk(ids.personB, 'Fahrerflucht')).id;
    await mk(ids.personC, 'Körperverletzung');
    ids.archived = (await mk(personArchived, 'Alter Fall')).id;
    expect((await admin.post(`/api/v1/wanted/${ids.archived}/cancel`).set(g).send({ reason: 'erledigt' })).status).toBe(201);
    expect((await admin.post(`/api/v1/wanted/${ids.archived}/archive`).set(g).send({ reason: 'abgelegt' })).status).toBe(201);
    // Discord: nur bestätigte Treffer in Kanal „hits“, mögliche in „possible“
    const cfg = await admin.put('/api/v1/cad/config').set(g).send({ homeGuildId: HOME, routes: [
      { id: 'w1', guildId: HOME, event: 'wanted.hit', channelIds: [CH.hits], pingRoleIds: [], enabled: true },
      { id: 'w2', guildId: HOME, event: 'wanted.possible', channelIds: [CH.possible], pingRoleIds: [], enabled: true },
    ] });
    expect(cfg.status).toBe(200);
  });

  it('kein Fahndungseintrag / archivierte Fahndung → kein Treffer', async () => {
    expect(await poll(server(['Harmless:773003', 'OldCase:774004']))).toMatchObject({ ok: true });
    expect(await hits()).toHaveLength(0);
    expect((await prisma.erlcServer.findUniqueOrThrow({ where: { id: serverId } })).wantedCheckAt).toBeTruthy();
  });

  it('Spieler tritt bei, Roblox-ID stimmt → bestätigter Treffer mit Fahndung, Grund, Priorität, Zeitpunkt und genau einer Discord-Meldung', async () => {
    await poll(server(['Harmless:773003', 'OldCase:774004', 'BadGuy:771001']));
    const h = await hits();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ wantedId: ids.wantedA, playerName: 'BadGuy', robloxUserId: '771001', matchType: 'ROBLOX_ID', identified: true, reviewStatus: 'NEW', wantedReason: 'Bankraub Hauptstraße', wantedPriority: 'HIGH', notifyStatus: 'QUEUED' });
    const out = await prisma.discordOutbox.findMany({ where: { type: { startsWith: 'cad.wanted.' } } });
    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe('cad.wanted.hit');
    expect(out[0]!.payload).toMatchObject({ playerName: 'BadGuy', robloxUserId: '771001', identified: true, channelIds: [CH.hits] });
    expect(JSON.stringify(out[0]!.payload)).not.toContain('SuperSecretServerKey');
    // Dashboard-Ansicht
    const officer = (await login(app, 'wh_officer')).agent;
    const list = (await officer.get('/api/v1/wanted-hits')).body;
    expect(list.items[0]).toMatchObject({ playerName: 'BadGuy', robloxUserId: '771001', identification: 'Bestätigt (Roblox-ID)', wantedStatus: 'ACTIVE', priority: 'HIGH', reason: 'Bankraub Hauptstraße' });
    expect(list.items[0].wantedNumber).toMatch(/^F-/);
    expect(list.items[0].detectedAt).toBeTruthy();
  });

  it('Spieler bleibt über mehrere Abfragen online → kein weiterer Treffer, keine weitere Meldung', async () => {
    for (let i = 0; i < 3; i++) await poll(server(['Harmless:773003', 'BadGuy:771001']));
    expect(await hits()).toHaveLength(1);
    expect(await prisma.discordOutbox.count({ where: { type: { startsWith: 'cad.wanted.' } } })).toBe(1);
  });

  it('gleicher Name, andere Roblox-ID → nur „Mögliche Übereinstimmung“, nicht identifiziert, eigener Kanal', async () => {
    await poll(server(['BadGuy:771001', 'SameName:779999']));
    const h = (await hits()).find((x) => x.wantedId === ids.wantedB)!;
    expect(h).toMatchObject({ matchType: 'NAME_ID_MISMATCH', identified: false, reviewStatus: 'REVIEW_REQUIRED', robloxUserId: '779999' });
    const out = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'cad.wanted.possible' } });
    expect(out.payload).toMatchObject({ identified: false, channelIds: [CH.possible] });
  });

  it('Name/Alias ohne gespeicherte ID → mögliche Übereinstimmung; die Personen-Übernahme ergänzt bei gesuchten Personen keine ID über den Namen', async () => {
    await poll(server(['BadGuy:771001', 'SameName:779999', 'NoIdGuy:775005']));
    const h = (await hits()).filter((x) => x.personId === ids.personC);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ matchType: 'NAME', identified: false, reviewStatus: 'REVIEW_REQUIRED' });
    expect((await prisma.person.findUniqueOrThrow({ where: { id: ids.personC } })).robloxUserId).toBeNull();
    // Alias trifft ebenfalls nur als mögliche Übereinstimmung (anderer Aufenthalt)
    await poll(server(['BadGuy:771001', 'SameName:779999', 'Shadow:776006']));
    expect((await hits()).find((x) => x.playerName === 'Shadow')).toMatchObject({ matchType: 'ALIAS', identified: false });
  });

  it('ohne Roblox-ID von der API: nur mögliche Übereinstimmung, keine vorgetäuschte Identität', async () => {
    await poll(server(['BadGuy:771001', 'BadGuy-Fake', 'NoIdGuy']));
    const noId = (await hits()).filter((x) => x.robloxUserId === null);
    expect(noId.length).toBeGreaterThan(0);
    expect(noId.every((x) => !x.identified && x.reviewStatus === 'REVIEW_REQUIRED')).toBe(true);
  });

  it('Spieler verlässt den Server und tritt erneut bei → neuer Aufenthalt, neuer Treffer', async () => {
    await poll(server(['Harmless:773003'])); // BadGuy weg
    await poll(server(['Harmless:773003', 'BadGuy:771001'])); // wieder da
    const a = (await hits()).filter((x) => x.wantedId === ids.wantedA && x.matchType === 'ROBLOX_ID');
    expect(a).toHaveLength(2);
    expect(a[0]!.sessionId).not.toBe(a[1]!.sessionId);
  });

  it('kurz raus und wieder rein zwischen zwei Abfragen: Join-Log zeigt den neuen Beitritt → neuer Aufenthalt', async () => {
    const before = (await hits()).filter((x) => x.wantedId === ids.wantedA).length;
    const session = await prisma.erlcPlayerPresence.findFirstOrThrow({ where: { serverId, playerKey: 'id:771001' } });
    // Der Beitritt, mit dem die Sitzung begann, zählt nicht erneut
    await poll(server(['Harmless:773003', 'BadGuy:771001'], [{ player: 'BadGuy:771001', ts: Math.floor(session.joinedAt.getTime() / 1000) }]));
    expect((await hits()).filter((x) => x.wantedId === ids.wantedA)).toHaveLength(before);
    // späterer Beitritt laut Join-Log
    await prisma.erlcPlayerPresence.update({ where: { id: session.id }, data: { joinedAt: new Date(Date.now() - 10 * 60_000), lastSeenAt: new Date(Date.now() - 5 * 60_000) } });
    await poll(server(['Harmless:773003', 'BadGuy:771001'], [{ player: 'BadGuy:771001', ts: Math.floor(Date.now() / 1000) - 60 }]));
    expect((await hits()).filter((x) => x.wantedId === ids.wantedA)).toHaveLength(before + 1);
  });

  it('API fällt vorübergehend aus → keine Treffer erfunden, Daten und Sitzungen bleiben, Status sichtbar; danach kein Doppeltreffer', async () => {
    const count = (await hits()).length;
    const sessions = await prisma.erlcPlayerPresence.count({ where: { serverId } });
    replies = [() => { throw new TypeError('fetch failed'); }];
    const down = await erlc.poll(serverId, true);
    expect(down).toMatchObject({ ok: false, status: 'OFFLINE' });
    expect((await hits()).length).toBe(count);
    expect(await prisma.erlcPlayerPresence.count({ where: { serverId } })).toBe(sessions);
    const officer = (await login(app, 'wh_officer')).agent;
    const st = (await officer.get('/api/v1/wanted-hits/status')).body.servers.find((x: { id: string }) => x.id === serverId);
    expect(st).toMatchObject({ status: 'OFFLINE', playersEnabled: true });
    expect(st.lastError).toBeTruthy();
    expect(st.lastSyncAt).toBeTruthy(); // letzte erfolgreiche Synchronisierung bleibt angezeigt
    // wieder erreichbar, dieselben Spieler → dieselben Aufenthalte, keine neuen Treffer
    await poll(server(['Harmless:773003', 'BadGuy:771001']));
    expect((await hits()).length).toBe(count);
    expect((await officer.get('/api/v1/wanted-hits/status')).body.servers.find((x: { id: string }) => x.id === serverId)).toMatchObject({ status: 'CONNECTED', lastError: null });
  });

  it('Server laut API leer (Code 3002) → Aufenthalte enden; danach neuer Treffer beim Beitritt', async () => {
    const count = (await hits()).filter((x) => x.wantedId === ids.wantedA).length;
    await poll(json(422, { code: 3002, message: 'Server offline' }));
    expect(await prisma.erlcPlayerPresence.count({ where: { serverId } })).toBe(0);
    await poll(server(['BadGuy:771001']));
    expect((await hits()).filter((x) => x.wantedId === ids.wantedA)).toHaveLength(count + 1);
  });

  it('Discord-Benachrichtigung schlägt fehl → Treffer bleibt, Zustellstatus zeigt den Fehler, keine neue Meldung je Abfrage', async () => {
    const officer = (await login(app, 'wh_officer')).agent;
    const latest = (await hits()).filter((x) => x.outboxId).pop()!;
    for (let i = 0; i < 5; i++) await discord.ack(latest.outboxId!, false, 'Missing Access');
    const item = (await officer.get('/api/v1/wanted-hits').query({ id: latest.id })).body.items[0];
    expect(item.notify).toMatchObject({ status: 'FAILED', attempts: 5, error: 'Missing Access' });
    // ohne Kanal: Treffer trotzdem gespeichert, Status „kein Kanal“
    const admin = (await login(app, 'wh_admin')).agent;
    await admin.put('/api/v1/cad/config').set({ 'X-Guild-Id': HOME }).send({ homeGuildId: HOME, routes: [] });
    await poll(server([]));
    await poll(server(['BadGuy:771001']));
    expect((await hits()).pop()).toMatchObject({ notifyStatus: 'NOT_CONFIGURED', identified: true });
    expect(await prisma.discordOutbox.count({ where: { id: latest.outboxId!, sentAt: null } })).toBe(1); // nichts doppelt eingereiht
  });

  it('Prüfung: Rechte serverseitig; mögliche Übereinstimmung bestätigen übernimmt auf Wunsch die Roblox-ID → nächster Beitritt eindeutig', async () => {
    const officer = (await login(app, 'wh_officer')).agent;
    const senior = (await login(app, 'wh_senior')).agent;
    const nobody = (await login(app, 'wh_nobody')).agent;
    expect((await nobody.get('/api/v1/wanted-hits')).status).toBe(403);
    const possible = (await hits()).find((x) => x.personId === ids.personC && x.robloxUserId === '775005')!;
    expect((await officer.post(`/api/v1/wanted-hits/${possible.id}/review`).send({ decision: 'CONFIRMED', note: 'geprüft' })).status).toBe(403); // ohne wanted.edit
    expect((await senior.post(`/api/v1/wanted-hits/${possible.id}/review`).send({ decision: 'ACKNOWLEDGED' })).status).toBe(400);
    expect((await senior.post(`/api/v1/wanted-hits/${possible.id}/review`).send({ decision: 'CONFIRMED' })).status).toBe(400); // Begründung fehlt
    const ok = await senior.post(`/api/v1/wanted-hits/${possible.id}/review`).send({ decision: 'CONFIRMED', note: 'Im RP-Gespräch identifiziert', linkRobloxId: true });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ reviewStatus: 'CONFIRMED', identified: true, robloxIdLinked: true });
    expect((await senior.post(`/api/v1/wanted-hits/${possible.id}/review`).send({ decision: 'REJECTED', note: 'doch nicht' })).status).toBe(409);
    expect((await prisma.person.findUniqueOrThrow({ where: { id: ids.personC } })).robloxUserId).toBe('775005');
    expect(await prisma.auditLog.count({ where: { action: 'wanted.hit.confirmed', entityId: possible.id } })).toBe(1);
    // Treffer per ID: nur „zur Kenntnis“
    const idHit = (await hits()).find((x) => x.matchType === 'ROBLOX_ID' && x.reviewStatus === 'NEW')!;
    expect((await senior.post(`/api/v1/wanted-hits/${idHit.id}/review`).send({ decision: 'REJECTED', note: 'xx yy' })).status).toBe(400);
    expect((await senior.post(`/api/v1/wanted-hits/${idHit.id}/review`).send({ decision: 'ACKNOWLEDGED' })).body).toMatchObject({ reviewStatus: 'ACKNOWLEDGED' });
    // NoIdGuy kommt wieder → jetzt eindeutig über die Roblox-ID
    await poll(server([]));
    await poll(server(['NoIdGuy:775005']));
    expect((await hits()).pop()).toMatchObject({ personId: ids.personC, matchType: 'ROBLOX_ID', identified: true });
  });

  it('Historie bleibt dauerhaft, auch wenn die Fahndung erledigt wird; erledigte Fahndungen treffen nicht mehr', async () => {
    const admin = (await login(app, 'wh_admin')).agent;
    const before = (await hits()).filter((x) => x.wantedId === ids.wantedA).length;
    expect((await admin.post(`/api/v1/wanted/${ids.wantedA}/clear`).set({ 'X-Guild-Id': HOME }).send({ reason: 'festgenommen' })).status).toBe(201);
    await poll(server([]));
    await poll(server(['BadGuy:771001']));
    const rows = (await hits()).filter((x) => x.wantedId === ids.wantedA);
    expect(rows).toHaveLength(before);
    const view = (await admin.get('/api/v1/wanted-hits').query({ wantedId: ids.wantedA })).body.items;
    expect(view[0]).toMatchObject({ wantedStatus: 'CLEARED' });
  });

  it('Fahndung unter „Alle Server“ angelegt → gehört zum Bereich der Person und wird abgeglichen; Status zeigt Spieler und Anzahl', async () => {
    const admin = (await login(app, 'wh_admin')).agent;
    const person = (await admin.post('/api/v1/persons').set({ 'X-Guild-Id': HOME }).send({ robloxUsername: 'AllServers', robloxUserId: '779009' })).body.person.id as string;
    const w = await admin.post('/api/v1/wanted').send({ personId: person, reason: 'Diebstahl', priority: 'MEDIUM' }); // ohne X-Guild-Id
    expect(w.status).toBe(201);
    const p = await prisma.person.findUniqueOrThrow({ where: { id: person } });
    expect((await prisma.wantedRecord.findUniqueOrThrow({ where: { id: w.body.id } })).serverId).toBe(p.serverId);
    await poll(server(['AllServers:779009']));
    expect((await hits()).filter((x) => x.wantedId === w.body.id)).toHaveLength(1);
    const st = (await admin.get('/api/v1/wanted-hits/status').set({ 'X-Guild-Id': HOME })).body.servers.find((x: { id: string }) => x.id === serverId);
    expect(st.players).toEqual([{ name: 'AllServers', robloxUserId: '779009', wantedStars: 0 }]);
    expect(st.activeWanted).toBeGreaterThan(0);
  });

  it('im Spiel gesucht (Wanted-Sterne) → Treffer auch ohne Fahndung, eine Meldung je Aufenthalt, mehr Sterne ziehen nur den Treffer nach', async () => {
    const inGame = () => prisma.erlcWantedHit.findMany({ where: { matchType: 'ERLC_WANTED' } });
    // nur der Kanal für Fahndungstreffer ist eingestellt → „im Spiel gesucht“ landet dort
    await (await login(app, 'wh_admin')).agent.put('/api/v1/cad/config').set({ 'X-Guild-Id': HOME }).send({ homeGuildId: HOME, routes: [{ id: 'w1', guildId: HOME, event: 'wanted.hit', channelIds: [CH.hits], pingRoleIds: [], enabled: true }] });
    const before = await prisma.discordOutbox.count({ where: { type: 'cad.wanted.erlc' } });
    await poll(server(['Robber:775005']));
    expect(await inGame()).toHaveLength(0);
    await poll(server(['Robber:775005'], [], { 'Robber:775005': 2 }));
    const h = await inGame();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ playerName: 'Robber', robloxUserId: '775005', wantedId: null, identified: true, reviewStatus: 'NEW', wantedPriority: 'MEDIUM', notifyStatus: 'QUEUED' });
    expect(h[0]!.wantedReason).toContain('2 Sterne');
    const out = await prisma.discordOutbox.findMany({ where: { type: 'cad.wanted.erlc' } });
    expect(out).toHaveLength(before + 1);
    expect(out.at(-1)!.payload).toMatchObject({ playerName: 'Robber', channelIds: [CH.hits] }); // ohne eigenen Kanal → Fahndungstreffer
    await poll(server(['Robber:775005'], [], { 'Robber:775005': 4 }));
    const again = await inGame();
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ wantedPriority: 'HIGH' });
    expect(again[0]!.wantedReason).toContain('4 Sterne');
    expect(await prisma.discordOutbox.count({ where: { type: 'cad.wanted.erlc' } })).toBe(before + 1);
    const admin = (await login(app, 'wh_admin')).agent;
    const st = (await admin.get('/api/v1/wanted-hits/status').set({ 'X-Guild-Id': HOME })).body.servers.find((x: { id: string }) => x.id === serverId);
    expect(st.players).toEqual([{ name: 'Robber', robloxUserId: '775005', wantedStars: 4 }]);
    const list = (await admin.get('/api/v1/wanted-hits').set({ 'X-Guild-Id': HOME })).body.items;
    expect(list.find((x: { playerName: string }) => x.playerName === 'Robber')).toMatchObject({ identification: 'Im Spiel gesucht (ER:LC)', matchLabel: 'Im Spiel gesucht (ER:LC-Wanted-Sterne)' });
  });

  it('es wird nie ein Befehl an den ER:LC-Server gesendet (kein Kick, kein Bann)', () => {
    expect(sent.length).toBeGreaterThan(5);
    expect(sent.every((c) => c.method === 'GET' && c.path.startsWith('/v2/server'))).toBe(true);
  });
});
