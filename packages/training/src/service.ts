import { applyRoleChanges, type DiscordPort } from '@nexus/automation';
import { assertGuildId, auditRepository, prisma, type Prisma } from '@nexus/database';
import { addEntry, assignNumberAfterTraining, getRecordByUser, revokeEntry } from '@nexus/personnel';
import { TrainingError } from './errors.js';
import { PARTS, PART_LABEL, activeParts, evaluate, maxOf, type Part } from './rules.js';

/**
 * Ausbildungssystem: Ausbildungen (Vorlagen) mit Theorie/Praxis/Prüfung und Punkten, Durchführungen mit Ausbildern und
 * Teilnehmern, Bewertung, bestanden/nicht bestanden, Eintrag „TRAINING“ in der Personalakte und automatische Rolle.
 */
type Json = Prisma.InputJsonValue;
const ID = /^\d{5,25}$/;
export const formatNumber = (n: number) => `T-${String(n).padStart(4, '0')}`;

/** Hooks, die nach einem bestandenen Ergebnis laufen (z. B. automatische Qualifikationen). Fehler brechen die Bewertung nicht ab. */
export interface PassContext {
  guildId: string;
  userId: string;
  courseId: string;
  trainingId: string;
  actorId: string;
  port?: DiscordPort | undefined;
}
const passHooks: ((ctx: PassContext) => Promise<void>)[] = [];
export function registerPassHook(hook: (ctx: PassContext) => Promise<void>): void {
  passHooks.push(hook);
}

const txt = (v: string | undefined | null, max: number, label: string) => {
  const t = v?.trim();
  if (t && t.length > max) throw new TrainingError('invalid', `${label} ist zu lang (max. ${max} Zeichen).`);
  return t || null;
};
async function event(trainingId: string, guildId: string, type: string, actorId: string | null, data?: unknown) {
  await prisma.trainingEvent.create({ data: { trainingId, guildId, type, actorId, ...(data !== undefined ? { data: data as Json } : {}) } });
  if (type !== 'cancelled') await auditRepository.mirrorEvent({ guildId, area: 'training', resourceType: 'Training', resourceId: trainingId, type, actorId, data }); // Absage hat einen eigenen Eintrag
}
const ids = (list: string[] | undefined, label: string, max = 20) => {
  const u = [...new Set(list ?? [])];
  if (u.length > max || u.some((x) => !ID.test(x))) throw new TrainingError('invalid', `Ungültige Angabe bei ${label}.`);
  return u;
};

// --- Ausbildungen (Vorlagen) --------------------------------------------------------------------

export interface CourseInput {
  id?: string | undefined;
  name: string;
  description?: string | undefined;
  active?: boolean | undefined;
  theoryMax?: number | undefined;
  practiceMax?: number | undefined;
  examMax?: number | undefined;
  passPercent?: number | undefined;
  grantRoleId?: string | undefined;
  requiredRoleIds?: string[] | undefined;
  maxParticipants?: number | undefined;
}

export const listCourses = (guildId: string, onlyActive = false) => prisma.trainingCourse.findMany({ where: { guildId: assertGuildId(guildId), ...(onlyActive ? { active: true } : {}) }, orderBy: { name: 'asc' } });

