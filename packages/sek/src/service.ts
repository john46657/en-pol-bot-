import type { DiscordPort } from '@nexus/automation';
import { assertGuildId, prisma, type Prisma } from '@nexus/database';
import { createOperation, getOperation, type CreateInput } from '@nexus/operations';
import { getRecordByUser, setTeam } from '@nexus/personnel';
import { activeAwards, award, revoke } from '@nexus/qualifications';
import { setAccess } from '@nexus/radio';
import { leaderboard, overview, type Period } from '@nexus/shifts';
import { listTrainings } from '@nexus/training';

/**
 * SEK-Modul: bündelt Personal (Team + Qualifikation), Schichten (eigener Shift-Typ), Einsätze (als SEK markiert),
 * Einsatzteams (Trupps), Ausbildungen (SEK-Kurse), Funk (Spezialfunk) und Statistiken auf den allgemeinen Systemen –
 * es gibt keine zweite Datenhaltung. Alles läuft über die Konfiguration „SEK ↔ Team/Qualifikation/Shift-Typ/Kurse“.
 */
type Json = Prisma.InputJsonValue;
const ID = /^\d{5,25}$/;

export class SekError extends Error {
  constructor(public readonly code: 'invalid' | 'not-found' | 'conflict' | 'forbidden', message: string) {
    super(message);
    this.name = 'SekError';
  }
}

// --- Konfiguration ---------------------------------------------------------------------------------

export interface SekConfigInput {
  teamId?: string | null | undefined;
  qualificationId?: string | null | undefined;
  shiftTypeId?: string | null | undefined;
  courseIds?: string[] | undefined;
  applicationId?: string | null | undefined;
}

export const getConfig = (guildId: string) => prisma.sekConfig.findUnique({ where: { guildId: assertGuildId(guildId) } });

export async function requireConfig(guildId: string) {
  const c = await getConfig(guildId);
  if (!c?.teamId || !c.qualificationId) throw new SekError('conflict', 'Das SEK ist noch nicht eingerichtet (Team und Qualifikation fehlen) – bitte im Dashboard unter „SEK“ konfigurieren.');
  return c as typeof c & { teamId: string; qualificationId: string };
}

export async function saveConfig(guildId: string, input: SekConfigInput, actorId: string) {
  const gid = assertGuildId(guildId);
  const checks: [string | null | undefined, () => Promise<number>, string][] = [
    [input.teamId, () => prisma.team.count({ where: { id: input.teamId!, guildId: gid } }), 'Das Team gibt es nicht.'],
    [input.qualificationId, () => prisma.qualification.count({ where: { id: input.qualificationId!, guildId: gid } }), 'Die Qualifikation gibt es nicht.'],
    [input.shiftTypeId, () => prisma.shiftType.count({ where: { id: input.shiftTypeId!, guildId: gid } }), 'Den Shift-Typ gibt es nicht.'],
    [input.applicationId, () => prisma.application.count({ where: { id: input.applicationId!, guildId: gid } }), 'Die Bewerbung gibt es nicht.'],
  ];
  for (const [v, count, msg] of checks) if (v && (await count()) === 0) throw new SekError('invalid', msg);
  const courseIds = [...new Set(input.courseIds ?? [])];
  if (courseIds.length && (await prisma.trainingCourse.count({ where: { guildId: gid, id: { in: courseIds } } })) !== courseIds.length) throw new SekError('invalid', 'Eine der Ausbildungen gibt es nicht.');
  const before = await getConfig(gid);
  const data = { teamId: input.teamId ?? null, qualificationId: input.qualificationId ?? null, shiftTypeId: input.shiftTypeId ?? null, applicationId: input.applicationId ?? null, courseIds };
  const row = await prisma.sekConfig.upsert({ where: { guildId: gid }, create: { guildId: gid, ...data }, update: data });
  await prisma.auditLog.create({ data: { guildId: gid, actorType: 'USER', actorId, action: 'sek.config.saved', resourceType: 'SekConfig', resourceId: gid, ...(before ? { before: before as unknown as Json } : {}), after: data as Json, permission: 'sek.manage', result: 'success' } });
  return row;
}

