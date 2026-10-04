import { prisma } from '@nexus/database';
import { createRecord, saveRank } from '@nexus/personnel';
import { createUnit, disbandUnit, joinUnit, saveType, startShift } from '@nexus/shifts';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { FleetError, penalties as P, vehicles as V } from '../src/index.js';

const G = 'fleettest-guild';
const [A, B, C] = ['900000000000110001', '900000000000110002', '900000000000110003'];
let unitId = '';
const err = (p: Promise<unknown>, code: string) => expect(p).rejects.toSatisfy((e) => e instanceof FleetError && e.code === code);
const car = (plate = 'LS-PD 100', type = 'Streifenwagen') => V.addVehicle({ guildId: G, plate, type, actorId: 'boss' });

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.penaltyCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Fleet', settings: { create: {} } } });
  const type = await saveType(G, { name: 'Streife' }, 'x');
  const rank = await saveRank(G, { name: 'Kommissar', order: 1, isEntry: true }, 'x');
  await createRecord({ guildId: G, userId: A, rpName: 'Anna', actorId: 'x', rankId: rank.id }); // B hat keine Akte
  for (const u of [A, B]) await startShift({ guildId: G, userId: u, typeId: type.id, memberRoleIds: [] });
  unitId = (await createUnit({ guildId: G, userId: A, callsign: 'Adam 1' })).id;
  await joinUnit(G, B, unitId);
});
afterAll(async () => {
  await prisma.penaltyCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Fahrzeuge', () => {
  it('anlegen: Kennzeichen eindeutig (formatunabhängig), Pflichtfelder', async () => {
    const v = await car('LS-PD 100');
    expect(v).toMatchObject({ plate: 'LS-PD 100', plateKey: 'LSPD100', status: 'AVAILABLE' });
    await err(car('lspd100'), 'conflict');
    await err(V.addVehicle({ guildId: G, plate: '', type: 'x', actorId: 'b' }), 'invalid');
    await err(V.addVehicle({ guildId: G, plate: 'AB 1', type: '', actorId: 'b' }), 'invalid');
    expect((await V.getVehicleByPlate(G, 'ls pd-100')).id).toBe(v.id);
    await err(V.getVehicleByPlate(G, 'NIX 1'), 'not-found');
  });
  it('Einheit + Fahrer: Zuweisen setzt Status/Einheitenfahrzeug; Fahrer nur aus der Einheit; eine Einheit ein Fahrzeug', async () => {
    const v = await car();
    const w = await car('LS-PD 101');
    await err(V.assignToUnit(G, v.id, unitId, C, 'boss'), 'invalid'); // C nicht in Einheit
    const a = await V.assignToUnit(G, v.id, unitId, B, 'boss');
    expect(a).toMatchObject({ unitId, driverId: B, status: 'IN_USE' });
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unitId } })).vehicle).toBe('LS-PD 100 (Streifenwagen)');
    await err(V.assignToUnit(G, w.id, unitId, undefined, 'boss'), 'conflict');
    await V.setDriver(G, v.id, A, 'boss');
    await err(V.setDriver(G, v.id, C, 'boss'), 'invalid');
    expect((await V.vehiclesOfDriver(G, A)).map((x) => x.plate)).toEqual(['LS-PD 100']); // Verknüpfung zur Personalakte (Benutzer)
    const r = await V.release(G, v.id, 'boss');
    expect(r).toMatchObject({ unitId: null, driverId: null, status: 'AVAILABLE' });
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unitId } })).vehicle).toBeNull();
    await err(V.release(G, v.id, 'boss'), 'conflict');
  });
  it('aufgelöste Einheit gibt das Fahrzeug beim Lesen frei', async () => {
    const v = await car();
    await V.assignToUnit(G, v.id, unitId, undefined, 'boss');
    await disbandUnit(G, unitId, 'boss');
    const list = await V.listVehicles({ guildId: G });
    expect(list[0]).toMatchObject({ unitId: null, status: 'AVAILABLE' });
    expect((await V.vehicleHistory(G, v.id)).map((e) => e.type)).toContain('unit.released');
  });
  it('Schäden: leicht ändert nichts, schwer → Werkstatt, Totalschaden → außer Dienst; Reparatur macht verfügbar', async () => {
    const v = await car();
    await V.reportDamage({ guildId: G, vehicleId: v.id, description: 'Kratzer Stoßstange', actorId: A });
    expect((await V.getVehicle(G, v.id)).status).toBe('AVAILABLE');
    const big = await V.reportDamage({ guildId: G, vehicleId: v.id, description: 'Motorschaden', severity: 'MAJOR', actorId: A });
    expect((await V.getVehicle(G, v.id))).toMatchObject({ status: 'MAINTENANCE' });
    await err(V.assignToUnit(G, v.id, unitId, undefined, 'boss'), 'conflict'); // nicht einsatzbereit
    const small = (await V.getVehicle(G, v.id)).damages.find((d) => d.severity === 'MINOR')!;
    await V.repairDamage(G, big.id, 'werk');
    expect((await V.getVehicle(G, v.id)).status).toBe('MAINTENANCE'); // Kratzer noch offen
    await err(V.repairDamage(G, big.id, 'werk'), 'conflict');
    await V.repairDamage(G, small.id, 'werk');
    expect(await V.getVehicle(G, v.id)).toMatchObject({ status: 'AVAILABLE', damages: [] });
    const w = await car('LS-PD 102');
    await V.reportDamage({ guildId: G, vehicleId: w.id, description: 'Ausgebrannt', severity: 'TOTAL', actorId: A });
    expect((await V.getVehicle(G, w.id)).status).toBe('OUT_OF_SERVICE');
    await err(V.reportDamage({ guildId: G, vehicleId: w.id, description: 'x', actorId: A }), 'invalid');
  });
  it('Status/Ausmustern/Filter; ausgemustertes Kennzeichen wieder frei', async () => {
    const v = await car();
    await err(V.setStatus(G, v.id, 'KAPUTT', 'b'), 'invalid');
    await V.setStatus(G, v.id, 'MAINTENANCE', 'b');
    expect((await V.listVehicles({ guildId: G, status: 'MAINTENANCE' })).map((x) => x.id)).toEqual([v.id]);
    expect(await V.listVehicles({ guildId: G, query: 'streifen' })).toHaveLength(1);
    await V.retireVehicle(G, v.id, 'boss');
    expect(await V.listVehicles({ guildId: G })).toHaveLength(0);
    expect(await V.listVehicles({ guildId: G, includeRetired: true })).toHaveLength(1);
    await car('LS-PD 100');
    await err(V.setStatus(G, v.id, 'AVAILABLE', 'b'), 'conflict');
  });
});

