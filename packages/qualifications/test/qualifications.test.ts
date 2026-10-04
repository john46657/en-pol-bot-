import { prisma } from '@nexus/database';
import { createRecord, saveRank, setRank } from '@nexus/personnel';
import { endShift, saveType, startShift } from '@nexus/shifts';
import { createTraining, enroll, grade, saveCourse, startTraining } from '@nexus/training';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QualificationError, activeAwards, award, checkEligibility, deleteQualification, evaluateAuto, holders, listQualifications, revoke, saveQualification } from '../src/index.js';

const G = 'qualtest-guild';
const [A, B, TR] = ['900000000000150001', '900000000000150002', '900000000000150003'];
const ROLE = '900000000000159001';
const err = (p: Promise<unknown>, code: string) => expect(p).rejects.toSatisfy((e) => e instanceof QualificationError && e.code === code);
const trainer = { userId: TR, manage: true, canExam: true };

function fakePort() {
  const roles = new Map<string, Set<string>>();
  const driver = { getRoleIds: async (u: string) => [...(roles.get(u) ?? [])], add: vi.fn(async (u: string, r: string) => void roles.set(u, (roles.get(u) ?? new Set()).add(r))), remove: vi.fn(async (u: string, r: string) => void roles.get(u)?.delete(r)) };
  return { roles, port: { sendDm: vi.fn(), postMessage: vi.fn(), editMessage: vi.fn(), roleDriver: () => driver } as never };
}

let courseId = '';
let ranks: { low: string; high: string };
async function passCourse(userId: string, port?: never) {
  const t = await createTraining({ guildId: G, courseId, scheduledAt: new Date(Date.now() + 86_400_000), actorId: TR, trainerIds: [TR] });
  await enroll({ guildId: G, trainingId: t.id, userId, actorId: userId });
  await startTraining(G, t.id, trainer);
  await grade({ guildId: G, trainingId: t.id, userId, part: 'THEORY', points: 90, actor: trainer, port });
}

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.trainingCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Qual', settings: { create: {} } } });
  const low = await saveRank(G, { name: 'Anwärter', order: 1, isEntry: true }, 'x');
  const high = await saveRank(G, { name: 'Kommissar', order: 5 }, 'x');
  ranks = { low: low.id, high: high.id };
  for (const u of [A, B]) await createRecord({ guildId: G, userId: u, rpName: u === A ? 'Anna' : 'Bert', actorId: 'x', rankId: low.id });
  courseId = (await saveCourse(G, { name: 'Zugriffstraining', theoryMax: 100, passPercent: 60 }, 'x')).id;
});
afterAll(async () => {
  await prisma.trainingCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Qualifikationen anlegen', () => {
  it('Validierung der Voraussetzungen, Eindeutigkeit, Zyklen', async () => {
    await err(saveQualification(G, { name: '' }, 'b'), 'invalid');
    await err(saveQualification(G, { name: 'X', requirements: [{ type: 'COURSE', courseId: 'nix' }] }, 'b'), 'invalid');
    await err(saveQualification(G, { name: 'X', requirements: [{ type: 'SERVICE_DAYS', days: 0 }] }, 'b'), 'invalid');
    await err(saveQualification(G, { name: 'X', requirements: [{ type: 'MAGIE' }] }, 'b'), 'invalid');
    await err(saveQualification(G, { name: 'X', autoGrant: true }, 'b'), 'invalid');
    await err(saveQualification(G, { name: 'X', validDays: 0 }, 'b'), 'invalid');
    const a = await saveQualification(G, { name: 'SEK' }, 'b');
    await err(saveQualification(G, { name: 'SEK' }, 'b'), 'conflict');
    const b = await saveQualification(G, { name: 'SEK-Leitung', requirements: [{ type: 'QUALIFICATION', qualificationId: a.id }] }, 'b');
    await err(saveQualification(G, { id: a.id, name: 'SEK', requirements: [{ type: 'QUALIFICATION', qualificationId: a.id }] }, 'b'), 'invalid'); // selbst
    await err(saveQualification(G, { id: a.id, name: 'SEK', requirements: [{ type: 'QUALIFICATION', qualificationId: b.id }] }, 'b'), 'invalid'); // Kreis
    await err(deleteQualification(G, a.id, 'b'), 'conflict'); // wird verlangt
    await deleteQualification(G, b.id, 'b');
    expect((await listQualifications(G)).map((q) => q.name)).toEqual(['SEK']);
  });
});