// --- Personal ----------------------------------------------------------------------------------------

export interface SekMember {
  userId: string;
  recordId: string;
  rpName: string;
  rank: string | null;
  hasQualification: boolean;
  onDuty: 'ON' | 'PAUSED' | 'OFF';
  squads: string[];
}

/** SEK-Personal: aktive Akten im SEK-Team – mit Qualifikationsstand, Dienststatus und Trupps. */
export async function listMembers(guildId: string, now = new Date()): Promise<SekMember[]> {
  const gid = assertGuildId(guildId);
  const cfg = await requireConfig(gid);
  const records = await prisma.personnelRecord.findMany({ where: { guildId: gid, status: 'ACTIVE', teamId: cfg.teamId }, include: { rank: true }, orderBy: { rpName: 'asc' } });
  const userIds = records.map((r) => r.userId);
  const [awards, shifts, squads] = await Promise.all([
    prisma.qualificationAward.findMany({ where: { guildId: gid, qualificationId: cfg.qualificationId, userId: { in: userIds }, revokedAt: null } }),
    prisma.shift.findMany({ where: { guildId: gid, userId: { in: userIds }, status: { in: ['ACTIVE', 'PAUSED'] } } }),
    prisma.sekSquadMember.findMany({ where: { guildId: gid, userId: { in: userIds }, squad: { active: true } }, include: { squad: true } }),
  ]);
  const q = new Set(awards.filter((a) => !a.expiresAt || a.expiresAt > now).map((a) => a.userId));
  return records.map((r) => {
    const s = shifts.find((x) => x.userId === r.userId);
    return { userId: r.userId, recordId: r.id, rpName: r.rpName, rank: r.rank?.name ?? null, hasQualification: q.has(r.userId), onDuty: s ? (s.status === 'PAUSED' ? 'PAUSED' : 'ON') : 'OFF', squads: squads.filter((m) => m.userId === r.userId).map((m) => m.squad.name) };
  });
}

/** Aufnahme: Personalakte → SEK-Team; Qualifikation wird vergeben (nur bei erfüllten Voraussetzungen oder als Ausnahme mit Begründung). */
export async function addMember(i: { guildId: string; userId: string; actorId: string; override?: boolean | undefined; reason?: string | undefined; port?: DiscordPort | undefined }) {
  const gid = assertGuildId(i.guildId);
  const cfg = await requireConfig(gid);
  const record = await getRecordByUser(gid, i.userId);
  if (!record || record.status !== 'ACTIVE') throw new SekError('not-found', 'Für dieses Mitglied gibt es keine aktive Personalakte.');
  if (record.teamId === cfg.teamId && (await activeAwards(gid, i.userId)).some((a) => a.qualificationId === cfg.qualificationId)) throw new SekError('conflict', 'Das Mitglied gehört bereits zum SEK.');
  // erst die Qualifikation (kann an Voraussetzungen scheitern), dann das Team
  const has = (await activeAwards(gid, i.userId)).some((a) => a.qualificationId === cfg.qualificationId);
  let awarded = false;
  if (!has) {
    await award({ guildId: gid, qualificationId: cfg.qualificationId, userId: i.userId, actorId: i.actorId, override: i.override, reason: i.reason, port: i.port }).catch((e) => {
      throw new SekError(e?.code === 'invalid' ? 'invalid' : 'conflict', e instanceof Error ? e.message : 'Die Qualifikation konnte nicht vergeben werden.');
    });
    awarded = true;
  }
  if (record.teamId !== cfg.teamId) await setTeam(gid, record.id, cfg.teamId, i.actorId, { permission: 'sek.member.manage', ...(i.port ? { port: i.port } : {}) });
  await prisma.auditLog.create({ data: { guildId: gid, actorType: 'USER', actorId: i.actorId, action: 'sek.member.added', resourceType: 'PersonnelRecord', resourceId: record.id, after: { userId: i.userId, qualificationAwarded: awarded } as Json, reason: i.reason ?? null, permission: 'sek.member.manage', result: 'success' } });
  return { awarded };
}