export async function saveCourse(guildId: string, i: CourseInput, actorId: string) {
  const gid = assertGuildId(guildId);
  const name = txt(i.name, 60, 'Der Name');
  if (!name) throw new TrainingError('invalid', 'Der Name der Ausbildung fehlt.');
  const pt = (v: number | undefined, label: string) => {
    const n = v ?? 0;
    if (!Number.isInteger(n) || n < 0 || n > 1000) throw new TrainingError('invalid', `${label}: Punkte müssen eine ganze Zahl von 0 bis 1000 sein.`);
    return n;
  };
  const theoryMax = pt(i.theoryMax, 'Theorie');
  const practiceMax = pt(i.practiceMax, 'Praxis');
  const examMax = pt(i.examMax, 'Prüfung');
  if (theoryMax + practiceMax + examMax === 0) throw new TrainingError('invalid', 'Mindestens ein Teil (Theorie, Praxis oder Prüfung) braucht Punkte.');
  const passPercent = i.passPercent ?? 60;
  if (!Number.isInteger(passPercent) || passPercent < 1 || passPercent > 100) throw new TrainingError('invalid', 'Die Bestehensgrenze muss zwischen 1 und 100 Prozent liegen.');
  const maxParticipants = i.maxParticipants ?? 10;
  if (!Number.isInteger(maxParticipants) || maxParticipants < 1 || maxParticipants > 100) throw new TrainingError('invalid', 'Die Teilnehmerzahl muss zwischen 1 und 100 liegen.');
  if (i.grantRoleId && !ID.test(i.grantRoleId)) throw new TrainingError('invalid', 'Ungültige Rolle.');
  const data = { name, description: txt(i.description, 500, 'Die Beschreibung'), active: i.active ?? true, theoryMax, practiceMax, examMax, passPercent, grantRoleId: i.grantRoleId || null, requiredRoleIds: ids(i.requiredRoleIds, 'Rollen'), maxParticipants };
  try {
    const row = i.id ? await prisma.trainingCourse.update({ where: { id: i.id, guildId: gid }, data }) : await prisma.trainingCourse.create({ data: { ...data, guildId: gid } });
    await auditRepository.createRaw({ data: { guildId: gid, actorType: 'USER', actorId, action: i.id ? 'training.course.updated' : 'training.course.created', resourceType: 'TrainingCourse', resourceId: row.id, after: data as Json, permission: i.id ? 'training.edit' : 'training.create', result: 'success' } });
    return row;
  } catch (e) {
    if (e instanceof Error && /Unique constraint/i.test(e.message)) throw new TrainingError('conflict', 'Eine Ausbildung mit diesem Namen gibt es schon.');
    if (e instanceof Error && /not found|No record/i.test(e.message)) throw new TrainingError('not-found', 'Ausbildung nicht gefunden.');
    throw e;
  }
}

export async function deleteCourse(guildId: string, id: string, actorId: string) {
  const gid = assertGuildId(guildId);
  const c = await prisma.trainingCourse.findFirst({ where: { id, guildId: gid }, include: { _count: { select: { trainings: true } } } });
  if (!c) throw new TrainingError('not-found', 'Ausbildung nicht gefunden.');
  if (c._count.trainings > 0) throw new TrainingError('conflict', `Zu dieser Ausbildung gibt es ${c._count.trainings} Durchführung(en) – bitte deaktivieren statt löschen.`);
  await prisma.trainingCourse.delete({ where: { id } });
  await auditRepository.createRaw({ data: { guildId: gid, actorType: 'USER', actorId, action: 'training.course.deleted', resourceType: 'TrainingCourse', resourceId: id, before: { name: c.name } as Json, permission: 'training.edit', result: 'success' } });
}

// --- Durchführungen ------------------------------------------------------------------------------

const include = { course: true, participants: { orderBy: { joinedAt: 'asc' as const } } } satisfies Prisma.TrainingInclude;

export async function getTraining(guildId: string, id: string) {
  const t = await prisma.training.findFirst({ where: { id, guildId: assertGuildId(guildId) }, include });
  if (!t) throw new TrainingError('not-found', 'Ausbildungstermin nicht gefunden.');
  return t;
}
export async function getByNumber(guildId: string, number: number) {
  const t = await prisma.training.findUnique({ where: { guildId_number: { guildId: assertGuildId(guildId), number } }, include });
  if (!t) throw new TrainingError('not-found', `Termin ${formatNumber(number)} nicht gefunden.`);
  return t;
}

export interface CreateTrainingInput {
  guildId: string;
  courseId: string;
  scheduledAt: Date;
  actorId: string;
  location?: string | undefined;
  notes?: string | undefined;
  trainerIds?: string[] | undefined;
  maxParticipants?: number | undefined;
}

export async function createTraining(i: CreateTrainingInput, now = new Date()) {
  const guildId = assertGuildId(i.guildId);
  const course = await prisma.trainingCourse.findFirst({ where: { id: i.courseId, guildId } });
  if (!course) throw new TrainingError('not-found', 'Ausbildung nicht gefunden.');
  if (!course.active) throw new TrainingError('conflict', 'Diese Ausbildung ist deaktiviert.');
  if (Number.isNaN(i.scheduledAt.getTime())) throw new TrainingError('invalid', 'Ungültiger Termin.');
  if (i.scheduledAt.getTime() < now.getTime() - 3600_000) throw new TrainingError('invalid', 'Der Termin liegt in der Vergangenheit.');
  const max = i.maxParticipants ?? course.maxParticipants;
  if (!Number.isInteger(max) || max < 1 || max > 100) throw new TrainingError('invalid', 'Die Teilnehmerzahl muss zwischen 1 und 100 liegen.');
  const t = await prisma.$transaction(async (tx) => {
    const c = await tx.trainingCounter.upsert({ where: { guildId }, create: { guildId, last: 1 }, update: { last: { increment: 1 } } });
    return tx.training.create({ data: { guildId, number: c.last, courseId: course.id, scheduledAt: i.scheduledAt, location: txt(i.location, 100, 'Der Ort'), notes: txt(i.notes, 500, 'Die Notiz'), trainerIds: ids(i.trainerIds, 'Ausbilder', 10), maxParticipants: max, createdBy: i.actorId }, include });
  });
  await event(t.id, guildId, 'created', i.actorId, { number: t.number, course: course.name });
  return t;
}