describe('Voraussetzungen prüfen', () => {
  it('alle Arten einzeln erklärt', async () => {
    const base = await saveQualification(G, { name: 'Grund' }, 'b');
    const q = await saveQualification(G, { name: 'Ermittler', requirements: [{ type: 'COURSE', courseId }, { type: 'QUALIFICATION', qualificationId: base.id }, { type: 'RANK', rankId: ranks.high }, { type: 'SERVICE_DAYS', days: 10 }, { type: 'SHIFT_HOURS', hours: 1 }] }, 'b');
    let r = await checkEligibility(G, A, q);
    expect(r.eligible).toBe(false);
    expect(r.checks.map((c) => c.met)).toEqual([false, false, false, false, false]);
    expect(r.checks[2]!.detail).toBe('aktuell: Anwärter');

    await passCourse(A);
    await award({ guildId: G, qualificationId: base.id, userId: A, actorId: TR });
    const rec = await prisma.personnelRecord.findFirstOrThrow({ where: { guildId: G, userId: A } });
    await setRank(G, rec.id, ranks.high, 'x');
    await prisma.personnelRecord.update({ where: { id: rec.id }, data: { joinedAt: new Date(Date.now() - 30 * 86_400_000) } });
    const type = await saveType(G, { name: 'Streife' }, 'x');
    const s = await startShift({ guildId: G, userId: A, typeId: type.id, memberRoleIds: [] }, new Date(Date.now() - 2 * 3600_000));
    await endShift(G, s.id, { actorId: A });
    r = await checkEligibility(G, A, q);
    expect(r.checks.map((c) => [c.met, c.detail])).toEqual([[true, 'bestanden'], [true, 'vorhanden'], [true, 'aktuell: Kommissar'], [true, '30 Tage'], [true, '2 Std.']]);
    expect(r.eligible).toBe(true);
  });
});

