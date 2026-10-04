import { prisma } from '@nexus/database';
import { createRecord, saveRank } from '@nexus/personnel';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingError, cancelTraining, createTraining, deleteCourse, enroll, evaluate, finishTraining, formatNumber, getTraining, grade, hasPassed, listTrainings, progressOf, saveCourse, setTrainers, startTraining, trainingHistory, updateTraining, withdraw } from '../src/index.js';

const G = 'trainingtest-guild';
const [T1, A, B, C, D] = ['900000000000130001', '900000000000130002', '900000000000130003', '900000000000130004', '900000000000130005'];
const ROLE = '900000000000139001';
const REQ = '900000000000139002';
const future = () => new Date(Date.now() + 86_400_000);
const err = (p: Promise<unknown>, code: string) => expect(p).rejects.toSatisfy((e) => e instanceof TrainingError && e.code === code);
const trainer = { userId: T1, canExam: true };

function fakePort(fail = false) {
  const roles = new Map<string, Set<string>>();
  const driver = {
    getRoleIds: async (u: string) => [...(roles.get(u) ?? [])],
    add: vi.fn(async (u: string, r: string) => {
      if (fail) throw new Error('403');
      roles.set(u, (roles.get(u) ?? new Set()).add(r));
    }),
    remove: vi.fn(async (u: string, r: string) => void roles.get(u)?.delete(r)),
  };
  return { roles, driver, port: { sendDm: vi.fn(), postMessage: vi.fn(), editMessage: vi.fn(), roleDriver: () => driver } as never };
}

let courseId = '';
beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.trainingCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Ausbildung', settings: { create: {} } } });
  const rank = await saveRank(G, { name: 'Anwärter', order: 1, isEntry: true }, 'x');
  await createRecord({ guildId: G, userId: A, rpName: 'Anna', actorId: 'x', rankId: rank.id });
  courseId = (await saveCourse(G, { name: 'Grundausbildung', theoryMax: 40, practiceMax: 30, examMax: 30, passPercent: 60, grantRoleId: ROLE, maxParticipants: 2 }, 'boss')).id;
});
afterAll(async () => {
  await prisma.trainingCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Bewertungsregeln', () => {
  const c = { theoryMax: 40, practiceMax: 30, examMax: 30, passPercent: 60 };
  it('Ergebnis erst bei vollständiger Bewertung', () => {
    expect(evaluate(c, { theoryPoints: 30, practicePoints: null, examPoints: null })).toMatchObject({ complete: false, missing: ['PRACTICE', 'EXAM'], passed: null });
  });
  it.each([
    [{ theoryPoints: 30, practicePoints: 20, examPoints: 20 }, 70, true],
    [{ theoryPoints: 40, practicePoints: 30, examPoints: 10 }, 80, false], // Prüfung einzeln 33 % < 60
    [{ theoryPoints: 20, practicePoints: 15, examPoints: 25 }, 60, true], // genau auf der Grenze
    [{ theoryPoints: 20, practicePoints: 15, examPoints: 24 }, 59, false],
  ])('%j → %s %%, bestanden: %s', (p, percent, passed) => {
    expect(evaluate(c, p)).toMatchObject({ complete: true, percent, passed });
  });
  it('Teile mit Maximum 0 entfallen', () => {
    expect(evaluate({ theoryMax: 50, practiceMax: 0, examMax: 0, passPercent: 50 }, { theoryPoints: 25, practicePoints: null, examPoints: null })).toMatchObject({ complete: true, percent: 50, passed: true, examPercent: null });
  });
});

