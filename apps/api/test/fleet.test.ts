import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ErlcService } from '../src/cad/erlc.service';
import { ErlcClient } from '../src/cad/erlc-client';
import { FleetService } from '../src/fleet/fleet.service';

let app: INestApplication; let prisma: PrismaService;
let replies: (() => Response)[] = [];
const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const player = (name: string, id: string, team: string, x?: number) => ({ Player: `${name}:${id}`, Team: team, Permission: 'Normal', WantedStars: 0, ...(x !== undefined ? { Location: { LocationX: x, LocationZ: 20, PostalCode: '101', StreetName: 'Main Street' } } : {}) });
const car = (Name: string, Owner: string, extra: Record<string, unknown> = {}) => ({ Name, Owner, Texture: 'Standard', ColorHex: '#ffffff', ColorName: 'Weiß', ...extra });
const data = (players: unknown[], vehicles: unknown[]) => ({ Name: 'Fleet Test', OwnerId: 1, CoOwnerIds: [], CurrentPlayers: players.length, MaxPlayers: 40, JoinKey: 'FLEET', Players: players, Vehicles: vehicles });
const PLAYERS = [player('OfcMiller', '9001', 'Police', 300), player('DepJones', '9002', 'Sheriff', 0), player('CivBob', '9003', 'Civilian', 5)];
let serverId = '';

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  app.get(ErlcService).useClient(new ErlcClient(async () => { const next = replies.shift(); if (!next) throw new Error('no fake reply'); return next(); }, 'https://erlc.test'));
  await makeUser(prisma, 'fl_admin', ['System Administrator']);
  await makeUser(prisma, 'fl_disp', ['Police Member', 'Dispatch']);
  await makeUser(prisma, 'fl_officer', ['Police Member']);
  await prisma.systemSetting.deleteMany({ where: { key: 'fleet.config' } });
});
afterAll(async () => {
  // eigene ER:LC-Server samt Fahrzeugen entfernen – andere Tests prüfen die Karte
  if (serverId) await prisma.erlcServer.deleteMany({ where: { id: serverId } });
  await prisma.policeVehicleModel.deleteMany({});
  await app.close();
});

const poll = async (players: unknown[], vehicles: unknown[]) => {
  replies = [json(200, data(players, vehicles))];
  const admin = (await login(app, 'fl_admin')).agent;
  const r = await admin.post(`/api/v1/erlc/servers/${serverId}/reconnect`);
  expect(r.body).toMatchObject({ ok: true });
};