describe('Vergabe', () => {
  it('nur bei erfüllten Voraussetzungen – sonst Ausnahme mit Begründung; Akte + Rolle; doppelt verhindert', async () => {
    const { port, roles } = fakePort();
    const q = await saveQualification(G, { name: 'SEK', requirements: [{ type: 'COURSE', courseId }], grantRoleId: ROLE }, 'b');
    await err(award({ guildId: G, qualificationId: q.id, userId: A, actorId: TR, port }), 'conflict');
    await err(award({ guildId: G, qualificationId: q.id, userId: A, actorId: TR, override: true, port }), 'invalid'); // Begründung fehlt
    const ex = await award({ guildId: G, qualificationId: q.id, userId: A, actorId: TR, override: true, reason: 'Sonderfreigabe Leitung', port });
    expect(ex.award).toMatchObject({ override: true, overrideReason: 'Sonderfreigabe Leitung', roleResult: 'add:success' });
    expect(roles.get(A)?.has(ROLE)).toBe(true);
    const rec = await prisma.personnelRecord.findFirstOrThrow({ where: { guildId: G, userId: A } });
    expect(await prisma.personnelEntry.count({ where: { recordId: rec.id, kind: 'QUALIFICATION' } })).toBe(1);
    await err(award({ guildId: G, qualificationId: q.id, userId: A, actorId: TR, override: true, reason: 'nochmal', port }), 'conflict');
    expect(await prisma.auditLog.count({ where: { guildId: G, action: 'qualification.awarded' } })).toBe(1);
    expect((await holders(G, q.id)).map((h) => h.userId)).toEqual([A]);
    // B erfüllt die Voraussetzung → keine Ausnahme nötig, ohne Akte-Eintrag-Fehler
    await passCourse(B);
    expect((await award({ guildId: G, qualificationId: q.id, userId: B, actorId: TR })).award.override).toBe(false);
  });

  it('Entzug: Grund Pflicht, Eintrag widerrufen, Rolle entfernt, erneute Vergabe danach möglich', async () => {
    const { port, roles } = fakePort();
    const q = await saveQualification(G, { name: 'Flug', grantRoleId: ROLE }, 'b');
    const { award: a } = await award({ guildId: G, qualificationId: q.id, userId: A, actorId: TR, port });
    await err(revoke(G, a.id, '', TR, port), 'invalid');
    const r = await revoke(G, a.id, 'Lizenz abgelaufen', TR, port);
    expect(r.roleResult).toBe('remove:success');
    expect(roles.get(A)?.has(ROLE)).toBe(false);
    const entry = await prisma.personnelEntry.findUniqueOrThrow({ where: { id: a.entryId! } });
    expect(entry.revokedAt).not.toBeNull();
    await err(revoke(G, a.id, 'nochmal', TR, port), 'conflict');
    expect(await activeAwards(G, A)).toHaveLength(0);
    await award({ guildId: G, qualificationId: q.id, userId: A, actorId: TR, port }); // erneut
    expect(await activeAwards(G, A)).toHaveLength(1);
  });

  it('Gültigkeit: abgelaufene Qualifikation zählt nicht mehr und lässt sich neu vergeben', async () => {
    const q = await saveQualification(G, { name: 'Erste Hilfe', validDays: 30 }, 'b');
    const t0 = new Date('2026-01-01T00:00:00Z');
    const { award: a } = await award({ guildId: G, qualificationId: q.id, userId: A, actorId: TR }, t0);
    expect(a.expiresAt?.toISOString()).toBe('2026-01-31T00:00:00.000Z');
    expect(await activeAwards(G, A, new Date('2026-01-20T00:00:00Z'))).toHaveLength(1);
    expect(await activeAwards(G, A, new Date('2026-02-02T00:00:00Z'))).toHaveLength(0);
    expect((await holders(G, q.id, new Date('2026-02-02T00:00:00Z')))).toHaveLength(0);
    await award({ guildId: G, qualificationId: q.id, userId: A, actorId: TR }, new Date('2026-02-02T00:00:00Z'));
  });
});

describe('Automatische Vergabe', () => {
  it('nach bestandener Ausbildung (Hook) – auch Ketten; ohne erfüllte Voraussetzungen nicht', async () => {
    const q1 = await saveQualification(G, { name: 'Grundlage', autoGrant: true, requirements: [{ type: 'COURSE', courseId }] }, 'b');
    const q2 = await saveQualification(G, { name: 'Aufbau', autoGrant: true, requirements: [{ type: 'QUALIFICATION', qualificationId: q1.id }] }, 'b');
    const q3 = await saveQualification(G, { name: 'Elite', autoGrant: true, requirements: [{ type: 'COURSE', courseId }, { type: 'SERVICE_DAYS', days: 999 }] }, 'b');
    expect(await evaluateAuto(G, B)).toEqual([]);
    await passCourse(A); // Bestehen löst den Hook aus
    const names = (await activeAwards(G, A)).map((x) => x.qualification.name).sort();
    expect(names).toEqual(['Aufbau', 'Grundlage']);
    expect(names).not.toContain(q3.name);
    const auto = await prisma.qualificationAward.findMany({ where: { guildId: G, userId: A } });
    expect(auto.every((x) => x.awardedBy === null)).toBe(true);
    expect(await prisma.auditLog.count({ where: { guildId: G, action: 'qualification.awarded', actorType: 'AUTOMATION' } })).toBe(2);
    expect(await evaluateAuto(G, A)).toEqual([]); // idempotent
  });
});