/** Ausbilder festlegen (Recht `training.trainer.manage`). */
export async function setTrainers(guildId: string, trainingId: string, trainerIds: string[], actorId: string) {
  const gid = assertGuildId(guildId);
  const t = await getTraining(gid, trainingId);
  if (t.status === 'FINISHED' || t.status === 'CANCELLED') throw new TrainingError('conflict', 'Der Termin ist beendet.');
  const list = ids(trainerIds, 'Ausbilder', 10);
  await prisma.training.update({ where: { id: trainingId }, data: { trainerIds: list } });
  await event(trainingId, gid, 'trainers', actorId, { before: t.trainerIds, after: list });
  return getTraining(gid, trainingId);
}

export async function updateTraining(guildId: string, trainingId: string, patch: { scheduledAt?: Date | undefined; location?: string | undefined; notes?: string | undefined; maxParticipants?: number | undefined }, actorId: string) {
  const gid = assertGuildId(guildId);
  const t = await getTraining(gid, trainingId);
  if (t.status !== 'PLANNED') throw new TrainingError('conflict', 'Nur geplante Termine lassen sich ändern.');
  const data: Prisma.TrainingUpdateInput = {};
  if (patch.scheduledAt) data.scheduledAt = patch.scheduledAt;
  if (patch.location !== undefined) data.location = txt(patch.location, 100, 'Der Ort');
  if (patch.notes !== undefined) data.notes = txt(patch.notes, 500, 'Die Notiz');
  if (patch.maxParticipants !== undefined) {
    const active = t.participants.filter((p) => p.status === 'ENROLLED').length;
    if (!Number.isInteger(patch.maxParticipants) || patch.maxParticipants < Math.max(1, active)) throw new TrainingError('invalid', `Die Teilnehmerzahl darf nicht unter den ${active} angemeldeten liegen.`);
    data.maxParticipants = patch.maxParticipants;
  }
  await prisma.training.update({ where: { id: trainingId }, data });
  await event(trainingId, gid, 'updated', actorId, { patch: { ...patch, scheduledAt: patch.scheduledAt?.toISOString() } });
  return getTraining(gid, trainingId);
}

// --- Anmeldung ---------------------------------------------------------------------------------

export async function enroll(i: { guildId: string; trainingId: string; userId: string; memberRoleIds?: readonly string[] | undefined; actorId: string; force?: boolean | undefined }) {
  const gid = assertGuildId(i.guildId);
  const t = await getTraining(gid, i.trainingId);
  if (t.status !== 'PLANNED') throw new TrainingError('conflict', 'Anmeldungen sind nur für geplante Termine möglich.');
  if (!i.force && t.course.requiredRoleIds.length > 0 && !t.course.requiredRoleIds.some((r) => i.memberRoleIds?.includes(r))) throw new TrainingError('forbidden', `Für „${t.course.name}“ fehlt dir die nötige Rolle.`);
  const taken = t.participants.filter((p) => p.status === 'ENROLLED');
  if (taken.length >= t.maxParticipants) throw new TrainingError('conflict', `Der Termin ist voll (${t.maxParticipants} Plätze).`);
  const passed = await prisma.trainingParticipant.findFirst({ where: { guildId: gid, userId: i.userId, status: 'PASSED', training: { courseId: t.courseId } } });
  if (passed) throw new TrainingError('conflict', `„${t.course.name}“ wurde bereits bestanden.`);
  const other = await prisma.trainingParticipant.findFirst({ where: { guildId: gid, userId: i.userId, status: 'ENROLLED', training: { courseId: t.courseId, status: { in: ['PLANNED', 'RUNNING'] }, id: { not: t.id } } }, include: { training: true } });
  if (other) throw new TrainingError('conflict', `Du bist für „${t.course.name}“ schon bei ${formatNumber(other.training.number)} angemeldet.`);
  const existing = t.participants.find((p) => p.userId === i.userId);
  if (existing && existing.status === 'ENROLLED') throw new TrainingError('conflict', 'Bereits angemeldet.');
  if (existing && existing.status === 'FAILED') throw new TrainingError('conflict', 'Du hast diesen Termin nicht bestanden – melde dich für einen neuen an.');
  const row = existing
    ? await prisma.trainingParticipant.update({ where: { id: existing.id }, data: { status: 'ENROLLED', joinedAt: new Date() } })
    : await prisma.trainingParticipant.create({ data: { guildId: gid, trainingId: t.id, userId: i.userId } });
  await event(t.id, gid, 'enrolled', i.actorId, { userId: i.userId, forced: !!i.force });
  return row;
}

