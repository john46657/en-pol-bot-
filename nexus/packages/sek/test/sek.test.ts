import { prisma } from '@nexus/database';
import { assignUnit as assignOpUnit, changeStatus } from '@nexus/operations';
import { createRecord, saveRank, saveTeam } from '@nexus/personnel';
import { saveQualification } from '@nexus/qualifications';
import { checkMember, saveChannel } from '@nexus/radio';
import { createUnit, endShift, saveType, startShift } from '@nexus/shifts';
import { createTraining, enroll, grade, saveCourse, startTraining } from '@nexus/training';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { SekError, addMember, assignSquad, createSekOperation, getConfig, isSekCourse, listMembers, listSekOperations, listSekTrainings, listSquads, removeMember, removeSquadMember, saveConfig, saveSquad, setSquadMember, stats, syncRadio } from '../src/index.js';

const G = 'sektest-guild';
const [A, B, C, BOSS] = ['900000000000190001', '900000000000190002', '900000000000190003', '900000000000190004'];
const CH_SPECIAL = '800000000000190001';
const err = (p: Promise<unknown>, code: string) => expect(p).rejects.toSatisfy((e) => e instanceof SekError && e.code === code);
let ids: { team: string; qual: string; type: string; course: string };

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.sekConfig.deleteMany({ where: { guildId: G } });
  await prisma.operationCounter.deleteMany({ where: { guildId: G } });
  await prisma.trainingCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'SEK', settings: { create: {} } } });
  const rank = await saveRank(G, { name: 'Beamter', order: 1, isEntry: true }, 'x');
  for (const [u, n] of [[A, 'Anna'], [B, 'Bert'], [C, 'Carla']] as const) await createRecord({ guildId: G, userId: u, rpName: n, actorId: 'x', rankId: rank.id });
  const team = await saveTeam(G, { name: 'SEK' }, 'x');
  const course = await saveCourse(G, { name: 'SEK-Grundkurs', theoryMax: 100, passPercent: 60 }, 'x');
  const qual = await saveQualification(G, { name: 'SEK', requirements: [{ type: 'COURSE', courseId: course.id }] }, 'x');
  const type = await saveType(G, { name: 'SEK-Dienst' }, 'x');
  ids = { team: team.id, qual: qual.id, type: type.id, course: course.id };
});
afterAll(async () => {
  await prisma.sekConfig.deleteMany({ where: { guildId: G } });
  await prisma.operationCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

const configure = () => saveConfig(G, { teamId: ids.team, qualificationId: ids.qual, shiftTypeId: ids.type, courseIds: [ids.course] }, 'boss');
const passCourse = async (userId: string) => {
  const trainer = { userId: BOSS, manage: true, canExam: true };
  const t = await createTraining({ guildId: G, courseId: ids.course, scheduledAt: new Date(Date.now() + 86_400_000), actorId: BOSS, trainerIds: [BOSS] });
  await enroll({ guildId: G, trainingId: t.id, userId, actorId: userId });
  await startTraining(G, t.id, trainer);
  await grade({ guildId: G, trainingId: t.id, userId, part: 'THEORY', points: 90, actor: trainer });
};

describe('Konfiguration', () => {
  it('ohne Einrichtung nichts möglich; Validierung; Audit', async () => {
    await err(listMembers(G), 'conflict');
    await err(saveConfig(G, { teamId: 'nix' }, 'b'), 'invalid');
    await err(saveConfig(G, { courseIds: ['nix'] }, 'b'), 'invalid');
    await err(saveConfig(G, { shiftTypeId: 'nix' }, 'b'), 'invalid');
    await configure();
    expect((await getConfig(G))?.courseIds).toEqual([ids.course]);
    expect(await isSekCourse(G, ids.course)).toBe(true);
    expect(await isSekCourse(G, 'anderer')).toBe(false);
    expect(await prisma.auditLog.count({ where: { guildId: G, action: 'sek.config.saved' } })).toBe(1);
  });
});

describe('SEK-Personal', () => {
  beforeEach(configure);
  it('Aufnahme verlangt die Qualifikation (Ausbildung) – sonst Ausnahme mit Begründung; Team + Qualifikation gesetzt', async () => {
    await err(addMember({ guildId: G, userId: A, actorId: 'boss' }), 'conflict');
    await err(addMember({ guildId: G, userId: A, actorId: 'boss', override: true }), 'invalid');
    await passCourse(B);
    await addMember({ guildId: G, userId: B, actorId: 'boss' });
    await addMember({ guildId: G, userId: A, actorId: 'boss', override: true, reason: 'Quereinsteiger' });
    const m = await listMembers(G);
    expect(m.map((x) => [x.rpName, x.hasQualification, x.onDuty])).toEqual([['Anna', true, 'OFF'], ['Bert', true, 'OFF']]);
    await err(addMember({ guildId: G, userId: B, actorId: 'boss' }), 'conflict');
    await err(addMember({ guildId: G, userId: 'x1', actorId: 'boss' }), 'not-found');
  });
  it('Entfernen: Grund Pflicht; Team, Qualifikation und Truppzugehörigkeit weg', async () => {
    await addMember({ guildId: G, userId: A, actorId: 'boss', override: true, reason: 'Test' });
    const sq = await saveSquad(G, { name: 'Alpha' }, 'boss');
    await setSquadMember(G, sq.id, A, 'Scharfschütze', 'boss');
    await err(removeMember({ guildId: G, userId: A, actorId: 'boss' }), 'invalid');
    await removeMember({ guildId: G, userId: A, actorId: 'boss', reason: 'Versetzung' });
    expect(await listMembers(G)).toHaveLength(0);
    expect(await prisma.sekSquadMember.count({ where: { guildId: G } })).toBe(0);
    expect(await prisma.qualificationAward.count({ where: { guildId: G, userId: A, revokedAt: { not: null } } })).toBe(1);
    await err(removeMember({ guildId: G, userId: A, actorId: 'boss', reason: 'nochmal' }), 'not-found');
  });
});

describe('Einsatzteams und SEK-Einsätze', () => {
  beforeEach(async () => {
    await configure();
    for (const u of [A, B]) await addMember({ guildId: G, userId: u, actorId: 'boss', override: true, reason: 'Test' });
  });
  it('Trupp-Verwaltung: nur SEK-Mitglieder, Funktionen, Eindeutigkeit', async () => {
    const sq = await saveSquad(G, { name: 'Alpha', leaderId: A }, 'boss');
    await err(saveSquad(G, { name: 'Alpha' }, 'boss'), 'conflict');
    await err(saveSquad(G, { name: '' }, 'boss'), 'invalid');
    await err(setSquadMember(G, sq.id, C, undefined, 'boss'), 'invalid'); // C kein SEK
    await setSquadMember(G, sq.id, A, 'Einsatzleiter', 'boss');
    const r = await setSquadMember(G, sq.id, B, undefined, 'boss');
    expect(r.members.map((m) => [m.userId, m.role]).sort()).toEqual([[A, 'Einsatzleiter'], [B, 'Operator']]);
    await removeSquadMember(G, sq.id, B, 'boss');
    await err(removeSquadMember(G, sq.id, B, 'boss'), 'not-found');
    expect((await listSquads(G))[0]!.members).toHaveLength(1);
  });
  it('SEK-Einsatz: eigene Kennzeichnung, Trupp zuordnen, normaler Einsatz-Lebenszyklus mit Akten', async () => {
    const op = await createSekOperation({ guildId: G, actorId: 'boss', kind: 'Geiselnahme', location: 'Bank' });
    expect(op.kind).toBe('SEK: Geiselnahme');
    const normal = await prisma.operation.count({ where: { guildId: G } });
    expect(normal).toBe(1);
    const sq = await saveSquad(G, { name: 'Alpha' }, 'boss');
    await err(assignSquad(G, op.id, sq.id, 'boss'), 'conflict'); // leer
    await setSquadMember(G, sq.id, A, 'Einsatzleiter', 'boss');
    await assignSquad(G, op.id, sq.id, 'boss');
    await err(assignSquad(G, op.id, sq.id, 'boss'), 'conflict');
    await err(assignSquad(G, 'kein-sek-einsatz', sq.id, 'boss'), 'not-found');
    // Streife der SEK-Mitglieder in den Einsatz (Einsatzsystem)
    const type = await prisma.shiftType.findUniqueOrThrow({ where: { id: ids.type } });
    await startShift({ guildId: G, userId: A, typeId: type.id, memberRoleIds: [] });
    const unit = await createUnit({ guildId: G, userId: A, callsign: 'SEK Alpha' });
    await assignOpUnit(G, op.id, unit.id, 'boss');
    await changeStatus({ guildId: G, operationId: op.id, to: 'ACTIVE', actorId: 'boss' });
    const done = await changeStatus({ guildId: G, operationId: op.id, to: 'COMPLETED', actorId: 'boss', report: 'Geiseln befreit, Täter festgenommen.' });
    expect(done.transferred).toEqual([A]);
    const list = await listSekOperations(G);
    expect(list).toHaveLength(1);
    expect(list[0]!.squads[0]!.squad.name).toBe('Alpha');
    expect(list[0]!.operation.status).toBe('COMPLETED');
  });
});

describe('SEK-Funk, Ausbildungen, Statistik', () => {
  beforeEach(async () => {
    await configure();
    for (const u of [A, B]) await addMember({ guildId: G, userId: u, actorId: 'boss', override: true, reason: 'Test' });
  });
  it('Spezialfunk-Sync: SEK-Mitglieder bekommen Zugriff auf Spezialfunk, höhere Stufen bleiben', async () => {
    await saveChannel(G, { channelId: CH_SPECIAL, name: 'SEK-Funk', area: 'SPECIAL' }, 'x');
    await prisma.radioAccess.create({ data: { guildId: G, userId: B, level: 'FULL', special: true, grantedBy: 'x' } });
    const r = await syncRadio(G, 'boss');
    expect(r).toEqual({ granted: [A], kept: [B] });
    expect((await checkMember(G, A)).channels[0]).toMatchObject({ access: 'speak' });
    expect((await checkMember(G, C)).channels[0]).toMatchObject({ access: 'none' });
    expect((await syncRadio(G, 'boss')).granted).toEqual([]); // idempotent
  });
  it('SEK-Ausbildungen und Statistik aus den allgemeinen Systemen', async () => {
    await passCourse(C);
    expect(await listSekTrainings(G)).toHaveLength(1);
    const type = await prisma.shiftType.findUniqueOrThrow({ where: { id: ids.type } });
    const other = await saveType(G, { name: 'Streife' }, 'x');
    const t0 = new Date(Date.now() - 3 * 3600_000);
    const s = await startShift({ guildId: G, userId: A, typeId: type.id, memberRoleIds: [] }, t0);
    await endShift(G, s.id, { actorId: A }, new Date(t0.getTime() + 2 * 3600_000));
    const s2 = await startShift({ guildId: G, userId: A, typeId: other.id, memberRoleIds: [] }, t0); // normale Streife zählt nicht
    await endShift(G, s2.id, { actorId: A }, new Date(t0.getTime() + 3600_000));
    await createSekOperation({ guildId: G, actorId: 'boss', kind: 'Zugriff', location: 'Hafen' });
    const st = await stats(G, 'all');
    expect(st.members).toMatchObject({ total: 2, qualified: 2, onDuty: 0 });
    expect(st.shifts!.leaderboard.map((e) => [e.userId, e.totalSeconds])).toEqual([[A, 7200]]);
    expect(st.shifts!.overview.find((o) => o.period === 'all')).toMatchObject({ count: 1, totalSeconds: 7200 });
    expect(st.operations).toEqual({ REQUESTED: 1 });
    expect(st.trainings).toEqual({ total: 1, passed: 1 });
  });
});