export async function removeMember(i: { guildId: string; userId: string; actorId: string; reason?: string | undefined; port?: DiscordPort | undefined }) {
  const gid = assertGuildId(i.guildId);
  const cfg = await requireConfig(gid);
  const record = await getRecordByUser(gid, i.userId);
  if (!record || record.teamId !== cfg.teamId) throw new SekError('not-found', 'Dieses Mitglied gehört nicht zum SEK.');
  if (!i.reason || i.reason.trim().length < 3) throw new SekError('invalid', 'Bitte einen Grund angeben.');
  const a = (await activeAwards(gid, i.userId)).find((x) => x.qualificationId === cfg.qualificationId);
  if (a) await revoke(gid, a.id, i.reason, i.actorId, i.port);
  await setTeam(gid, record.id, null, i.actorId, { permission: 'sek.member.manage', ...(i.port ? { port: i.port } : {}) });
  await prisma.sekSquadMember.deleteMany({ where: { guildId: gid, userId: i.userId } });
  await prisma.auditLog.create({ data: { guildId: gid, actorType: 'USER', actorId: i.actorId, action: 'sek.member.removed', resourceType: 'PersonnelRecord', resourceId: record.id, after: { userId: i.userId } as Json, reason: i.reason.trim(), permission: 'sek.member.manage', result: 'success' } });
}

// --- Einsatzteams (Trupps) ---------------------------------------------------------------------------------

const squadInclude = { members: { orderBy: { role: 'asc' as const } } } satisfies Prisma.SekSquadInclude;

export const listSquads = (guildId: string) => prisma.sekSquad.findMany({ where: { guildId: assertGuildId(guildId) }, include: squadInclude, orderBy: { name: 'asc' } });

export async function saveSquad(guildId: string, input: { id?: string | undefined; name: string; leaderId?: string | undefined; active?: boolean | undefined }, actorId: string) {
  const gid = assertGuildId(guildId);
  const name = input.name?.trim();
  if (!name || name.length > 40) throw new SekError('invalid', 'Der Name fehlt oder ist zu lang (max. 40 Zeichen).');
  if (input.leaderId && !ID.test(input.leaderId)) throw new SekError('invalid', 'Ungültige Discord-ID.');
  try {
    const data = { name, leaderId: input.leaderId ?? null, active: input.active ?? true };
    const row = input.id ? await prisma.sekSquad.update({ where: { id: input.id, guildId: gid }, data, include: squadInclude }) : await prisma.sekSquad.create({ data: { ...data, guildId: gid }, include: squadInclude });
    await prisma.auditLog.create({ data: { guildId: gid, actorType: 'USER', actorId, action: input.id ? 'sek.squad.updated' : 'sek.squad.created', resourceType: 'SekSquad', resourceId: row.id, after: data as Json, permission: 'sek.member.manage', result: 'success' } });
    return row;
  } catch (e) {
    if (e instanceof Error && /Unique constraint/i.test(e.message)) throw new SekError('conflict', 'Ein Einsatzteam mit diesem Namen gibt es schon.');
    if (e instanceof Error && /not found|No record/i.test(e.message)) throw new SekError('not-found', 'Einsatzteam nicht gefunden.');
    throw e;
  }
}

async function assertSquad(guildId: string, id: string) {
  const s = await prisma.sekSquad.findFirst({ where: { id, guildId }, include: squadInclude });
  if (!s) throw new SekError('not-found', 'Einsatzteam nicht gefunden.');
  return s;
}

