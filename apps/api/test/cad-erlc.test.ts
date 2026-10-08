import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ErlcService } from '../src/cad/erlc.service';
import { CadService } from '../src/cad/cad.service';
import { ErlcClient } from '../src/cad/erlc-client';

const TOKEN = 'test-bot-token-cad-erlc-0123456789abcdefgh';
const SECRET_KEY = 'SuperSecretServerKey-1234567890';
const HOME = '610000000000000001', SEK_GUILD = '610000000000000002';
const CH = { leit: '620000000000000001', sek: '620000000000000002' };
const SEK_D = '630000000000000001';
const bot = (discordId: string, guild?: string) => ({ Authorization: `Bot ${TOKEN}`, 'X-Discord-User': discordId, ...(guild ? { 'X-Guild-Id': guild } : {}) });

let app: INestApplication; let prisma: PrismaService; let erlc: ErlcService;
const http = () => request(app.getHttpServer());

/** Gefälschte ER:LC-API: Antworten der Reihe nach, mitgeschrieben werden nur Pfade (und ob der Key ankam). */
const calls: { path: string; key: string | null }[] = [];
let replies: (() => Response)[] = [];
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const SERVER_DATA = {
  Name: 'EN Test', OwnerId: 1, CoOwnerIds: [], CurrentPlayers: 3, MaxPlayers: 40, JoinKey: 'ENTEST', AccVerifiedReq: 'Disabled', TeamBalance: true,
  Players: [
    { Player: 'MaxMustermann123:111', Team: 'Police', Callsign: 'SEK-01', Permission: 'Normal', WantedStars: 0, Location: { LocationX: 100, LocationZ: -50, PostalCode: '218', StreetName: 'Park Street', BuildingNumber: '' } },
    { Player: 'ModPerson:222', Team: 'Civilian', Permission: 'Server Moderator', WantedStars: 0, Location: { LocationX: 0, LocationZ: 0 } },
    { Player: 'Driver:333', Team: 'Civilian', Permission: 'Normal', WantedStars: 2 },
  ],
  Staff: { Admins: {}, Mods: { '222': 'ModPerson' }, Helpers: {} }, Queue: [444, 555],
  Vehicles: [{ Name: 'Falcon', Owner: 'MaxMustermann123', Plate: 'EN-1', ColorHex: '#ffffff', ColorName: 'White' }],
  EmergencyCalls: [{ Team: 'Police', Caller: 333, Players: [], Position: [-654.6, 666.5], StartedAt: 1774216563, CallNumber: 1182, Description: 'Schussgeräusche', PositionDescriptor: 'Park Street' }],
  ModCalls: [],
};

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  erlc = app.get(ErlcService);
  erlc.useClient(new ErlcClient(async (url, init) => {
    calls.push({ path: url.replace('https://erlc.test', ''), key: (init.headers as Record<string, string>)['server-key'] ?? null });
    const next = replies.shift();
    if (!next) throw new Error('no fake reply');
    return next();
  }, 'https://erlc.test'));
  await makeUser(prisma, 'cad_admin', ['System Administrator']);
  await makeUser(prisma, 'cad_disp', ['Police Member', 'Dispatch']);
  await makeUser(prisma, 'cad_member', ['Police Member']);
  const sek = await makeUser(prisma, 'cad_sek', ['SEK']);
  await prisma.discordLink.create({ data: { userId: sek.id, discordId: SEK_D } });
});
afterAll(async () => { delete process.env.BOT_API_TOKEN; await app.close(); });