/** Abmelden (selbst) bzw. entfernen (Ausbilder, mit Grund). */
export async function withdraw(guildId: string, trainingId: string, userId: string, actorId: string, reason?: string) {
  const gid = assertGuildId(guildId);
  const t = await getTraining(gid, trainingId);
  const p = t.participants.find((x) => x.userId === userId && x.status === 'ENROLLED');
  if (!p) throw new TrainingError('not-found', 'Keine Anmeldung gefunden.');
  if (t.status === 'FINISHED' || t.status === 'CANCELLED') throw new TrainingError('conflict', 'Der Termin ist beendet.');
  const removed = actorId !== userId;
  if (removed && (!reason || reason.trim().length < 3)) throw new TrainingError('invalid', 'Bitte einen Grund für das Entfernen angeben.');
  if (t.status === 'RUNNING' && !removed) throw new TrainingError('conflict', 'Der Termin läuft bereits – wende dich an den Ausbilder.');
  await prisma.trainingParticipant.update({ where: { id: p.id }, data: { status: removed ? 'REMOVED' : 'WITHDRAWN' } });
  await event(trainingId, gid, removed ? 'removed' : 'withdrawn', actorId, { userId, ...(reason ? { reason: reason.trim() } : {}) });
}

// --- Ablauf & Bewertung ---------------------------------------------------------------------------

export interface Actor {
  userId: string;
  /** `training.manage`/Administrator: darf auch ohne Ausbilder-Zuordnung. */
  manage?: boolean | undefined;
  /** `exam.manage`: darf die Prüfung bewerten. */
  canExam?: boolean | undefined;
}
const isTrainer = (t: { trainerIds: string[] }, a: Actor) => !!a.manage || t.trainerIds.includes(a.userId);

export async function startTraining(guildId: string, trainingId: string, actor: Actor) {
  const gid = assertGuildId(guildId);
  const t = await getTraining(gid, trainingId);
  if (!isTrainer(t, actor)) throw new TrainingError('forbidden', 'Nur die Ausbilder dieses Termins können ihn starten.');
  if (t.status !== 'PLANNED') throw new TrainingError('conflict', 'Der Termin ist nicht mehr geplant.');
  if (t.trainerIds.length === 0) throw new TrainingError('conflict', 'Dem Termin ist noch kein Ausbilder zugewiesen.');
  if (t.participants.filter((p) => p.status === 'ENROLLED').length === 0) throw new TrainingError('conflict', 'Es sind keine Teilnehmer angemeldet.');
  await prisma.training.update({ where: { id: trainingId }, data: { status: 'RUNNING', startedAt: new Date() } });
  await event(trainingId, gid, 'started', actor.userId);
  return getTraining(gid, trainingId);
}

export interface GradeInput {
  guildId: string;
  trainingId: string;
  userId: string;
  part: string;
  points: number;
  actor: Actor;
  /** Für die automatische Rolle (ohne Port keine Rollenänderung). */
  port?: DiscordPort | undefined;
}