describe('Ausbildungen (Vorlagen)', () => {
  it('Validierung, Eindeutigkeit, Löschschutz', async () => {
    await err(saveCourse(G, { name: 'x', theoryMax: 0 }, 'b'), 'invalid');
    await err(saveCourse(G, { name: '', theoryMax: 10 }, 'b'), 'invalid');
    await err(saveCourse(G, { name: 'x', theoryMax: 10, passPercent: 0 }, 'b'), 'invalid');
    await err(saveCourse(G, { name: 'x', theoryMax: 1.5 }, 'b'), 'invalid');
    await err(saveCourse(G, { name: 'Grundausbildung', theoryMax: 10 }, 'b'), 'conflict');
    await createTraining({ guildId: G, courseId, scheduledAt: future(), actorId: 'b' });
    await err(deleteCourse(G, courseId, 'b'), 'conflict');
    const c2 = await saveCourse(G, { name: 'Leer', theoryMax: 10 }, 'b');
    await deleteCourse(G, c2.id, 'b');
  });
});

describe('Durchführung', () => {
  const mk = async (extra = {}) => createTraining({ guildId: G, courseId, scheduledAt: future(), actorId: 'boss', trainerIds: [T1], ...extra });

  it('Nummern parallel, Vergangenheit/Ungültiges abgelehnt', async () => {
    const all = await Promise.all([mk(), mk(), mk()]);
    expect(all.map((t) => t.number).sort()).toEqual([1, 2, 3]);
    expect(formatNumber(4)).toBe('T-0004');
    await err(createTraining({ guildId: G, courseId, scheduledAt: new Date(Date.now() - 86_400_000), actorId: 'b' }), 'invalid');
    await err(createTraining({ guildId: G, courseId, scheduledAt: new Date('x'), actorId: 'b' }), 'invalid');
    await err(mk({ trainerIds: ['abc'] }), 'invalid');
  });

  it('Anmeldung: Rollenanforderung, Platzlimit, Doppelanmeldung, Abmelden/Entfernen', async () => {
    await saveCourse(G, { id: courseId, name: 'Grundausbildung', theoryMax: 40, practiceMax: 30, examMax: 30, requiredRoleIds: [REQ], maxParticipants: 2, grantRoleId: ROLE }, 'b');
    const t = await mk();
    await err(enroll({ guildId: G, trainingId: t.id, userId: A, memberRoleIds: [], actorId: A }), 'forbidden');
    await enroll({ guildId: G, trainingId: t.id, userId: A, memberRoleIds: [REQ], actorId: A });
    await err(enroll({ guildId: G, trainingId: t.id, userId: A, memberRoleIds: [REQ], actorId: A }), 'conflict');
    await enroll({ guildId: G, trainingId: t.id, userId: B, actorId: T1, force: true });
    await err(enroll({ guildId: G, trainingId: t.id, userId: C, memberRoleIds: [REQ], actorId: C }), 'conflict'); // voll
    await withdraw(G, t.id, B, B);
    await enroll({ guildId: G, trainingId: t.id, userId: C, memberRoleIds: [REQ], actorId: C });
    await err(withdraw(G, t.id, C, T1), 'invalid'); // Entfernen ohne Grund
    await withdraw(G, t.id, C, T1, 'Unentschuldigt gefehlt');
    await err(withdraw(G, t.id, C, C), 'not-found');
    const t2 = await mk();
    await err(enroll({ guildId: G, trainingId: t2.id, userId: A, memberRoleIds: [REQ], actorId: A }), 'conflict'); // gleiche Ausbildung schon gebucht
    await enroll({ guildId: G, trainingId: t.id, userId: B, memberRoleIds: [REQ], actorId: B }); // nach Abmeldung wieder möglich
    expect((await getTraining(G, t.id)).participants.filter((p) => p.status === 'ENROLLED')).toHaveLength(2);
  });

  it('kompletter Ablauf: starten, bewerten, bestanden → Akte + Rolle; nicht bestanden; beenden', async () => {
    const { port, roles } = fakePort();
    const t = await mk();
    for (const u of [A, B]) await enroll({ guildId: G, trainingId: t.id, userId: u, actorId: u });
    await err(startTraining(G, t.id, { userId: D }), 'forbidden');
    await err(grade({ guildId: G, trainingId: t.id, userId: A, part: 'THEORY', points: 30, actor: trainer }), 'conflict'); // noch nicht gestartet
    await startTraining(G, t.id, trainer);
    await err(grade({ guildId: G, trainingId: t.id, userId: A, part: 'THEORY', points: 30, actor: { userId: D } }), 'forbidden');
    await err(grade({ guildId: G, trainingId: t.id, userId: A, part: 'EXAM', points: 20, actor: { userId: T1 } }), 'forbidden'); // kein Prüfer
    await err(grade({ guildId: G, trainingId: t.id, userId: A, part: 'THEORY', points: 41, actor: trainer }), 'invalid');
    await err(grade({ guildId: G, trainingId: t.id, userId: A, part: 'KUNST', points: 1, actor: trainer }), 'invalid');
    await err(grade({ guildId: G, trainingId: t.id, userId: C, part: 'THEORY', points: 1, actor: trainer }), 'not-found');
    await err(finishTraining(G, t.id, trainer), 'conflict'); // Bewertungen fehlen

    let r = await grade({ guildId: G, trainingId: t.id, userId: A, part: 'THEORY', points: 30, actor: trainer, port });
    expect(r.evaluation.complete).toBe(false);
    await grade({ guildId: G, trainingId: t.id, userId: A, part: 'PRACTICE', points: 20, actor: trainer, port });
    r = await grade({ guildId: G, trainingId: t.id, userId: A, part: 'EXAM', points: 20, actor: trainer, port });
    expect(r.participant).toMatchObject({ status: 'PASSED', percent: 70 });
    expect(r.roleResult).toBe('add:success');
    expect(roles.get(A)?.has(ROLE)).toBe(true);
    const rec = await prisma.personnelRecord.findFirstOrThrow({ where: { guildId: G, userId: A } });
    const entry = await prisma.personnelEntry.findFirstOrThrow({ where: { recordId: rec.id, kind: 'TRAINING' } });
    expect(entry.title).toContain('Grundausbildung');
    expect(entry.title).toContain('70');
    expect(await hasPassed(G, A, courseId)).toBe(true);

    // B (keine Akte): Prüfung nicht bestanden → keine Rolle, kein Eintrag
    await grade({ guildId: G, trainingId: t.id, userId: B, part: 'THEORY', points: 40, actor: trainer, port });
    await grade({ guildId: G, trainingId: t.id, userId: B, part: 'PRACTICE', points: 30, actor: trainer, port });
    r = await grade({ guildId: G, trainingId: t.id, userId: B, part: 'EXAM', points: 10, actor: trainer, port });
    expect(r.participant).toMatchObject({ status: 'FAILED', percent: 80 });
    expect(roles.get(B)?.has(ROLE) ?? false).toBe(false);
    expect(await hasPassed(G, B, courseId)).toBe(false);

    // Korrektur: B Prüfung nachbewertet → bestanden (Rolle jetzt)
    r = await grade({ guildId: G, trainingId: t.id, userId: B, part: 'EXAM', points: 25, actor: trainer, port });
    expect(r.participant.status).toBe('PASSED');
    expect(roles.get(B)?.has(ROLE)).toBe(true);
    // Korrektur: A herabgesetzt → Eintrag widerrufen, Rolle entfernt
    r = await grade({ guildId: G, trainingId: t.id, userId: A, part: 'EXAM', points: 5, actor: trainer, port });
    expect(r.participant.status).toBe('FAILED');
    expect(roles.get(A)?.has(ROLE)).toBe(false);
    expect((await prisma.personnelEntry.findUniqueOrThrow({ where: { id: entry.id } })).revokedAt).not.toBeNull();
    await grade({ guildId: G, trainingId: t.id, userId: A, part: 'EXAM', points: 25, actor: trainer, port });
    expect((await progressOf(G, A)).passed).toHaveLength(1);

    const done = await finishTraining(G, t.id, trainer);
    expect(done.status).toBe('FINISHED');
    await err(grade({ guildId: G, trainingId: t.id, userId: A, part: 'THEORY', points: 1, actor: trainer }), 'conflict');
    await err(enroll({ guildId: G, trainingId: t.id, userId: D, actorId: D }), 'conflict');
    const types = (await trainingHistory(G, t.id)).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['created', 'enrolled', 'started', 'graded', 'passed', 'failed', 'finished']));
  });

  it('Rollenvergabe schlägt fehl → Ergebnis bleibt, Fehler wird gemeldet (nie verschwiegen)', async () => {
    const { port } = fakePort(true);
    const t = await mk();
    await enroll({ guildId: G, trainingId: t.id, userId: A, actorId: A });
    await startTraining(G, t.id, trainer);
    for (const [part, pts] of [['THEORY', 40], ['PRACTICE', 30], ['EXAM', 30]] as const) await grade({ guildId: G, trainingId: t.id, userId: A, part, points: pts, actor: trainer, port });
    const p = (await getTraining(G, t.id)).participants[0]!;
    expect(p.status).toBe('PASSED');
    expect(p.roleResult).toBe('add:failed');
    expect(await prisma.auditLog.count({ where: { guildId: G, action: 'role.change', result: 'failed' } })).toBe(1);
  });

  it('bereits bestandene Ausbildung nicht erneut; durchgefallen → neuer Termin; Ausbilder setzen; Absagen', async () => {
    const t = await mk();
    await enroll({ guildId: G, trainingId: t.id, userId: A, actorId: A });
    await setTrainers(G, t.id, [T1, D], 'lead');
    expect((await getTraining(G, t.id)).trainerIds).toEqual([T1, D]);
    await startTraining(G, t.id, { userId: D });
    for (const [part, pts] of [['THEORY', 5], ['PRACTICE', 5], ['EXAM', 5]] as const) await grade({ guildId: G, trainingId: t.id, userId: A, part, points: pts, actor: { userId: D, canExam: true } });
    await finishTraining(G, t.id, { userId: D });
    await err(enroll({ guildId: G, trainingId: t.id, userId: A, actorId: A }), 'conflict'); // Termin beendet
    const t2 = await mk();
    await enroll({ guildId: G, trainingId: t2.id, userId: A, actorId: A }); // nach Durchfallen neuer Termin möglich
    await updateTraining(G, t2.id, { location: 'Wache 1', maxParticipants: 5 }, 'lead');
    await err(updateTraining(G, t2.id, { maxParticipants: 0 }, 'lead'), 'invalid');
    await err(cancelTraining(G, t2.id, 'Krank', D, false), 'forbidden');
    await err(cancelTraining(G, t2.id, '', T1, false), 'invalid');
    expect((await cancelTraining(G, t2.id, 'Ausbilder krank', T1, false)).status).toBe('CANCELLED');
    expect(await prisma.auditLog.count({ where: { guildId: G, action: 'training.cancelled' } })).toBe(1);
    expect((await listTrainings({ guildId: G, upcoming: true })).length).toBe(0);
    expect((await listTrainings({ guildId: G, userId: A })).length).toBe(2);
  });
});

import { parseBerlin } from '../src/index.js';
describe('Datum (Berlin-Zeit)', () => {
  it('parst Sommer-/Winterzeit und lehnt Ungültiges ab', () => {
    expect(parseBerlin('15.07.2026 18:30')?.toISOString()).toBe('2026-07-15T16:30:00.000Z');
    expect(parseBerlin('15.01.2026 18:30')?.toISOString()).toBe('2026-01-15T17:30:00.000Z');
    expect(parseBerlin('31.02.2026 10:00')).toBeNull();
    expect(parseBerlin('morgen')).toBeNull();
    expect(parseBerlin('1.1.2026 25:00')).toBeNull();
  });
});
