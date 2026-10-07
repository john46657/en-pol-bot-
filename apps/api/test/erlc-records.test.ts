import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ErlcSyncService } from '../src/cad/erlc-sync.service';
import type { ErlcSnapshot } from '../src/cad/erlc.service';

let app: INestApplication; let prisma: PrismaService; let sync: ErlcSyncService;
const snap = (players: { name: string; id: string }[], vehicles: { name: string; owner: string; plate: string | null; colorName?: string }[]): ErlcSnapshot => ({
  fetchedAt: new Date().toISOString(), server: { name: 'EN', currentPlayers: players.length, maxPlayers: 40, joinKey: null, accVerifiedReq: null, teamBalance: null },
  players: players.map((p) => ({ ...p, team: 'Civilian', callsign: null, permission: null, wantedStars: 0, location: null })),
  vehicles: vehicles.map((v) => ({ name: v.name, owner: v.owner, plate: v.plate, texture: null, colorHex: null, colorName: v.colorName ?? null })),
});

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  sync = app.get(ErlcSyncService);
  await makeUser(prisma, 'rec_admin', ['System Administrator']);
});
afterAll(async () => {
  await prisma.vehicle.deleteMany({ where: { plate: { in: ['ERLC1', 'ERLC2'] } } });
  await prisma.person.deleteMany({ where: { robloxUserId: { in: ['900001', '900002'] } } });
  await prisma.erlcServer.deleteMany({ where: { name: 'Records-Test' } });
  await app.close();
});

describe('persons and vehicles from the ER:LC API', () => {
  it('players become person files, spawned vehicles land in the registry with the owner; only changes are written', async () => {
    // vorhandene Akte ohne ID wird über den Namen erkannt und ergänzt
    await prisma.person.create({ data: { robloxUsername: 'Old_Name_Player', robloxUserId: null } });
    const s1 = snap([{ name: 'Erlc_Player', id: '900001' }, { name: 'old_name_player', id: '900002' }], [{ name: 'Falcon Stallion', owner: 'Erlc_Player', plate: 'ERLC1', colorName: 'Rot' }, { name: 'No Plate', owner: 'Erlc_Player', plate: null }]);
    expect(await sync.sync('srv-a', s1)).toEqual({ persons: 1, vehicles: 1 });
    const p = await prisma.person.findFirstOrThrow({ where: { robloxUserId: '900001' } });
    expect(p).toMatchObject({ robloxUsername: 'Erlc_Player', notes: 'Automatisch aus ER:LC übernommen.' });
    expect(await prisma.person.findFirstOrThrow({ where: { robloxUserId: '900002' } })).toMatchObject({ robloxUsername: 'old_name_player' });
    expect(await prisma.vehicle.findFirstOrThrow({ where: { plate: 'ERLC1' } })).toMatchObject({ model: 'Falcon Stallion', color: 'Rot', ownerId: p.id, erlcReference: 'Erlc_Player' });
    // gleicher Stand → nichts zu tun; Namensänderung + neue Farbe → Aktualisierung, keine Dubletten
    expect(await sync.sync('srv-a', s1)).toEqual({ persons: 0, vehicles: 0 });
    expect(await sync.sync('srv-a', snap([{ name: 'Erlc_Renamed', id: '900001' }], [{ name: 'Falcon Stallion', owner: 'Erlc_Renamed', plate: 'erlc1', colorName: 'Blau' }]))).toEqual({ persons: 0, vehicles: 1 });
    expect(await prisma.person.count({ where: { robloxUserId: '900001' } })).toBe(1);
    expect((await prisma.person.findFirstOrThrow({ where: { robloxUserId: '900001' } })).robloxUsername).toBe('Erlc_Renamed');
    expect(await prisma.vehicle.count({ where: { plate: { equals: 'ERLC1', mode: 'insensitive' } } })).toBe(1);
  });

  it('the person and vehicle pages show who/what is in game right now, linked to the file', async () => {
    await prisma.erlcServer.create({ data: { name: 'Records-Test', keyCipher: 'x', features: ['players', 'vehicles'], snapshot: snap([{ name: 'Erlc_Renamed', id: '900001' }], [{ name: 'Falcon Stallion', owner: 'Erlc_Renamed', plate: 'ERLC1' }, { name: 'Bike', owner: 'Unknown', plate: 'ERLC2' }]) as never } });
    const admin = (await login(app, 'rec_admin')).agent;
    const persons = (await admin.get('/api/v1/erlc/live/persons')).body;
    const person = await prisma.person.findFirstOrThrow({ where: { robloxUserId: '900001' } });
    expect(persons.items).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Erlc_Renamed', personId: person.id, serverName: 'Records-Test' })]));
    const vehicles = (await admin.get('/api/v1/erlc/live/vehicles')).body;
    const car = await prisma.vehicle.findFirstOrThrow({ where: { plate: 'ERLC1' } });
    expect(vehicles.items).toEqual(expect.arrayContaining([expect.objectContaining({ plate: 'ERLC1', vehicleId: car.id, ownerPersonId: person.id }), expect.objectContaining({ plate: 'ERLC2', vehicleId: null, ownerPersonId: null })]));
  });
});
