import { prisma } from '@nexus/database';
import { createRecord, saveRank } from '@nexus/personnel';
import { createUnit, dutyOverview, joinUnit, saveType, startShift, updateUnit } from '@nexus/shifts';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { OperationError, assignUnit, canTransition, changeStatus, createOperation, formatNumber, getByNumber, listOperations, operationHistory, operationStats, setLeader, transferToPersonnel, unassignUnit, updateOperation } from '../src/index.js';

const G = 'optest-guild';
const [A, B, C, D] = ['900000000000070001', '900000000000070002', '900000000000070003', '900000000000070004'];
let typeId = '';
let u1 = '';
let u2 = '';
const err = (p: Promise<unknown>, code: string) => expect(p).rejects.toSatisfy((e) => e instanceof OperationError && e.code === code);
const mk = (kind = 'Verkehrskontrolle') => createOperation({ guildId: G, actorId: 'boss', kind, location: 'Hauptstraße' });

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.operationCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Einsatz', settings: { create: {} } } });
  typeId = (await saveType(G, { name: 'Streife' }, 'x')).id;
  const rank = await saveRank(G, { name: 'Kommissar', order: 1, isEntry: true }, 'x');
  for (const [u, n] of [[A, 'Anna'], [B, 'Bert'], [C, 'Carla']] as const) {
    await createRecord({ guildId: G, userId: u, rpName: n, actorId: 'x', rankId: rank.id });
    await startShift({ guildId: G, userId: u, typeId, memberRoleIds: [] });
  }
  await startShift({ guildId: G, userId: D, typeId, memberRoleIds: [] }); // ohne Akte
  u1 = (await createUnit({ guildId: G, userId: A, callsign: 'Adam 1' })).id;
  await joinUnit(G, B, u1);
  u2 = (await createUnit({ guildId: G, userId: C, callsign: 'Bruno 2' })).id;
});
afterAll(async () => {
  await prisma.operationCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Einsatz anlegen', () => {
  it('Nummern laufen fortlaufend und eindeutig – auch parallel', async () => {
    const ops = await Promise.all(Array.from({ length: 6 }, () => mk()));
    expect(ops.map((o) => o.number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(formatNumber(7)).toBe('E-0007');
    expect((await getByNumber(G, 3)).id).toBeTruthy();
  });
  it('Pflichtfelder und Priorität', async () => {
    await err(createOperation({ guildId: G, actorId: 'x', kind: '', location: 'x' }), 'invalid');
    await err(createOperation({ guildId: G, actorId: 'x', kind: 'x', location: '' }), 'invalid');
    await err(createOperation({ guildId: G, actorId: 'x', kind: 'x', location: 'y', priority: 'MEGA' }), 'invalid');
    const op = await createOperation({ guildId: G, actorId: 'x', kind: 'Raub', location: 'Bank', priority: 'URGENT', description: 'Bewaffnet' });
    expect(op).toMatchObject({ status: 'REQUESTED', priority: 'URGENT', description: 'Bewaffnet' });
  });
});

describe('Statusmaschine', () => {
  it('erlaubte und verbotene Wechsel', () => {
    expect(canTransition('REQUESTED', 'EN_ROUTE')).toBe(true);
    expect(canTransition('ACTIVE', 'REQUESTED')).toBe(false);
    expect(canTransition('COMPLETED', 'ACTIVE')).toBe(false);
    expect(canTransition('CANCELLED', 'ACTIVE')).toBe(false);
  });
  it('ohne Einheit kein Anfahren; Abschluss braucht Bericht, Abbruch einen Grund', async () => {
    const op = await mk();
    await err(changeStatus({ guildId: G, operationId: op.id, to: 'EN_ROUTE', actorId: 'x' }), 'conflict');
    await assignUnit(G, op.id, u1, 'boss');
    await changeStatus({ guildId: G, operationId: op.id, to: 'EN_ROUTE', actorId: 'x' });
    await err(changeStatus({ guildId: G, operationId: op.id, to: 'REQUESTED', actorId: 'x' }), 'conflict');
    await err(changeStatus({ guildId: G, operationId: op.id, to: 'COMPLETED', actorId: 'x' }), 'invalid');
    await err(changeStatus({ guildId: G, operationId: op.id, to: 'COMPLETED', actorId: 'x', report: 'kurz' }), 'invalid');
    await err(changeStatus({ guildId: G, operationId: op.id, to: 'CANCELLED', actorId: 'x' }), 'invalid');
    await err(changeStatus({ guildId: G, operationId: op.id, to: 'ENDE', actorId: 'x' }), 'invalid');
  });
});

describe('Kompletter Einsatz (Abnahme-Ablauf)', () => {
  it('anlegen → Einheiten → Leiter → anfahren → aktiv → abschließen: Einheiten frei, Akten gefüllt', async () => {
    const op = await mk();
    const a = await assignUnit(G, op.id, u1, 'boss');
    expect(a.leaderId).toBe(A); // Streifenführer der ersten Einheit
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: u1 } })).status).toBe('BUSY');
    expect((await dutyOverview(G)).units.find((u) => u.id === u1)?.availability).toBe('BUSY');
    await assignUnit(G, op.id, u2, 'boss');
    await err(assignUnit(G, (await mk('Anderes')).id, u1, 'boss'), 'conflict'); // Einheit schon im Einsatz
    await setLeader(G, op.id, B, 'boss');
    await err(setLeader(G, op.id, D, 'boss'), 'invalid'); // nicht in zugewiesener Einheit

    await changeStatus({ guildId: G, operationId: op.id, to: 'EN_ROUTE', actorId: 'boss' });
    await changeStatus({ guildId: G, operationId: op.id, to: 'ACTIVE', actorId: 'boss' });
    const { operation, transferred } = await changeStatus({ guildId: G, operationId: op.id, to: 'COMPLETED', actorId: 'boss', report: 'Kontrolle ohne Besonderheiten beendet.', outcome: 'Verwarnung' });
    expect(operation).toMatchObject({ status: 'COMPLETED', report: expect.stringContaining('Kontrolle'), outcome: 'Verwarnung' });
    expect(operation.startedAt).not.toBeNull();
    expect(transferred.sort()).toEqual([A, B, C]);

    // Einheiten wieder verfügbar
    expect((await prisma.unit.findMany({ where: { guildId: G, activeKey: 'active' } })).map((u) => u.status)).toEqual(['AVAILABLE', 'AVAILABLE']);
    // Personalakten
    const entries = await prisma.personnelEntry.findMany({ where: { guildId: G, kind: 'OPERATION' }, include: { record: true } });
    expect(entries).toHaveLength(3);
    const bert = entries.find((e) => e.record.userId === B)!;
    expect(bert.title).toContain('E-0001');
    expect(bert.body).toContain('Einsatzleiter');
    expect(entries.find((e) => e.record.userId === A)!.body).toContain('Beteiligt');
    // idempotent
    expect(await transferToPersonnel(G, op.id, 'boss')).toEqual([]);
    expect(await prisma.personnelEntry.count({ where: { guildId: G, kind: 'OPERATION' } })).toBe(3);
    // Verlauf
    expect((await operationHistory(G, op.id)).map((e) => e.type)).toEqual(expect.arrayContaining(['created', 'unit.assigned', 'leader', 'status', 'unit.released', 'personnel.transferred']));
  });

  it('Mitglied ohne Akte: kein Eintrag, kein Fehler; Abbruch schreibt nichts in Akten und gibt Einheit frei', async () => {
    await joinUnit(G, D, u1);
    const op = await mk();
    await assignUnit(G, op.id, u1, 'boss');
    const r = await changeStatus({ guildId: G, operationId: op.id, to: 'CANCELLED', actorId: 'boss', report: 'Fehlalarm' });
    expect(r.operation.status).toBe('CANCELLED');
    expect(r.transferred).toEqual([]);
    expect(await prisma.personnelEntry.count({ where: { guildId: G, kind: 'OPERATION' } })).toBe(0);
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: u1 } })).status).toBe('AVAILABLE');
    expect(await prisma.auditLog.count({ where: { guildId: G, action: 'operation.cancelled' } })).toBe(1);
    await err(updateOperation(G, op.id, { location: 'x' }, 'x'), 'conflict');
    await err(assignUnit(G, op.id, u2, 'boss'), 'conflict');
  });

  it('vorheriger Einheitenstatus wird wiederhergestellt; manuelle Änderung bleibt unangetastet; Abziehen', async () => {
    await updateUnit(G, u2, { status: 'BREAK' }, C);
    const op = await mk();
    await assignUnit(G, op.id, u2, 'boss');
    await unassignUnit(G, op.id, u2, 'boss');
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: u2 } })).status).toBe('BREAK');
    await assignUnit(G, op.id, u1, 'boss');
    await updateUnit(G, u1, { status: 'UNAVAILABLE' }, A); // manuell geändert
    await changeStatus({ guildId: G, operationId: op.id, to: 'CANCELLED', actorId: 'x', report: 'Abbruch' });
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: u1 } })).status).toBe('UNAVAILABLE');
  });
});

describe('Abfragen für Berichte', () => {
  it('Liste, Filter, Kennzahlen', async () => {
    const o1 = await mk('Raub');
    await mk('Unfall');
    await assignUnit(G, o1.id, u1, 'boss');
    await changeStatus({ guildId: G, operationId: o1.id, to: 'ACTIVE', actorId: 'x' });
    await changeStatus({ guildId: G, operationId: o1.id, to: 'COMPLETED', actorId: 'x', report: 'Täter festgenommen.' });
    expect((await listOperations({ guildId: G })).items.map((o) => o.number)).toEqual([2, 1]);
    expect((await listOperations({ guildId: G, open: true })).items.map((o) => o.number)).toEqual([2]);
    expect((await listOperations({ guildId: G, userId: B })).items.map((o) => o.number)).toEqual([1]);
    const s = await operationStats(G);
    expect(s.byStatus).toEqual({ COMPLETED: 1, REQUESTED: 1 });
    expect(s.participation.map((p) => [p.userId, p.operations]).sort()).toEqual([[A, 1], [B, 1]]);
  });
});