describe('ER:LC integration', () => {
  let id = '';
  it('stores the server key encrypted and never returns it', async () => {
    const admin = (await login(app, 'cad_admin')).agent;
    const member = (await login(app, 'cad_member')).agent;
    expect((await member.post('/api/v1/erlc/servers').send({ name: 'X', key: SECRET_KEY })).status).toBe(403);
    expect((await admin.post('/api/v1/erlc/servers').send({ name: 'EN', key: SECRET_KEY, pollSeconds: 7 })).status).toBe(400); // nur erlaubte Intervalle
    const r = await admin.post('/api/v1/erlc/servers').send({ name: 'EN Hauptserver', key: SECRET_KEY, guildId: HOME, pollSeconds: 10, features: ['players', 'staff', 'queue', 'vehicles', 'emergencyCalls', 'commands'] });
    expect(r.status).toBe(201);
    id = r.body.id;
    expect(r.body.keyMasked).toBe('••••••••••••');
    expect(JSON.stringify(r.body)).not.toContain(SECRET_KEY);
    expect(JSON.stringify((await admin.get('/api/v1/erlc/servers')).body)).not.toContain(SECRET_KEY);
    const row = await prisma.erlcServer.findUniqueOrThrow({ where: { id } });
    expect(row.keyCipher).not.toContain(SECRET_KEY);
    expect(row.keyCipher.startsWith('v1:')).toBe(true);
    const audit = await prisma.auditLog.findMany({ where: { module: 'erlc' } });
    expect(JSON.stringify(audit)).not.toContain(SECRET_KEY);
  });

  it('polls GET /v2/server, keeps a secret-free snapshot and turns emergency calls into CAD calls once', async () => {
    const admin = (await login(app, 'cad_admin')).agent;
    // Leitstelle: Kanal für „Notruf eingegangen“
    expect((await admin.put('/api/v1/cad/config').send({ homeGuildId: HOME, routes: [{ id: 'r1', guildId: HOME, event: 'call.received', channelIds: [CH.leit], pingRoleIds: [], enabled: true }] })).status).toBe(200);
    replies = [json(200, SERVER_DATA, { 'x-ratelimit-bucket': 'global', 'x-ratelimit-limit': '35', 'x-ratelimit-remaining': '34', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 1) })];
    const t = await admin.post(`/api/v1/erlc/servers/${id}/test`);
    expect(t.status).toBe(200);
    expect(t.body).toMatchObject({ ok: true, status: 'CONNECTED' });
    expect(calls.at(-1)).toMatchObject({ key: SECRET_KEY });
    expect(calls.at(-1)!.path).toBe('/v2/server?Players=true&Staff=true&Queue=true&Vehicles=true&EmergencyCalls=true');
    const live = await admin.get(`/api/v1/erlc/servers/${id}/live`);
    expect(live.body.snapshot.server).toMatchObject({ currentPlayers: 3, maxPlayers: 40 });
    expect(live.body.snapshot.players[0]).toMatchObject({ name: 'MaxMustermann123', id: '111', callsign: 'SEK-01', location: { x: 100, z: -50, street: 'Park Street' } });
    expect(live.body.snapshot.queue).toEqual(['444', '555']);
    expect(JSON.stringify(live.body)).not.toContain(SECRET_KEY);
    const callsList = (await admin.get('/api/v1/cad/calls')).body;
    expect(callsList).toHaveLength(1);
    expect(callsList[0]).toMatchObject({ callNumber: 1182, description: 'Schussgeräusche', mapX: -654.6, mapZ: 666.5, status: 'OPEN' });
    const out = await prisma.discordOutbox.findFirst({ where: { type: 'cad.call.received' } });
    expect(out?.payload).toMatchObject({ callNumber: 1182, channelIds: [CH.leit] });
    // zweiter Abruf: derselbe Notruf wird nicht doppelt angelegt
    replies = [json(200, SERVER_DATA)];
    await admin.post(`/api/v1/erlc/servers/${id}/reconnect`);
    expect(await prisma.erlcEmergencyCall.count()).toBe(1);
  });

  it('rate limits: 429 → LIMITED and nothing is sent until Retry-After passed; bad key → ERROR and paused', async () => {
    const admin = (await login(app, 'cad_admin')).agent;
    replies = [json(429, { code: 4001, message: 'You are being rate limited', retry_after: 1 }, { 'retry-after': '1' })];
    const r = await admin.post(`/api/v1/erlc/servers/${id}/test`);
    expect(r.body).toMatchObject({ ok: false, status: 'LIMITED' });
    const before = calls.length;
    const again = await admin.post(`/api/v1/erlc/servers/${id}/test`);
    expect(again.body.status).toBe('LIMITED');
    expect(calls.length).toBe(before); // zurückgehalten, nicht gesendet
    expect((await admin.get(`/api/v1/erlc/servers/${id}/live`)).body.snapshot.server.currentPlayers).toBe(3); // letzter Stand bleibt sichtbar
    // Sperre läuft ab (Retry-After), ein neuer Key hebt sie nicht vorzeitig auf; ungültiger Key → Fehler + Pause
    await new Promise((r) => setTimeout(r, 1100));
    await admin.patch(`/api/v1/erlc/servers/${id}`).send({ key: `${SECRET_KEY}-neu` });
    replies = [json(403, { code: 2002, message: 'Invalid server key' })];
    const bad = await admin.post(`/api/v1/erlc/servers/${id}/test`);
    expect(bad.body).toMatchObject({ ok: false, status: 'ERROR' });
    expect(bad.body.server.paused).toBe(true);
    expect(bad.body.server.lastError).toContain('Server-Key');
    expect(JSON.stringify(bad.body)).not.toContain(SECRET_KEY);
  });

  it('command center: blocked, critical (right + confirmation) and normal commands are all logged', async () => {
    const admin = (await login(app, 'cad_admin')).agent;
    const disp = (await login(app, 'cad_disp')).agent;
    expect((await disp.post(`/api/v1/erlc/servers/${id}/command`).send({ command: ':h hallo' })).status).toBe(403); // kein cad.erlc_command
    expect((await admin.post(`/api/v1/erlc/servers/${id}/command`).send({ command: ':shutdown' })).status).toBe(403);
    const unconfirmed = await admin.post(`/api/v1/erlc/servers/${id}/command`).send({ command: ':kick Troll' });
    expect(unconfirmed.status).toBe(409);
    expect(unconfirmed.body.details).toMatchObject({ needsConfirm: true });
    replies = [json(200, { message: 'Success' })];
    const ok = await admin.post(`/api/v1/erlc/servers/${id}/command`).send({ command: ':kick Troll', confirm: true });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ ok: true, critical: true });
    // Befehls-Bucket: zweiter Befehl direkt danach wird lokal zurückgehalten (1 / 5 s)
    const fast = await admin.post(`/api/v1/erlc/servers/${id}/command`).send({ command: ':h test' });
    expect(fast.status).toBe(429);
    const log = (await admin.get(`/api/v1/erlc/servers/${id}/commands`)).body;
    expect(log.map((l: { command: string; ok: boolean }) => [l.command, l.ok])).toEqual([[':h test', false], [':kick Troll', true]]);
    expect(await prisma.auditLog.count({ where: { action: 'erlc.command' } })).toBe(2);
  });

  it('webhook: only valid Ed25519 signatures over timestamp + raw body are accepted', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    erlc.useWebhookKey(publicKey.export({ format: 'der', type: 'spki' }).toString('base64'));
    const admin = (await login(app, 'cad_admin')).agent;
    await admin.patch(`/api/v1/erlc/servers/${id}`).send({ webhookEnabled: true });
    const body = JSON.stringify({ Team: 'Police', Caller: 1, Players: [], Position: [10, 20], StartedAt: Math.floor(Date.now() / 1000), CallNumber: 1183, Description: 'Raub', PositionDescriptor: 'Bank' });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = sign(null, Buffer.concat([Buffer.from(ts), Buffer.from(body)]), privateKey).toString('hex');
    const token = (await prisma.erlcServer.findUniqueOrThrow({ where: { id } })).webhookToken;
    expect((await admin.get('/api/v1/erlc/servers')).body[0].webhookPath).toBe(`/api/v1/erlc/webhook/${id}/${token}`);
    const post = (s: string, b = body, t = token) => http().post(`/api/v1/erlc/webhook/${id}/${t}`).set({ 'content-type': 'application/json', 'X-Signature-Timestamp': ts, 'X-Signature-Ed25519': s }).send(b);
    expect((await post('ab'.repeat(64))).status).toBe(401);
    expect((await post(sig, body.replace('Raub', 'Mord'))).status).toBe(401); // Inhalt verändert
    expect((await post(sig, body, 'falsch')).status).toBe(404); // signiert, aber nicht an unseren Server
    const ok = await post(sig);
    expect(ok.status).toBe(200);
    expect(ok.body.calls).toBe(1);
    expect((await post(sig)).body.duplicate).toBe(true); // dieselbe Zustellung nochmal → ignoriert
    // ohne cad.manage_erlc kein Webhook-Pfad
    expect((await (await login(app, 'cad_disp')).agent.get('/api/v1/erlc/servers')).body[0].webhookPath).toBeNull();
    expect(await prisma.erlcEmergencyCall.findFirst({ where: { callNumber: 1183 } })).toMatchObject({ source: 'WEBHOOK', description: 'Raub' });
  });
});

