import { prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ShiftError,
  assignToUnit,
  createUnit,
  disbandUnit,
  dutyOverview,
  dutyStatusOf,
  endShift,
  getUnitOf,
  joinUnit,
  leaveUnit,
  pauseShift,
  resumeShift,
  saveType,
  startShift,
  unitHistory,
  updateUnit,
} from '../src/index.js';

const G = 'unittest-guild';
const [A, B, C, D] = ['900000000000040001', '900000000000040002', '900000000000040003', '900000000000040004'];
let typeId = '';
const duty = (u: string) => startShift({ guildId: G, userId: u, typeId, memberRoleIds: [] });
const err = (p: Promise<unknown>, code: string) => expect(p).rejects.toSatisfy((e) => e instanceof ShiftError && e.code === code);

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Units', settings: { create: {} } } });
  typeId = (await saveType(G, { name: 'Streife' }, 'x')).id;
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Einheiten', () => {
  it('Streife bilden verlangt laufende Schicht; Ersteller wird Führer; Rufname eindeutig', async () => {
    await err(createUnit({ guildId: G, userId: A, callsign: 'Adam 1' }), 'conflict');
    await duty(A);
    await duty(B);
    const u = await createUnit({ guildId: G, userId: A, callsign: 'Adam 1', vehicle: 'Streifenwagen' });
    expect(u.members).toMatchObject([{ userId: A, role: 'LEADER' }]);
    await err(createUnit({ guildId: G, userId: B, callsign: 'Adam 1' }), 'conflict');
    await err(createUnit({ guildId: G, userId: A, callsign: 'Adam 2' }), 'conflict'); // schon in Einheit
    await err(createUnit({ guildId: G, userId: B, callsign: '!!' }), 'invalid');
  });

  it('Beitreten, nur eine Einheit je Mitglied, Verlassen mit Führungswechsel und Auflösung', async () => {
    for (const x of [A, B, C]) await duty(x);
    const u = await createUnit({ guildId: G, userId: A, callsign: 'Adam 1' });
    await joinUnit(G, B, u.id);
    await err(joinUnit(G, B, u.id), 'conflict');
    const other = await createUnit({ guildId: G, userId: C, callsign: 'Bruno 2' });
    await err(joinUnit(G, B, other.id), 'conflict');
    await leaveUnit(G, A);
    expect((await getUnitOf(G, B))?.members[0]).toMatchObject({ userId: B, role: 'LEADER' });
    await leaveUnit(G, B);
    expect(await prisma.unit.count({ where: { guildId: G, activeKey: 'active' } })).toBe(1);
    expect((await prisma.unit.findUnique({ where: { id: u.id } }))?.disbandedAt).not.toBeNull();
    // Rufname wieder frei
    await duty(D);
    await createUnit({ guildId: G, userId: D, callsign: 'Adam 1' });
  });

  it('Schicht beenden verlässt die Einheit automatisch', async () => {
    const s = await duty(A);
    await createUnit({ guildId: G, userId: A, callsign: 'Adam 1' });
    await endShift(G, s.id, { actorId: A });
    expect(await getUnitOf(G, A)).toBeNull();
    expect((await dutyOverview(G)).units).toHaveLength(0);
  });

  it('Verfügbarkeit: Besetzung zählt nur Mitglieder ohne Pause', async () => {
    await duty(A);
    await duty(B);
    const u = await createUnit({ guildId: G, userId: A, callsign: 'Adam 1' });
    await joinUnit(G, B, u.id);
    let o = await dutyOverview(G);
    expect(o.units[0]).toMatchObject({ availability: 'AVAILABLE', staffing: { active: 2, paused: 0, total: 2 } });
    expect(o.counts).toMatchObject({ onDuty: 2, units: 1, available: 1 });
    await pauseShift(G, B);
    o = await dutyOverview(G);
    expect(o.units[0]!.staffing).toEqual({ active: 1, paused: 1, total: 2 });
    expect(o.units[0]!.availability).toBe('AVAILABLE');
    await pauseShift(G, A);
    o = await dutyOverview(G);
    expect(o.units[0]!.availability).toBe('UNAVAILABLE'); // keiner einsatzbereit
    expect(o.counts).toMatchObject({ onDuty: 0, onBreak: 2, unavailable: 1, available: 0 });
    await resumeShift(G, A);
    expect((await dutyOverview(G)).units[0]!.availability).toBe('AVAILABLE');
  });

  it('Status/Fahrzeug/Standort: Mitglieder und Führung ja, Fremde nein; Historie', async () => {
    await duty(A);
    await duty(B);
    const u = await createUnit({ guildId: G, userId: A, callsign: 'Adam 1' });
    const upd = await updateUnit(G, u.id, { status: 'BUSY', location: 'Innenstadt', vehicle: 'Zivilfahrzeug' }, A);
    expect(upd).toMatchObject({ status: 'BUSY', location: 'Innenstadt', vehicle: 'Zivilfahrzeug' });
    await err(updateUnit(G, u.id, { status: 'AVAILABLE' }, B), 'forbidden');
    await updateUnit(G, u.id, { status: 'AVAILABLE' }, B, true);
    await err(updateUnit(G, u.id, { status: 'KAPUTT' }, A), 'invalid');
    await err(updateUnit(G, u.id, { note: 'x'.repeat(101) }, A), 'invalid');
    expect((await unitHistory(G, u.id)).map((e) => e.type)).toEqual(['created', 'updated', 'updated']);
    const o = await dutyOverview(G);
    expect(o.counts.busy).toBe(0);
    expect(o.unassigned.map((x) => x.userId)).toEqual([B]);
  });

  it('Führung teilt zu und löst auf; Dienststatus abgeleitet', async () => {
    await duty(A);
    await duty(B);
    const u = await createUnit({ guildId: G, userId: A, callsign: 'Adam 1' });
    await assignToUnit(G, B, u.id, 'boss');
    expect((await dutyStatusOf(G, B)).state).toBe('IN_UNIT');
    expect((await dutyStatusOf(G, C)).state).toBe('OFF_DUTY');
    await pauseShift(G, B);
    expect((await dutyStatusOf(G, B)).state).toBe('ON_BREAK');
    await err(assignToUnit(G, C, u.id, 'boss'), 'conflict'); // nicht im Dienst
    await disbandUnit(G, u.id, 'boss');
    expect(await getUnitOf(G, A)).toBeNull();
    expect((await dutyStatusOf(G, A)).state).toBe('ON_DUTY');
    expect(await prisma.auditLog.count({ where: { guildId: G, action: 'unit.disbanded' } })).toBe(1);
    await err(disbandUnit(G, u.id, 'boss'), 'not-found');
  });

  it('Parallel: höchstens eine Einheit je Mitglied', async () => {
    await duty(A);
    await duty(B);
    const r = await Promise.allSettled([createUnit({ guildId: G, userId: A, callsign: 'X 1' }), createUnit({ guildId: G, userId: A, callsign: 'X 2' })]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.unitMember.count({ where: { guildId: G, userId: A, openKey: 'open' } })).toBe(1);
  });
});