describe('Strafen', () => {
  const fine = (extra = {}) => P.issuePenalty({ guildId: G, kind: 'FINE', subjectName: 'Max Mustermann', reason: 'Rotlichtverstoß', amount: 500, issuedBy: A, ...extra });
  it('alle fünf Arten mit Pflichtangaben; Nummern parallel fortlaufend', async () => {
    const made = await Promise.all([fine(), P.issuePenalty({ guildId: G, kind: 'WARNING', subjectName: 'Max Mustermann', reason: 'Falschparken', issuedBy: A }), P.issuePenalty({ guildId: G, kind: 'POINTS', subjectName: 'Max Mustermann', reason: 'Raserei', points: 3, issuedBy: A }), P.issuePenalty({ guildId: G, kind: 'LICENSE_REVOCATION', subjectName: 'Max Mustermann', reason: 'Alkohol', durationDays: 30, issuedBy: A }), P.issuePenalty({ guildId: G, kind: 'VEHICLE_SEIZURE', subjectName: 'Max Mustermann', reason: 'Illegales Rennen', plate: 'ls-xx 1', issuedBy: A })]);
    expect(made.map((p) => p.number).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(made.find((p) => p.kind === 'VEHICLE_SEIZURE')?.plate).toBe('LS-XX 1');
    expect(P.formatNumber(7)).toBe('S-0007');
  });
  it('Validierung', async () => {
    const bad = (extra: object, kind = 'FINE') => err(P.issuePenalty({ guildId: G, kind, subjectName: 'X Y', reason: 'Grund hier', issuedBy: A, ...extra }), 'invalid');
    await bad({}); // Bußgeld ohne Betrag
    await bad({ amount: 0 });
    await bad({ amount: 1.5 });
    await bad({ amount: 10_000_001 });
    await bad({}, 'POINTS');
    await bad({ points: 21 }, 'POINTS');
    await bad({}, 'LICENSE_REVOCATION');
    await bad({ durationDays: 4000 }, 'LICENSE_REVOCATION');
    await bad({}, 'VEHICLE_SEIZURE');
    await bad({ amount: 10 }, 'WARNING');
    await bad({ points: 2, amount: 5 }, 'POINTS');
    await bad({}, 'FOLTER');
    await err(P.issuePenalty({ guildId: G, kind: 'WARNING', subjectName: '', reason: 'Grund hier', issuedBy: A }), 'invalid');
    await err(P.issuePenalty({ guildId: G, kind: 'WARNING', subjectName: 'X', reason: 'xx', issuedBy: A }), 'invalid');
  });
  it('Personalakte des Ausstellers: Eintrag mit Details; ohne Akte kein Fehler; Aufheben widerruft ihn', async () => {
    const p = await fine();
    const rec = await prisma.personnelRecord.findFirstOrThrow({ where: { guildId: G, userId: A } });
    const entry = await prisma.personnelEntry.findFirstOrThrow({ where: { recordId: rec.id, kind: 'PENALTY' } });
    expect(entry).toMatchObject({ id: p.personnelEntryId, revokedAt: null });
    expect(entry.title).toContain('S-0001');
    expect(entry.body).toContain('500 $');
    const noRecord = await fine({ issuedBy: B });
    expect(noRecord.personnelEntryId).toBeNull();
    const r = await P.revokePenalty(G, p.id, 'Einspruch stattgegeben', 'boss');
    expect(r).toMatchObject({ status: 'REVOKED', revokeReason: 'Einspruch stattgegeben' });
    expect((await prisma.personnelEntry.findUniqueOrThrow({ where: { id: entry.id } })).revokedAt).not.toBeNull();
    await err(P.revokePenalty(G, p.id, 'nochmal', 'boss'), 'conflict');
    await err(P.revokePenalty(G, noRecord.id, '', 'boss'), 'invalid');
    expect(await prisma.auditLog.count({ where: { guildId: G, action: 'penalty.revoked' } })).toBe(1);
  });
  it('Strafenregister: Summen nur aus aktiven Strafen, Punktegrenze, Führerscheinentzug, Beschlagnahmung', async () => {
    const now = new Date('2026-10-04T12:00:00Z');
    const f1 = await fine({ amount: 500 });
    await fine({ amount: 250, subjectName: 'max  mustermann' }); // gleiche Person trotz Schreibweise
    await P.issuePenalty({ guildId: G, kind: 'POINTS', subjectName: 'Max Mustermann', reason: 'Raserei', points: 5, issuedBy: A });
    await P.issuePenalty({ guildId: G, kind: 'POINTS', subjectName: 'Max Mustermann', reason: 'Raserei 2', points: 3, issuedBy: A });
    await P.issuePenalty({ guildId: G, kind: 'LICENSE_REVOCATION', subjectName: 'Max Mustermann', reason: 'Alkohol', durationDays: 30, issuedBy: A }, now);
    await P.issuePenalty({ guildId: G, kind: 'VEHICLE_SEIZURE', subjectName: 'Max Mustermann', reason: 'Rennen', plate: 'LS-XX 1', issuedBy: A });
    await fine({ subjectName: 'Erika Musterfrau', amount: 99 });
    const r = await P.registerOf(G, 'Max Mustermann', now);
    expect(r).toMatchObject({ finesTotal: 750, points: 8, pointsLimitReached: true, warnings: 0, seizedPlates: ['LS-XX 1'] });
    expect(r.licenseRevokedUntil?.toISOString()).toBe('2026-11-03T12:00:00.000Z');
    expect(r.penalties).toHaveLength(6);
    await P.revokePenalty(G, f1.id, 'Irrtum', 'boss');
    expect((await P.registerOf(G, 'Max Mustermann', now)).finesTotal).toBe(250);
    expect((await P.registerOf(G, 'Max Mustermann', new Date('2026-12-01T00:00:00Z'))).licenseRevokedUntil).toBeNull(); // Entzug abgelaufen
  });
  it('Suchen und Filtern', async () => {
    await fine();
    await P.issuePenalty({ guildId: G, kind: 'WARNING', subjectName: 'Erika Musterfrau', reason: 'Lärm', issuedBy: B });
    const n = async (f: object) => (await P.listPenalties({ guildId: G, ...f })).items.map((p) => p.number).sort();
    expect(await n({})).toEqual([1, 2]);
    expect(await n({ query: 'erika' })).toEqual([2]);
    expect(await n({ query: 'S-0001' })).toEqual([1]);
    expect(await n({ kind: 'FINE' })).toEqual([1]);
    expect(await n({ issuedBy: B })).toEqual([2]);
    expect(await n({ query: 'rotlicht' })).toEqual([1]);
  });
});