describe('CAD', () => {
  let unitId = '', incidentId = '';
  it('config: validated, partial updates, audited', async () => {
    const admin = (await login(app, 'cad_admin')).agent;
    const disp = (await login(app, 'cad_disp')).agent;
    expect((await disp.put('/api/v1/cad/config').send({ incidentNumberPrefix: 'X' })).status).toBe(403);
    expect((await admin.put('/api/v1/cad/config').send({ incidentStatuses: [{ key: 'A', label: 'A' }, { key: 'B', label: 'B' }] })).status).toBe(400); // kein abschließender Status
    const r = await admin.put('/api/v1/cad/config').send({ incidentNumberPrefix: 'E' });
    expect(r.body).toMatchObject({ incidentNumberPrefix: 'E', homeGuildId: HOME });
    expect((await admin.put('/api/v1/cad/config/map').send({ scale: 0.5 })).body.map.scale).toBe(0.5);
    expect(await prisma.auditLog.count({ where: { action: 'cad.map.config' } })).toBe(1);
  });

  it('units, incidents with sequential numbers, assignment, status and chronicle', async () => {
    const admin = (await login(app, 'cad_admin')).agent;
    const disp = (await login(app, 'cad_disp')).agent;
    expect((await admin.put('/api/v1/cad/config').send({ routes: [{ id: 'r1', guildId: HOME, event: 'incident.created', channelIds: [CH.leit], pingRoleIds: [], enabled: true }] })).status).toBe(200);
    const u = await disp.post('/api/v1/cad/units').send({ callsign: 'sek-01', type: 'SEK', guildId: SEK_GUILD });
    expect(u.status).toBe(201);
    unitId = u.body.id;
    expect(u.body).toMatchObject({ callsign: 'SEK-01', status: 'AVAILABLE' });
    expect((await disp.post('/api/v1/cad/units').send({ callsign: 'X-1', type: 'NOPE' })).status).toBe(400);
    const i1 = await disp.post('/api/v1/cad/incidents').send({ title: 'Banküberfall', type: 'ROBBERY', keyword: 'Raub', priority: 'HIGH', location: 'Bank', mapX: 10, mapZ: 20 });
    expect(i1.status).toBe(201);
    expect(i1.body.number).toBe(`E-${new Date().getUTCFullYear()}-00001`);
    incidentId = i1.body.id;
    const i2 = await disp.post('/api/v1/cad/incidents').send({ title: 'Zweiter Einsatz' });
    expect(i2.body.number).toBe(`E-${new Date().getUTCFullYear()}-00002`);
    expect((await disp.post('/api/v1/cad/incidents').send({ title: 'Prio falsch', priority: 'GIBTSNICHT' })).status).toBe(400);
    expect(await prisma.discordOutbox.findFirst({ where: { type: 'cad.incident.created' }, orderBy: { createdAt: 'desc' } })).toMatchObject({ payload: expect.objectContaining({ channelIds: [CH.leit] }) });
    expect((await disp.post(`/api/v1/cad/incidents/${incidentId}/units`).send({ unitId })).status).toBe(200);
    expect((await disp.get('/api/v1/cad/units')).body.find((x: { id: string }) => x.id === unitId)).toMatchObject({ status: 'EN_ROUTE', current: { id: incidentId } });
    expect((await disp.post(`/api/v1/cad/incidents/${incidentId}/status`).send({ status: 'ON_SCENE' })).status).toBe(200);
    const detail = (await disp.get(`/api/v1/cad/incidents/${incidentId}`)).body;
    expect(detail.log.map((l: { kind: string }) => l.kind)).toEqual(['CREATED', 'ASSIGN', 'STATUS']);
  });

  it('emergency call → incident keeps the link; member without rights cannot', async () => {
    const disp = (await login(app, 'cad_disp')).agent;
    const member = (await login(app, 'cad_member')).agent;
    const call = await prisma.erlcEmergencyCall.findFirstOrThrow({ where: { callNumber: 1182 } });
    expect((await member.post(`/api/v1/cad/calls/${call.id}/incident`).send({})).status).toBe(403);
    const r = await disp.post(`/api/v1/cad/calls/${call.id}/incident`).send({ priority: 'HIGH' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ title: 'Schussgeräusche', location: 'Park Street', mapX: -654.6, source: 'ERLC_CALL' });
    expect(await prisma.erlcEmergencyCall.findUnique({ where: { id: call.id } })).toMatchObject({ incidentId: r.body.id, status: 'CLAIMED' });
    expect((await disp.post(`/api/v1/cad/calls/${call.id}/incident`).send({})).status).toBe(409);
    // gleichzeitige Klicks: nur ein Einsatz wird verknüpft
    const c2 = await prisma.erlcEmergencyCall.findFirstOrThrow({ where: { callNumber: 1183 } });
    const both = await Promise.all([disp.post(`/api/v1/cad/calls/${c2.id}/incident`).send({}), disp.post(`/api/v1/cad/calls/${c2.id}/incident`).send({})]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    // Wiederöffnen eines abgeschlossenen Einsatzes braucht cad.close_incident (Leitstelle hat es)
    const inc2 = both.find((r) => r.status === 200)!.body.id;
    expect((await disp.post(`/api/v1/cad/incidents/${inc2}/status`).send({ status: 'CLOSED' })).status).toBe(200);
    expect(await prisma.erlcEmergencyCall.findUnique({ where: { id: c2.id } })).toMatchObject({ status: 'CLOSED' });
  });

  it('cross-server: SEK server can report status / radio only through an allowed server link', async () => {
    const admin = (await login(app, 'cad_admin')).agent;
    const sekUser = await prisma.discordLink.findUniqueOrThrow({ where: { discordId: SEK_D } });
    await admin.post('/api/v1/cad/members').send({ userId: sekUser.userId, discordId: SEK_D, erlcName: 'MaxMustermann123', team: 'SEK', unitId, callsign: 'SEK-01', zelloName: 'max_zello' });
    // ohne Verbindung: vom SEK-Server verboten
    const denied = await http().post(`/api/v1/cad/units/${unitId}/status`).set(bot(SEK_D, SEK_GUILD)).send({ status: 'ON_SCENE' });
    expect(denied.status).toBe(403);
    const link = await admin.post('/api/v1/cad/links').send({ name: 'Leitstelle ↔ SEK/K9', sourceGuildId: HOME, targetGuildId: SEK_GUILD, sendTypes: ['incidents', 'unit_requests'], allowActions: ['status_report', 'radio'], channels: { incidents: [CH.sek] } });
    expect(link.status).toBe(201);
    expect((await http().post(`/api/v1/cad/units/${unitId}/status`).set(bot(SEK_D, SEK_GUILD)).send({ status: 'ON_SCENE' })).status).toBe(200);
    const radio = await http().post('/api/v1/cad/radio').set(bot(SEK_D, SEK_GUILD)).send({ text: 'Am Einsatzort.' });
    expect(radio.status).toBe(201);
    expect(radio.body).toMatchObject({ callsign: 'SEK-01', incidentId });
    const detail = (await admin.get(`/api/v1/cad/incidents/${incidentId}`)).body;
    expect(detail.log.at(-1)).toMatchObject({ kind: 'RADIO', text: 'SEK-01: „Am Einsatzort.“' });
    // Fremde Einheit/Rufname vortäuschen geht nicht; in fremde Einsätze funken auch nicht
    const other = await admin.post('/api/v1/cad/incidents').send({ title: 'Fremder Einsatz' });
    expect((await http().post('/api/v1/cad/radio').set(bot(SEK_D, SEK_GUILD)).send({ text: 'x', incidentId: other.body.id })).status).toBe(403);
    const fake = await http().post('/api/v1/cad/radio').set(bot(SEK_D, SEK_GUILD)).send({ text: 'y', callsign: 'LEITSTELLE' });
    expect(fake.body.callsign).toBe('SEK-01');
    // Einheit wählen: nur die eigene (Leitstelle: alle)
    const k9 = (await admin.post('/api/v1/cad/units').send({ callsign: 'K9-77', type: 'K9' })).body;
    expect((await http().post('/api/v1/cad/radio').set(bot(SEK_D, SEK_GUILD)).send({ text: 'z', unitId: k9.id })).status).toBe(403);
    expect((await http().post('/api/v1/cad/radio').set(bot(SEK_D, SEK_GUILD)).send({ text: 'z', unitId })).body.callsign).toBe('SEK-01');
    expect((await http().get('/api/v1/cad/radio/units').set(bot(SEK_D, SEK_GUILD))).status).toBe(403); // nur fürs Dashboard
    const mine = await app.get(CadService).radioUnits({ userId: sekUser.userId, discordId: SEK_D });
    expect(mine).toMatchObject({ mine: unitId, dispatcher: false });
    expect(mine.units.map((u) => u.callsign)).toEqual(['SEK-01']);
    const all = (await admin.get('/api/v1/cad/radio/units')).body;
    expect(all.dispatcher).toBe(true);
    expect(all.units.map((u: { callsign: string }) => u.callsign)).toContain('K9-77');
    expect((await admin.post('/api/v1/cad/radio').send({ text: 'Leitstelle an K9', unitId: k9.id })).body.callsign).toBe('K9-77');
    // Einsätze sehen / Notrufe bearbeiten vom SEK-Server nur mit freigegebener Aktion
    expect((await http().get('/api/v1/cad/incidents').set(bot(SEK_D, SEK_GUILD))).status).toBe(403);
    const call = await prisma.erlcEmergencyCall.findFirstOrThrow({ where: { callNumber: 1183 } });
    expect((await http().post(`/api/v1/cad/calls/${call.id}/claim`).set(bot(SEK_D, SEK_GUILD))).status).toBe(403);
    await admin.patch(`/api/v1/cad/links/${link.body.id}`).send({ allowActions: ['status_report', 'radio', 'view_incidents'] });
    expect((await http().get('/api/v1/cad/incidents').set(bot(SEK_D, SEK_GUILD))).status).toBe(200);
    // neue Einsätze gehen zusätzlich an den Kanal des verbundenen Servers
    await admin.post('/api/v1/cad/incidents').send({ title: 'Geiselnahme' });
    const out = await prisma.discordOutbox.findFirst({ where: { type: 'cad.incident.created' }, orderBy: { createdAt: 'desc' } });
    expect((out?.payload as { channelIds: string[] }).channelIds.sort()).toEqual([CH.leit, CH.sek].sort());
    // Einheit auf der Karte über die ER:LC-Position ihres Spielers
    const map = (await admin.get('/api/v1/cad/map')).body;
    expect(map.units.find((x: { id: string }) => x.id === unitId).position).toMatchObject({ x: 100, z: -50, source: 'erlc' });
    expect(map.vehicles[0]).toMatchObject({ plate: 'EN-1', x: 100, z: -50 });
    expect(map.players.find((p: { name: string }) => p.name === 'ModPerson').staff).toBe(true);
  });

  it('map objects: POI/zone validation, role visibility, audit', async () => {
    const admin = (await login(app, 'cad_admin')).agent;
    const disp = (await login(app, 'cad_disp')).agent;
    expect((await disp.post('/api/v1/cad/map/objects').send({ kind: 'POI', name: 'Bank', layer: 'pois', x: 1, z: 2 })).status).toBe(403);
    expect((await admin.post('/api/v1/cad/map/objects').send({ kind: 'ZONE', name: 'Sperr', layer: 'restricted', points: [[0, 0], [1, 1]] })).status).toBe(400);
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'System Administrator' } });
    await admin.post('/api/v1/cad/map/objects').send({ kind: 'POI', name: 'Bank', layer: 'pois', x: 1, z: 2 });
    await admin.post('/api/v1/cad/map/objects').send({ kind: 'ZONE', name: 'Nur Admins', layer: 'restricted', points: [[0, 0], [10, 0], [10, 10]], roleIds: [adminRole.id] });
    expect((await disp.get('/api/v1/cad/map/objects')).body.map((o: { name: string }) => o.name)).toEqual(['Bank']);
    expect((await admin.get('/api/v1/cad/map/objects')).body).toHaveLength(2);
    expect(await prisma.auditLog.count({ where: { action: { startsWith: 'cad.map.' } } })).toBeGreaterThanOrEqual(3);
    // automatische Aktion einer Zone: Einsatz darin → Hinweis in der Chronik
    await admin.post('/api/v1/cad/map/objects').send({ kind: 'ZONE', name: 'Hafen', layer: 'restricted', points: [[100, 100], [200, 100], [200, 200], [100, 200]], autoAction: 'warn' });
    const inc = await disp.post('/api/v1/cad/incidents').send({ title: 'Schmuggel', mapX: 150, mapZ: 150 });
    expect((await disp.get(`/api/v1/cad/incidents/${inc.body.id}`)).body.log.map((l: { text: string }) => l.text).join(' ')).toContain('Zone „Hafen“');
  });

  it('overview and logs', async () => {
    const disp = (await login(app, 'cad_disp')).agent;
    const admin = (await login(app, 'cad_admin')).agent;
    const o = (await disp.get('/api/v1/cad/overview')).body;
    expect(o.incidents.length).toBeGreaterThanOrEqual(3);
    expect(o.erlc[0]).toMatchObject({ players: 3, queue: 2, staffOnline: 1 });
    expect((await disp.get('/api/v1/cad/logs')).status).toBe(403);
    expect((await admin.get('/api/v1/cad/logs')).body.length).toBeGreaterThan(5);
  });
});