export async function grade(i: GradeInput) {
  const gid = assertGuildId(i.guildId);
  if (!(PARTS as readonly string[]).includes(i.part)) throw new TrainingError('invalid', 'Unbekannter Teil (Theorie, Praxis oder Prüfung).');
  const part = i.part as Part;
  const t = await getTraining(gid, i.trainingId);
  if (!isTrainer(t, i.actor)) throw new TrainingError('forbidden', 'Nur die Ausbilder dieses Termins können bewerten.');
  if (part === 'EXAM' && !i.actor.manage && !i.actor.canExam) throw new TrainingError('forbidden', 'Die Prüfung dürfen nur Prüfer bewerten (Recht „Prüfungen verwalten“).');
  if (t.status !== 'RUNNING') throw new TrainingError('conflict', 'Bewertet wird nur bei laufenden Terminen.');
  const max = maxOf(t.course, part);
  if (max === 0) throw new TrainingError('invalid', `Diese Ausbildung hat keinen Teil „${PART_LABEL[part]}“.`);
  if (!Number.isInteger(i.points) || i.points < 0 || i.points > max) throw new TrainingError('invalid', `Die Punkte für ${PART_LABEL[part]} müssen eine ganze Zahl von 0 bis ${max} sein.`);
  const p = t.participants.find((x) => x.userId === i.userId && (x.status === 'ENROLLED' || x.status === 'PASSED' || x.status === 'FAILED'));
  if (!p) throw new TrainingError('not-found', 'Dieses Mitglied nimmt nicht an dem Termin teil.');
  const field = ({ THEORY: 'theoryPoints', PRACTICE: 'practicePoints', EXAM: 'examPoints' } as const)[part];
  const before = p[field];
  const updated = await prisma.trainingParticipant.update({ where: { id: p.id }, data: { [field]: i.points, gradedBy: i.actor.userId } });
  await event(i.trainingId, gid, 'graded', i.actor.userId, { userId: i.userId, part, before, after: i.points });
  return settle(t, updated, i.actor.userId, i.port);
}

/** Wertet einen Teilnehmer aus, sobald alle Teile vorliegen; spätere Korrekturen drehen das Ergebnis ggf. um. */
async function settle(t: Awaited<ReturnType<typeof getTraining>>, p: Prisma.TrainingParticipantGetPayload<object>, actorId: string, port?: DiscordPort) {
  const gid = t.guildId;
  const ev = evaluate(t.course, p);
  if (!ev.complete) return { participant: p, evaluation: ev, roleResult: null as string | null };
  const status = ev.passed ? 'PASSED' : 'FAILED';
  const changed = p.status !== status;
  let entryId = p.entryId;
  let roleResult = p.roleResult;
  if (changed || p.percent !== ev.percent) {
    if (status === 'PASSED' && !entryId) {
      const record = await getRecordByUser(gid, p.userId);
      if (record && record.status === 'ACTIVE') {
        const e = await addEntry(gid, record.id, { kind: 'TRAINING', title: `Ausbildung bestanden: ${t.course.name} (${ev.percent} %)`.slice(0, 200), body: `Termin ${formatNumber(t.number)}${t.location ? `, ${t.location}` : ''}`, data: { trainingId: t.id, courseId: t.courseId, percent: ev.percent } }, actorId);
        entryId = e.id;
      }
    }
    if (status === 'FAILED' && entryId) {
      await revokeEntry(gid, entryId, 'Ergebnis nach Korrektur: nicht bestanden', actorId).catch(() => undefined);
      entryId = null;
    }
    if (t.course.grantRoleId && port && (changed || !roleResult)) {
      const r = await applyRoleChanges({ guildId: gid, userId: p.userId, ...(status === 'PASSED' ? { add: [t.course.grantRoleId] } : { remove: [t.course.grantRoleId] }), trigger: status === 'PASSED' ? 'Ausbildung bestanden' : 'Ausbildung: Ergebnis korrigiert', actorId, resourceType: 'Training', resourceId: t.id, permission: 'training.session.manage' }, port.roleDriver(gid));
      roleResult = `${status === 'PASSED' ? 'add' : 'remove'}:${r.status}`;
    }
  }
  const saved = await prisma.trainingParticipant.update({ where: { id: p.id }, data: { status, percent: ev.percent, finalizedAt: p.finalizedAt ?? new Date(), entryId, roleResult } });
  if (status === 'PASSED') await assignNumberAfterTraining(gid, p.userId, actorId).catch(() => undefined); // erste bestandene Ausbildung → Dienstnummer
  if (status === 'PASSED') for (const hook of passHooks) await hook({ guildId: gid, userId: p.userId, courseId: t.courseId, trainingId: t.id, actorId, port }).catch(() => undefined);
  if (changed) await event(t.id, gid, status === 'PASSED' ? 'passed' : 'failed', actorId, { userId: p.userId, percent: ev.percent, roleResult });
  return { participant: saved, evaluation: ev, roleResult };
}