/** Nur SEK-Mitglieder (Team) dürfen in ein Einsatzteam. */
export async function setSquadMember(guildId: string, squadId: string, userId: string, role: string | undefined, actorId: string) {
  const gid = assertGuildId(guildId);
  const cfg = await requireConfig(gid);
  await assertSquad(gid, squadId);
  const record = await getRecordByUser(gid, userId);
  if (!record || record.teamId !== cfg.teamId) throw new SekError('invalid', 'Nur SEK-Mitglieder können in ein Einsatzteam.');
  const r = role?.trim() || 'Operator';
  if (r.length > 40) throw new SekError('invalid', 'Die Funktion ist zu lang (max. 40 Zeichen).');
  await prisma.sekSquadMember.upsert({ where: { squadId_userId: { squadId, userId } }, create: { guildId: gid, squadId, userId, role: r }, update: { role: r } });
  await prisma.auditLog.create({ data: { guildId: gid, actorType: 'USER', actorId, action: 'sek.squad.member', resourceType: 'SekSquad', resourceId: squadId, after: { userId, role: r } as Json, permission: 'sek.member.manage', result: 'success' } });
  return assertSquad(gid, squadId);
}

export async function removeSquadMember(guildId: string, squadId: string, userId: string, actorId: string) {
  const gid = assertGuildId(guildId);
  await assertSquad(gid, squadId);
  const r = await prisma.sekSquadMember.deleteMany({ where: { squadId, userId } });
  if (r.count === 0) throw new SekError('not-found', 'Das Mitglied gehört nicht zu diesem Einsatzteam.');
  await prisma.auditLog.create({ data: { guildId: gid, actorType: 'USER', actorId, action: 'sek.squad.member.removed', resourceType: 'SekSquad', resourceId: squadId, after: { userId } as Json, permission: 'sek.member.manage', result: 'success' } });
  return assertSquad(gid, squadId);
}

// --- Einsätze ------------------------------------------------------------------------------------------------

/** SEK-Einsatz = normaler Einsatz (Nummer, Status, Bericht, Akteneinträge) + SEK-Kennzeichen. */
export async function createSekOperation(i: CreateInput) {
  await requireConfig(i.guildId);
  const op = await createOperation({ ...i, kind: i.kind.startsWith('SEK') ? i.kind : `SEK: ${i.kind}` });
  await prisma.sekOperation.create({ data: { operationId: op.id, guildId: i.guildId, createdBy: i.actorId } });
  return op;
}

async function assertSekOperation(guildId: string, operationId: string) {
  const s = await prisma.sekOperation.findFirst({ where: { operationId, guildId } });
  if (!s) throw new SekError('not-found', 'Das ist kein SEK-Einsatz.');
  return s;
}

/** Einsatzteam einem SEK-Einsatz zuordnen (Einsatzplanung); die Einheiten weist das Einsatzsystem selbst zu. */
export async function assignSquad(guildId: string, operationId: string, squadId: string, actorId: string) {
  const gid = assertGuildId(guildId);
  await assertSekOperation(gid, operationId);
  const op = await getOperation(gid, operationId);
  if (op.status === 'COMPLETED' || op.status === 'CANCELLED') throw new SekError('conflict', 'Der Einsatz ist beendet.');
  const squad = await assertSquad(gid, squadId);
  if (!squad.active) throw new SekError('conflict', 'Das Einsatzteam ist deaktiviert.');
  if (squad.members.length === 0) throw new SekError('conflict', 'Das Einsatzteam hat keine Mitglieder.');
  try {
    await prisma.sekOperationSquad.create({ data: { operationId, squadId } });
  } catch (e) {
    if (e instanceof Error && /Unique constraint/i.test(e.message)) throw new SekError('conflict', 'Das Einsatzteam ist dem Einsatz schon zugeordnet.');
    throw e;
  }
  await prisma.operationEvent.create({ data: { operationId, guildId: gid, type: 'sek.squad', actorId, data: { squad: squad.name, members: squad.members.map((m) => m.userId) } as Json } });
  return listSekOperations(gid, operationId);
}