describe('CAD – Rechte pro Einsatz und pro Einheit', () => {
  it('vertrauliche Einsätze sehen nur freigegebene Rollen, die Verwaltung und der Disponent; keine Discord-Meldung', async () => {
    const admin = (await login(app, 'cad_admin')).agent;
    const disp = (await login(app, 'cad_disp')).agent;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'System Administrator' } });
    const before = await prisma.discordOutbox.count({ where: { type: 'cad.incident.created' } });
    const secret = await admin.post('/api/v1/cad/incidents').send({ title: 'Verdeckte Ermittlung', restrictRoleIds: [adminRole.id] });
    expect(secret.status).toBe(201);
    expect(await prisma.discordOutbox.count({ where: { type: 'cad.incident.created' } })).toBe(before);
    expect((await disp.get('/api/v1/cad/incidents')).body.some((i: { id: string }) => i.id === secret.body.id)).toBe(false);
    expect((await disp.get(`/api/v1/cad/incidents/${secret.body.id}`)).status).toBe(404);
    expect((await disp.post(`/api/v1/cad/incidents/${secret.body.id}/status`).send({ status: 'ON_SCENE' })).status).toBe(404);
    expect((await admin.get(`/api/v1/cad/incidents/${secret.body.id}`)).status).toBe(200);
    // Disponent mit Leitstellen-Rolle freigeben → sichtbar
    const dispRole = await prisma.role.findUniqueOrThrow({ where: { name: 'Dispatch' } });
    await admin.patch(`/api/v1/cad/incidents/${secret.body.id}`).send({ restrictRoleIds: [dispRole.id] });
    expect((await disp.get(`/api/v1/cad/incidents/${secret.body.id}`)).status).toBe(200);
  });
  it('Status-Rollen einer Einheit dürfen den Status melden (aus Discord)', async () => {
    const admin = (await login(app, 'cad_admin')).agent;
    const ROLE = '640000000000000001';
    const u = await admin.post('/api/v1/cad/units').send({ callsign: 'K9-02', type: 'K9', statusRoleIds: [ROLE] });
    expect(u.status).toBe(201);
    const roles = (r: string) => ({ ...bot(SEK_D, SEK_GUILD), 'X-Discord-Roles': r });
    expect((await http().post(`/api/v1/cad/units/${u.body.id}/status`).set(roles('640000000000000099')).send({ status: 'ON_SCENE' })).status).toBe(403);
    expect((await http().post(`/api/v1/cad/units/${u.body.id}/status`).set(roles(ROLE)).send({ status: 'ON_SCENE' })).status).toBe(200);
  });
});