export async function finishTraining(guildId: string, trainingId: string, actor: Actor) {
  const gid = assertGuildId(guildId);
  const t = await getTraining(gid, trainingId);
  if (!isTrainer(t, actor)) throw new TrainingError('forbidden', 'Nur die Ausbilder dieses Termins können ihn beenden.');
  if (t.status !== 'RUNNING') throw new TrainingError('conflict', 'Der Termin läuft nicht.');
  const open = t.participants.filter((p) => p.status === 'ENROLLED');
  if (open.length > 0) {
    const names = open.map((p) => `<@${p.userId}> (fehlt: ${evaluate(t.course, p).missing.map((m) => PART_LABEL[m]).join(', ')})`).join('; ');
    throw new TrainingError('conflict', `Es fehlen Bewertungen: ${names}. Bewerte alle Teile oder entferne die Teilnehmer.`);
  }
  await prisma.training.update({ where: { id: trainingId }, data: { status: 'FINISHED', finishedAt: new Date() } });
  await event(trainingId, gid, 'finished', actor.userId, { passed: t.participants.filter((p) => p.status === 'PASSED').length, failed: t.participants.filter((p) => p.status === 'FAILED').length });
  return getTraining(gid, trainingId);
}

export async function cancelTraining(guildId: string, trainingId: string, reason: string | undefined, actorId: string, manage: boolean) {
  const gid = assertGuildId(guildId);
  const t = await getTraining(gid, trainingId);
  if (!manage && !t.trainerIds.includes(actorId)) throw new TrainingError('forbidden', 'Nur die Ausbilder oder die Ausbildungsleitung können absagen.');
  if (t.status === 'FINISHED' || t.status === 'CANCELLED') throw new TrainingError('conflict', 'Der Termin ist bereits beendet.');
  if (!reason || reason.trim().length < 3) throw new TrainingError('invalid', 'Bitte einen Grund angeben.');
  await prisma.training.update({ where: { id: trainingId }, data: { status: 'CANCELLED', finishedAt: new Date() } });
  await event(trainingId, gid, 'cancelled', actorId, { reason: reason.trim() });
  await auditRepository.createRaw({ data: { guildId: gid, actorType: 'USER', actorId, action: 'training.cancelled', resourceType: 'Training', resourceId: trainingId, before: { number: t.number, status: t.status } as Json, reason: reason.trim(), permission: 'training.session.manage', result: 'success' } });
  return getTraining(gid, trainingId);
}

// --- Abfragen ---------------------------------------------------------------------------------------

export async function listTrainings(f: { guildId: string; status?: string | undefined; courseId?: string | undefined; upcoming?: boolean | undefined; userId?: string | undefined; limit?: number | undefined }) {
  return prisma.training.findMany({
    where: {
      guildId: assertGuildId(f.guildId),
      ...(['PLANNED', 'RUNNING', 'FINISHED', 'CANCELLED'].includes(f.status ?? '') ? { status: f.status as 'PLANNED' } : {}),
      ...(f.upcoming ? { status: { in: ['PLANNED', 'RUNNING'] } } : {}),
      ...(f.courseId ? { courseId: f.courseId } : {}),
      ...(f.userId ? { participants: { some: { userId: f.userId } } } : {}),
    },
    orderBy: { scheduledAt: 'desc' },
    take: Math.min(Math.max(f.limit ?? 50, 1), 200),
    include,
  });
}

/** Eigener Ausbildungsstand: bestandene Ausbildungen, laufende Anmeldungen, Ergebnisse. */
export async function progressOf(guildId: string, userId: string) {
  const rows = await prisma.trainingParticipant.findMany({ where: { guildId: assertGuildId(guildId), userId }, include: { training: { include: { course: true } } }, orderBy: { joinedAt: 'desc' } });
  return {
    passed: rows.filter((r) => r.status === 'PASSED').map((r) => ({ courseId: r.training.courseId, course: r.training.course.name, percent: r.percent, at: r.finalizedAt })),
    enrolled: rows.filter((r) => r.status === 'ENROLLED').map((r) => ({ trainingId: r.trainingId, number: r.training.number, course: r.training.course.name, scheduledAt: r.training.scheduledAt, status: r.training.status })),
    all: rows,
  };
}

/** Hat das Mitglied diese Ausbildung bestanden? (Grundlage für Qualifikationen, Phase 22.) */
export async function hasPassed(guildId: string, userId: string, courseId: string): Promise<boolean> {
  return (await prisma.trainingParticipant.count({ where: { guildId: assertGuildId(guildId), userId, status: 'PASSED', training: { courseId } } })) > 0;
}

export const trainingHistory = (guildId: string, trainingId: string) => prisma.trainingEvent.findMany({ where: { guildId: assertGuildId(guildId), trainingId }, orderBy: { at: 'asc' } });
export { activeParts, PART_LABEL };