describe('Polizeifahrzeuge aus ER:LC', () => {
  it('nur Polizeifahrzeuge; Fahrer nie behauptet; Position nur als Besitzerposition; gleiche Fahrzeuge als unsicher', async () => {
    const admin = (await login(app, 'fl_admin')).agent;
    const s = await admin.post('/api/v1/erlc/servers').send({ name: 'Fleet', key: 'FleetServerKey-1234567890abc', pollSeconds: 10, features: ['players', 'vehicles'] });
    expect(s.status).toBe(201);
    serverId = s.body.id;
    await poll(PLAYERS, [
      car('Falcon Interceptor Utility', 'OfcMiller', { Plate: 'POL-1' }),
      car('Bullhorn Prancer', 'OfcMiller'), car('Bullhorn Prancer', 'OfcMiller'), // zwei gleiche → unsicher
      car('Falcon Interceptor Utility', 'DepJones'), // Sheriff → kein Polizeifahrzeug
      car('Chevlon Camion', 'CivBob', { Plate: 'CIV-1' }), // Zivilist
    ]);
    const list = await admin.get('/api/v1/fleet/vehicles').query({ serverId });
    expect(list.status).toBe(200);
    const items = list.body.items as { id: string; uncertain: boolean; api: { name: string; owner: string; ownerRobloxId: string; plate: string | null; policeReason: string }; driver: { state: string; label: string }; ownerPosition: { x: number; hint: string } | null; stale: boolean }[];
    expect(items.map((i) => i.api.owner)).toEqual(['OfcMiller', 'OfcMiller', 'OfcMiller']);
    const falcon = items.find((i) => i.api.plate === 'POL-1')!;
    expect(falcon.api).toMatchObject({ ownerRobloxId: '9001', policeReason: 'team' });
    expect(falcon.driver).toEqual(expect.objectContaining({ state: 'unavailable', label: 'Fahrerdaten nicht verfügbar' }));
    expect(falcon.ownerPosition).toMatchObject({ x: 300 });
    expect(falcon.ownerPosition!.hint).toContain('keine Fahrzeugposition');
    expect(falcon.stale).toBe(false);
    expect(items.filter((i) => i.api.name === 'Bullhorn Prancer').every((i) => i.uncertain)).toBe(true);

    // wiederholter Abruf: keine Duplikate
    await poll(PLAYERS, [car('Falcon Interceptor Utility', 'OfcMiller', { Plate: 'POL-1' }), car('Bullhorn Prancer', 'OfcMiller'), car('Bullhorn Prancer', 'OfcMiller')]);
    expect(await prisma.erlcLiveVehicle.count({ where: { erlcServerId: serverId } })).toBe(3);
  });

  it('interne Daten: Einheit nur mit fleet.assign, Status/Notizen mit fleet.edit, Versionsprüfung; der Abgleich überschreibt sie nicht', async () => {
    const disp = (await login(app, 'fl_disp')).agent;
    const officer = (await login(app, 'fl_officer')).agent;
    const unit = await disp.post('/api/v1/cad/units').send({ callsign: 'FL-01', type: 'SEK', status: 'AVAILABLE' });
    const v = await prisma.erlcLiveVehicle.findFirstOrThrow({ where: { erlcServerId: serverId, plate: 'POL-1' } });
    expect((await officer.patch(`/api/v1/fleet/vehicles/${v.id}`).send({ version: v.version, notes: 'x' })).status).toBe(403);
    const r = await disp.patch(`/api/v1/fleet/vehicles/${v.id}`).send({ version: v.version, unitId: unit.body.id, notes: 'Funkgerät defekt', tags: ['Wache Nord'], internalCode: 'EN 1-21' });
    expect(r.status).toBe(200);
    expect(r.body.internal).toMatchObject({ unitId: unit.body.id, status: 'ASSIGNED', notes: 'Funkgerät defekt', tags: ['Wache Nord'], internalCode: 'EN 1-21', unit: { callsign: 'FL-01' } });
    expect((await disp.patch(`/api/v1/fleet/vehicles/${v.id}`).send({ version: v.version, notes: 'alt' })).status).toBe(409);
    expect((await disp.patch(`/api/v1/fleet/vehicles/${v.id}`).send({ version: r.body.internal.version, internalStatus: 'GIBTSNICHT' })).status).toBe(400);

    // Abgleich mit geänderter Farbe: API-Feld ändert sich, interne Felder bleiben
    await poll(PLAYERS, [car('Falcon Interceptor Utility', 'OfcMiller', { Plate: 'POL-1', ColorName: 'Schwarz', ColorHex: '#000000' })]);
    const d = await disp.get(`/api/v1/fleet/vehicles/${v.id}`);
    expect(d.body.api.colorName).toBe('Schwarz');
    expect(d.body.internal).toMatchObject({ notes: 'Funkgerät defekt', internalCode: 'EN 1-21' });
    expect(d.body.raw[0]).toMatchObject({ name: 'Falcon Interceptor Utility', colorName: 'Schwarz' });
    const kinds = (d.body.events as { kind: string; text: string }[]).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['SPAWNED', 'INTERNAL', 'CHANGED']));
    // die zwei Prancer sind nicht mehr gemeldet → inaktiv, nicht gelöscht
    expect(await prisma.erlcLiveVehicle.count({ where: { erlcServerId: serverId, active: false } })).toBe(2);
    expect((await disp.get('/api/v1/fleet/vehicles').query({ active: 'inactive', serverId })).body.items).toHaveLength(2);

    // MDT der Einheit zeigt das intern zugewiesene Fahrzeug; Karte zeigt es an der Besitzerposition
    const disper = await prisma.user.findUniqueOrThrow({ where: { username: 'fl_disp' } });
    await disp.post('/api/v1/cad/members').send({ userId: disper.id, unitId: unit.body.id });
    const mdt = await disp.get('/api/v1/cad/mdt');
    expect(mdt.body.vehicles.map((x: { id: string }) => x.id)).toContain(v.id);
    const map = await disp.get('/api/v1/cad/map');
    const mv = map.body.vehicles.find((x: { id: string }) => x.id === v.id);
    expect(mv).toMatchObject({ x: 300, unit: 'FL-01' });
    expect(mv.positionHint).toContain('Besitzers');
  });

  it('Besitzer offline: nur Katalog-Modelle zählen; Fahrzeug bei Einsatz dokumentieren', async () => {
    const admin = (await login(app, 'fl_admin')).agent;
    const officer = (await login(app, 'fl_officer')).agent;
    expect((await officer.post('/api/v1/fleet/catalog').send({ name: 'Interceptor', erlcName: 'Falcon Interceptor Utility', category: 'PATROL' })).status).toBe(403);
    const m = await admin.post('/api/v1/fleet/catalog').send({ name: 'Falcon Interceptor', erlcName: 'Falcon Interceptor Utility', category: 'PATROL', tags: ['Streife'], internalCode: 'FIU' });
    expect(m.status).toBe(201);
    expect((await admin.post('/api/v1/fleet/catalog').send({ name: 'Doppelt', erlcName: 'Falcon Interceptor Utility', category: 'PATROL' })).status).toBe(409);
    expect((await admin.post('/api/v1/fleet/catalog').send({ name: 'X', erlcName: 'Y', category: 'RAKETE' })).status).toBe(400);
    // Besitzer nicht im Spiel: Katalog-Modell bleibt Polizeifahrzeug, anderes Modell nicht
    await poll([], [car('Falcon Interceptor Utility', 'OfflineCop', { Plate: 'POL-9' }), car('Some Sedan', 'OfflineGuy')]);
    const items = (await admin.get('/api/v1/fleet/vehicles').query({ serverId })).body.items as { api: { owner: string; policeReason: string }; ownerPosition: unknown; model: { name: string } | null }[];
    expect(items.map((i) => i.api.owner)).toEqual(['OfflineCop']);
    expect(items[0]).toMatchObject({ api: { policeReason: 'catalog' }, ownerPosition: null, model: { name: 'Falcon Interceptor' } });
    const cat = (await officer.get('/api/v1/fleet/catalog')).body;
    expect(cat[0]).toMatchObject({ name: 'Falcon Interceptor', liveCount: 1 });
    expect((await admin.get('/api/v1/fleet/catalog/suggestions')).body.map((x: { erlcName: string }) => x.erlcName)).toContain('Bullhorn Prancer');

    const v = await prisma.erlcLiveVehicle.findFirstOrThrow({ where: { erlcServerId: serverId, plate: 'POL-9' } });
    const inc = await admin.post('/api/v1/cad/incidents').send({ title: 'Verfolgung' });
    const r = await admin.post(`/api/v1/fleet/vehicles/${v.id}/incidents`).send({ incidentId: inc.body.id, note: 'Erstes Fahrzeug vor Ort' });
    expect(r.status).toBe(200);
    expect((await prisma.cadIncidentLog.findMany({ where: { incidentId: inc.body.id, text: { contains: 'Fahrzeug dokumentiert' } } }))).toHaveLength(1);
    expect((await admin.get(`/api/v1/fleet/vehicles/${v.id}`)).body.incidents.map((i: { id: string }) => i.id)).toEqual([inc.body.id]);
    expect(await prisma.auditLog.count({ where: { action: { in: ['fleet.vehicle.update', 'fleet.vehicle.incident', 'fleet.model.create'] } } })).toBeGreaterThanOrEqual(3);
  });

  it('Mindestabstand zwischen Abgleichen; Einstellungen nur mit fleet.manage', async () => {
    const fleet = app.get(FleetService);
    const snap = { fetchedAt: new Date().toISOString(), server: { name: 'x', currentPlayers: 0, maxPlayers: 0, joinKey: null, accVerifiedReq: null, teamBalance: null }, players: [], vehicles: [] };
    expect(await fleet.sync(serverId, snap)).toBeNull(); // eben erst abgeglichen → übersprungen
    expect(await fleet.sync(serverId, { ...snap, vehicles: undefined }, true)).toBeNull(); // Fahrzeugdaten aus → nichts als verschwunden markieren
    const officer = (await login(app, 'fl_officer')).agent;
    expect((await officer.put('/api/v1/fleet/config').send({ syncSeconds: 30 })).status).toBe(403);
    const admin = (await login(app, 'fl_admin')).agent;
    expect((await admin.put('/api/v1/fleet/config').send({ syncSeconds: 2 })).status).toBe(400);
    expect((await admin.put('/api/v1/fleet/config').send({ syncSeconds: 30 })).body.syncSeconds).toBe(30);
    await prisma.systemSetting.deleteMany({ where: { key: 'fleet.config' } });
  });
});