describe('CAD – beendete Einsätze aufräumen', () => {
  it('löscht abgeschlossene/abgebrochene Einsätze nach einem Tag, aktive und frische bleiben', async () => {
    const old = new Date(Date.now() - 25 * 3_600_000), fresh = new Date(Date.now() - 2 * 3_600_000);
    const mk = (number: string, status: string, closedAt: Date | null) => prisma.incident.create({ data: { number, title: 'Aufräumtest', status, closedAt } });
    const gone1 = await mk('I-PURGE-1', 'CANCELLED', old);
    const gone2 = await mk('I-PURGE-2', 'CLOSED', old);
    const keepFresh = await mk('I-PURGE-3', 'CANCELLED', fresh);
    const keepActive = await mk('I-PURGE-4', 'NEW', null);
    await prisma.cadIncidentLog.create({ data: { incidentId: gone1.id, kind: 'NOTE', text: 'x' } });
    expect(await app.get(CadService).purgeClosedIncidents()).toBeGreaterThanOrEqual(2);
    const left = (await prisma.incident.findMany({ where: { number: { startsWith: 'I-PURGE-' } } })).map((i) => i.id);
    expect(left).not.toContain(gone1.id);
    expect(left).not.toContain(gone2.id);
    expect(left).toEqual(expect.arrayContaining([keepFresh.id, keepActive.id]));
  });
});

describe('CAD – Karte', () => {
  it('Karte: Fahrzeug-GPS nur für Polizeifahrzeuge', async () => {
    const admin = (await login(app, 'cad_admin')).agent;
    const map = (await admin.get('/api/v1/cad/map')).body as { vehicles: { owner: string }[] };
    expect(map.vehicles.every((v) => v.owner === 'MaxMustermann123')).toBe(true);
  });
});

describe('CAD – Tablet', () => {
  it('zeigt offene Meldungen, nur Polizisten im Aktivitätsbrett und Fahndungen nur mit Recht', async () => {
    const admin = (await login(app, 'cad_admin')).agent;
    const t = (await admin.get('/api/v1/cad/tablet')).body as { calls: unknown[]; board: { name: string; inGame: boolean }[]; wantedAllowed: boolean; inGameWanted: { name: string; stars: number }[] };
    expect(Array.isArray(t.calls)).toBe(true);
    const inGame = t.board.filter((b) => b.inGame).map((b) => b.name);
    expect(inGame).toContain('MaxMustermann123');
    expect(inGame).not.toContain('Driver');
    expect(t.wantedAllowed).toBe(true);
    expect(t.inGameWanted).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Driver', stars: 2 })]));
  });
});