export async function listSekOperations(guildId: string, onlyId?: string) {
  const gid = assertGuildId(guildId);
  const sek = await prisma.sekOperation.findMany({ where: { guildId: gid, ...(onlyId ? { operationId: onlyId } : {}) }, include: { squads: { include: { squad: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  const ops = await prisma.operation.findMany({ where: { id: { in: sek.map((s) => s.operationId) } }, include: { units: { where: { activeKey: 'active' } } } });
  return sek.map((s) => ({ ...s, operation: ops.find((o) => o.id === s.operationId)! })).filter((s) => s.operation);
}

/** SEK-Bewerbungen (nur Übersicht ohne Antworten; Bearbeitung läuft im Bewerbungssystem). */
export async function listApplications(guildId: string) {
  const cfg = await getConfig(guildId);
  if (!cfg?.applicationId) return [];
  return prisma.applicationSubmission.findMany({
    where: { guildId: assertGuildId(guildId), applicationId: cfg.applicationId, isTest: false, submittedAt: { not: null } },
    select: { id: true, submissionNumber: true, userId: true, displayNameSnapshot: true, status: true, submittedAt: true },
    orderBy: { submittedAt: 'desc' },
    take: 50,
  });
}

// --- Ausbildungen, Funk, Statistik ----------------------------------------------------------------------------

export async function listSekTrainings(guildId: string) {
  const cfg = await getConfig(guildId);
  if (!cfg?.courseIds.length) return [];
  return (await listTrainings({ guildId, limit: 100 })).filter((t) => cfg.courseIds.includes(t.courseId));
}

/** Prüft, ob eine Ausbildung zum SEK gehört (für Rechte `sek.training.*`). */
export async function isSekCourse(guildId: string, courseId: string): Promise<boolean> {
  return !!(await getConfig(guildId))?.courseIds.includes(courseId);
}

/** Spezialfunk für alle SEK-Mitglieder (Team + Qualifikation) freischalten; bestehende höhere Stufen bleiben. */
export async function syncRadio(guildId: string, actorId: string): Promise<{ granted: string[]; kept: string[] }> {
  const gid = assertGuildId(guildId);
  const members = (await listMembers(gid)).filter((m) => m.hasQualification);
  const granted: string[] = [];
  const kept: string[] = [];
  for (const m of members) {
    const existing = await prisma.radioAccess.findUnique({ where: { guildId_userId: { guildId: gid, userId: m.userId } } });
    if (existing && (existing.special || existing.level === 'FULL')) {
      kept.push(m.userId);
      continue;
    }
    await setAccess({ guildId: gid, userId: m.userId, level: existing?.level ?? 'SPEAK', special: true, reason: 'SEK-Mitglied (automatisch)', actorId, permission: 'sek.member.manage' });
    granted.push(m.userId);
  }
  return { granted, kept };
}

export async function stats(guildId: string, period: Period = 'month', now = new Date()) {
  const gid = assertGuildId(guildId);
  const cfg = await requireConfig(gid);
  const members = await listMembers(gid, now);
  const scope = { guildId: gid, ...(cfg.shiftTypeId ? { typeId: cfg.shiftTypeId } : {}), restrictToTeams: [cfg.teamId], now };
  const sekOps = await prisma.sekOperation.findMany({ where: { guildId: gid }, select: { operationId: true } });
  const ops = await prisma.operation.groupBy({ by: ['status'], where: { id: { in: sekOps.map((s) => s.operationId) } }, _count: { _all: true } });
  const trainings = await listSekTrainings(gid);
  const passed = trainings.flatMap((t) => t.participants).filter((p) => p.status === 'PASSED').length;
  return {
    members: { total: members.length, qualified: members.filter((m) => m.hasQualification).length, onDuty: members.filter((m) => m.onDuty === 'ON').length },
    shifts: cfg.shiftTypeId ? { overview: await overview(scope), leaderboard: await leaderboard({ ...scope, period, limit: 10 }) } : null,
    operations: Object.fromEntries(ops.map((o) => [o.status, o._count._all])),
    trainings: { total: trainings.length, passed },
  };
}

