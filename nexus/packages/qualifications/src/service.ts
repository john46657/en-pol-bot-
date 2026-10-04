import { applyRoleChanges, type DiscordPort } from '@nexus/automation';
import { assertGuildId, auditRepository, prisma, type Prisma } from '@nexus/database';
import { addEntry, getRecordByUser, revokeEntry } from '@nexus/personnel';
import { hasPassed, registerPassHook } from '@nexus/training';

/**
 * Qualifikationen auf Basis des Ausbildungssystems. Voraussetzungen sind frei kombinierbar:
 * bestandene Ausbildung, andere Qualifikation, Mindest-Dienstgrad, Dienstzeit in Tagen, Schichtstunden.
 * Vergabe von Hand (nur wenn alle Voraussetzungen erfüllt – oder mit protokollierter Ausnahme) oder automatisch.
 */
type Json = Prisma.InputJsonValue;
const DAY = 86_400_000;
const ID = /^\d{5,25}$/;

export class QualificationError extends Error {
  constructor(public readonly code: 'invalid' | 'not-found' | 'conflict' | 'forbidden', message: string) {
    super(message);
    this.name = 'QualificationError';
  }
}

export type Requirement =
  | { type: 'COURSE'; courseId: string }
  | { type: 'QUALIFICATION'; qualificationId: string }
  | { type: 'RANK'; rankId: string }
  | { type: 'SERVICE_DAYS'; days: number }
  | { type: 'SHIFT_HOURS'; hours: number }
  /** Mindestzeit im aktuellen Dienstgrad (seit der letzten Rangänderung bzw. dem Eintritt). */
  | { type: 'RANK_DAYS'; days: number }
  /** Keine aktive Disziplinarmaßnahme in den letzten N Tagen. */
  | { type: 'NO_DISCIPLINE'; days: number };

export interface RequirementCheck {
  requirement: Requirement;
  label: string;
  met: boolean;
  detail: string;
}

export interface QualificationInput {
  id?: string | undefined;
  name: string;
  description?: string | undefined;
  active?: boolean | undefined;
  requirements?: unknown;
  grantRoleId?: string | undefined;
  autoGrant?: boolean | undefined;
  validDays?: number | undefined;
}

async function parseRequirements(guildId: string, raw: unknown, selfId?: string): Promise<Requirement[]> {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 15) throw new QualificationError('invalid', 'Die Voraussetzungen sind ungültig (max. 15).');
  const out: Requirement[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const type = r?.['type'];
    if (type === 'COURSE') {
      const courseId = String(r['courseId'] ?? '');
      if (!(await prisma.trainingCourse.count({ where: { id: courseId, guildId } }))) throw new QualificationError('invalid', 'Eine verlangte Ausbildung gibt es nicht.');
      out.push({ type, courseId });
    } else if (type === 'QUALIFICATION') {
      const qualificationId = String(r['qualificationId'] ?? '');
      if (qualificationId === selfId) throw new QualificationError('invalid', 'Eine Qualifikation kann nicht sich selbst voraussetzen.');
      if (!(await prisma.qualification.count({ where: { id: qualificationId, guildId } }))) throw new QualificationError('invalid', 'Eine verlangte Qualifikation gibt es nicht.');
      out.push({ type, qualificationId });
    } else if (type === 'RANK') {
      const rankId = String(r['rankId'] ?? '');
      if (!(await prisma.rank.count({ where: { id: rankId, guildId } }))) throw new QualificationError('invalid', 'Ein verlangter Dienstgrad existiert nicht.');
      out.push({ type, rankId });
    } else if (type === 'SERVICE_DAYS' || type === 'SHIFT_HOURS' || type === 'RANK_DAYS' || type === 'NO_DISCIPLINE') {
      const v = Number(r[type === 'SHIFT_HOURS' ? 'hours' : 'days']);
      if (!Number.isInteger(v) || v < 1 || v > 100_000) throw new QualificationError('invalid', 'Tage bzw. Stunden müssen eine ganze Zahl ab 1 sein.');
      out.push(type === 'SHIFT_HOURS' ? { type, hours: v } : { type, days: v });
    } else throw new QualificationError('invalid', 'Unbekannte Voraussetzung.');
  }
  return out;
}

/** Prüft und bereinigt eine Liste von Voraussetzungen (auch für Beförderungsregeln); wirft `QualificationError`. */
export const validateRequirements = (guildId: string, raw: unknown): Promise<Requirement[]> => parseRequirements(assertGuildId(guildId), raw);

/** Zyklen verhindern: A verlangt B verlangt A. */
async function assertNoCycle(guildId: string, id: string, reqs: Requirement[]) {
  const all = await prisma.qualification.findMany({ where: { guildId }, select: { id: true, requirements: true } });
  const deps = new Map(all.map((q) => [q.id, ((q.requirements as unknown as Requirement[]) ?? []).filter((r) => r.type === 'QUALIFICATION').map((r) => (r as { qualificationId: string }).qualificationId)]));
  deps.set(id, reqs.filter((r) => r.type === 'QUALIFICATION').map((r) => (r as { qualificationId: string }).qualificationId));
  const seen = new Set<string>();
  const walk = (n: string): boolean => {
    if (n === id && seen.size > 0) return true;
    if (seen.has(n)) return false;
    seen.add(n);
    return (deps.get(n) ?? []).some(walk);
  };
  if ((deps.get(id) ?? []).some(walk)) throw new QualificationError('invalid', 'Die Voraussetzungen würden einen Kreis bilden (A verlangt B, B verlangt A).');
}

export async function saveQualification(guildId: string, i: QualificationInput, actorId: string) {
  const gid = assertGuildId(guildId);
  const name = i.name?.trim();
  if (!name || name.length > 60) throw new QualificationError('invalid', 'Der Name fehlt oder ist zu lang (max. 60 Zeichen).');
  if ((i.description?.length ?? 0) > 500) throw new QualificationError('invalid', 'Die Beschreibung ist zu lang.');
  if (i.grantRoleId && !ID.test(i.grantRoleId)) throw new QualificationError('invalid', 'Ungültige Rolle.');
  if (i.validDays !== undefined && (!Number.isInteger(i.validDays) || i.validDays < 1 || i.validDays > 3650)) throw new QualificationError('invalid', 'Die Gültigkeit muss 1 bis 3650 Tage betragen.');
  const requirements = await parseRequirements(gid, i.requirements, i.id);
  if (i.autoGrant && requirements.length === 0) throw new QualificationError('invalid', 'Automatische Vergabe braucht mindestens eine Voraussetzung.');
  if (i.id) await assertNoCycle(gid, i.id, requirements);
  const data = { name, description: i.description?.trim() || null, active: i.active ?? true, requirements: requirements as unknown as Json, grantRoleId: i.grantRoleId || null, autoGrant: i.autoGrant ?? false, validDays: i.validDays ?? null };
  try {
    const row = i.id ? await prisma.qualification.update({ where: { id: i.id, guildId: gid }, data }) : await prisma.qualification.create({ data: { ...data, guildId: gid } });
    await auditRepository.createRaw({ data: { guildId: gid, actorType: 'USER', actorId, action: i.id ? 'qualification.updated' : 'qualification.created', resourceType: 'Qualification', resourceId: row.id, after: { ...data, requirements } as Json, permission: 'qualification.manage', result: 'success' } });
    return row;
  } catch (e) {
    if (e instanceof Error && /Unique constraint/i.test(e.message)) throw new QualificationError('conflict', 'Eine Qualifikation mit diesem Namen gibt es schon.');
    if (e instanceof Error && /not found|No record/i.test(e.message)) throw new QualificationError('not-found', 'Qualifikation nicht gefunden.');
    throw e;
  }
}

export async function deleteQualification(guildId: string, id: string, actorId: string) {
  const gid = assertGuildId(guildId);
  const q = await prisma.qualification.findFirst({ where: { id, guildId: gid }, include: { _count: { select: { awards: true } } } });
  if (!q) throw new QualificationError('not-found', 'Qualifikation nicht gefunden.');
  if (q._count.awards > 0) throw new QualificationError('conflict', `Es gibt ${q._count.awards} Vergabe(n) – bitte deaktivieren statt löschen.`);
  const used = (await prisma.qualification.findMany({ where: { guildId: gid, id: { not: id } } })).find((o) => ((o.requirements as unknown as Requirement[]) ?? []).some((r) => r.type === 'QUALIFICATION' && r.qualificationId === id));
  if (used) throw new QualificationError('conflict', `„${used.name}“ setzt diese Qualifikation voraus.`);
  await prisma.qualification.delete({ where: { id } });
  await auditRepository.createRaw({ data: { guildId: gid, actorType: 'USER', actorId, action: 'qualification.deleted', resourceType: 'Qualification', resourceId: id, before: { name: q.name } as Json, permission: 'qualification.manage', result: 'success' } });
}

export const listQualifications = (guildId: string, onlyActive = false) => prisma.qualification.findMany({ where: { guildId: assertGuildId(guildId), ...(onlyActive ? { active: true } : {}) }, orderBy: { name: 'asc' } });

export async function getQualification(guildId: string, id: string) {
  const q = await prisma.qualification.findFirst({ where: { id, guildId: assertGuildId(guildId) } });
  if (!q) throw new QualificationError('not-found', 'Qualifikation nicht gefunden.');
  return q;
}

const isActiveAward = (a: { revokedAt: Date | null; expiresAt: Date | null }, now: Date) => !a.revokedAt && (!a.expiresAt || a.expiresAt > now);

/** Aktive (nicht entzogene, nicht abgelaufene) Qualifikationen eines Mitglieds. */
export async function activeAwards(guildId: string, userId: string, now = new Date()) {
  const rows = await prisma.qualificationAward.findMany({ where: { guildId: assertGuildId(guildId), userId, revokedAt: null }, include: { qualification: true }, orderBy: { awardedAt: 'desc' } });
  return rows.filter((a) => isActiveAward(a, now));
}

/** Prüft jede Voraussetzung einzeln und erklärt das Ergebnis. */
export async function checkEligibility(guildId: string, userId: string, qualification: { requirements: unknown }, now = new Date()): Promise<{ eligible: boolean; checks: RequirementCheck[] }> {
  const gid = assertGuildId(guildId);
  const reqs = (qualification.requirements as Requirement[]) ?? [];
  const record = await getRecordByUser(gid, userId);
  const checks: RequirementCheck[] = [];
  for (const r of reqs) {
    if (r.type === 'COURSE') {
      const c = await prisma.trainingCourse.findUnique({ where: { id: r.courseId } });
      const met = await hasPassed(gid, userId, r.courseId);
      checks.push({ requirement: r, label: `Ausbildung „${c?.name ?? '?'}“ bestanden`, met, detail: met ? 'bestanden' : 'nicht bestanden' });
    } else if (r.type === 'QUALIFICATION') {
      const q = await prisma.qualification.findUnique({ where: { id: r.qualificationId } });
      const has = (await activeAwards(gid, userId, now)).some((a) => a.qualificationId === r.qualificationId);
      checks.push({ requirement: r, label: `Qualifikation „${q?.name ?? '?'}“`, met: has, detail: has ? 'vorhanden' : 'fehlt' });
    } else if (r.type === 'RANK') {
      const need = await prisma.rank.findUnique({ where: { id: r.rankId } });
      const have = record?.rankId ? await prisma.rank.findUnique({ where: { id: record.rankId } }) : null;
      const met = !!need && !!have && have.order >= need.order;
      checks.push({ requirement: r, label: `Mindestens Dienstgrad „${need?.name ?? '?'}“`, met, detail: have ? `aktuell: ${have.name}` : 'kein Dienstgrad' });
    } else if (r.type === 'SERVICE_DAYS') {
      const days = record ? Math.floor((now.getTime() - record.joinedAt.getTime()) / DAY) : 0;
      checks.push({ requirement: r, label: `Mindestens ${r.days} Tage im Dienst`, met: !!record && days >= r.days, detail: record ? `${days} Tage` : 'keine Personalakte' });
    } else if (r.type === 'RANK_DAYS') {
      const last = record ? await prisma.personnelEvent.findFirst({ where: { guildId: gid, recordId: record.id, type: 'rank.changed' }, orderBy: { createdAt: 'desc' } }) : null;
      const since = last?.createdAt ?? record?.joinedAt;
      const days = since ? Math.floor((now.getTime() - since.getTime()) / DAY) : 0;
      checks.push({ requirement: r, label: `Mindestens ${r.days} Tage im aktuellen Dienstgrad`, met: !!record && days >= r.days, detail: record ? `${days} Tage` : 'keine Personalakte' });
    } else if (r.type === 'NO_DISCIPLINE') {
      const n = record ? await prisma.personnelEntry.count({ where: { recordId: record.id, kind: 'DISCIPLINE', revokedAt: null, occurredAt: { gte: new Date(now.getTime() - r.days * DAY) } } }) : 0;
      checks.push({ requirement: r, label: `Keine Disziplinarmaßnahme in den letzten ${r.days} Tagen`, met: !!record && n === 0, detail: record ? (n === 0 ? 'keine' : `${n} aktive`) : 'keine Personalakte' });
    } else {
      const sum = await prisma.shift.aggregate({ where: { guildId: gid, userId, status: 'ENDED' }, _sum: { durationSeconds: true } });
      const hours = Math.floor((sum._sum.durationSeconds ?? 0) / 3600);
      checks.push({ requirement: r, label: `Mindestens ${r.hours} Dienststunden`, met: hours >= r.hours, detail: `${hours} Std.` });
    }
  }
  return { eligible: checks.every((c) => c.met), checks };
}

export interface AwardInput {
  guildId: string;
  qualificationId: string;
  userId: string;
  /** null = automatisch */
  actorId: string | null;
  /// Voraussetzungen übergehen (Begründung Pflicht, wird protokolliert).
  override?: boolean | undefined;
  reason?: string | undefined;
  port?: DiscordPort | undefined;
}

export async function award(i: AwardInput, now = new Date()) {
  const gid = assertGuildId(i.guildId);
  const q = await getQualification(gid, i.qualificationId);
  if (!q.active) throw new QualificationError('conflict', 'Diese Qualifikation ist deaktiviert.');
  if (!ID.test(i.userId)) throw new QualificationError('invalid', 'Ungültige Discord-Benutzer-ID.');
  if ((await activeAwards(gid, i.userId, now)).some((a) => a.qualificationId === q.id)) throw new QualificationError('conflict', 'Das Mitglied besitzt diese Qualifikation bereits.');
  const elig = await checkEligibility(gid, i.userId, q, now);
  const override = !elig.eligible;
  if (override) {
    if (!i.override) throw new QualificationError('conflict', `Voraussetzungen nicht erfüllt: ${elig.checks.filter((c) => !c.met).map((c) => c.label).join('; ')}.`);
    if (!i.reason || i.reason.trim().length < 3) throw new QualificationError('invalid', 'Für eine Ausnahme ist eine Begründung nötig (wird protokolliert).');
  }
  // abgelaufene/entzogene Vergabe blockiert die Eindeutigkeit nicht: activeKey nur bei aktiver
  await prisma.qualificationAward.updateMany({ where: { qualificationId: q.id, userId: i.userId, activeKey: 'active', OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: now } }] }, data: { activeKey: null } });
  let row;
  try {
    row = await prisma.qualificationAward.create({ data: { guildId: gid, qualificationId: q.id, userId: i.userId, activeKey: 'active', awardedBy: i.actorId, expiresAt: q.validDays ? new Date(now.getTime() + q.validDays * DAY) : null, override, overrideReason: override ? i.reason!.trim() : null } });
  } catch (e) {
    if (e instanceof Error && /Unique constraint/i.test(e.message)) throw new QualificationError('conflict', 'Das Mitglied besitzt diese Qualifikation bereits.');
    throw e;
  }
  let entryId: string | null = null;
  const record = await getRecordByUser(gid, i.userId);
  if (record && record.status === 'ACTIVE') {
    const e = await addEntry(gid, record.id, { kind: 'QUALIFICATION', title: `Qualifikation: ${q.name}`.slice(0, 200), body: [row.expiresAt ? `Gültig bis ${row.expiresAt.toLocaleDateString('de-DE')}` : '', override ? `Ausnahme: ${i.reason!.trim()}` : '', i.actorId ? '' : 'Automatisch vergeben'].filter(Boolean).join('\n') || undefined, data: { qualificationId: q.id, awardId: row.id } }, i.actorId);
    entryId = e.id;
  }
  let roleResult: string | null = null;
  if (q.grantRoleId && i.port) {
    const r = await applyRoleChanges({ guildId: gid, userId: i.userId, add: [q.grantRoleId], trigger: `Qualifikation: ${q.name}`, ...(i.actorId ? { actorId: i.actorId } : { automation: 'qualification-auto' }), resourceType: 'Qualification', resourceId: q.id, permission: 'qualification.manage' }, i.port.roleDriver(gid));
    roleResult = `add:${r.status}`;
  }
  const saved = await prisma.qualificationAward.update({ where: { id: row.id }, data: { entryId, roleResult } });
  await auditRepository.createRaw({ data: { guildId: gid, actorType: i.actorId ? 'USER' : 'AUTOMATION', actorId: i.actorId, action: 'qualification.awarded', resourceType: 'QualificationAward', resourceId: row.id, after: { qualification: q.name, userId: i.userId, override, roleResult } as Json, reason: override ? i.reason!.trim() : null, ...(i.actorId ? { permission: 'qualification.manage' } : { automation: 'qualification-auto' }), result: 'success' } });
  return { award: saved, eligibility: elig };
}

export async function revoke(guildId: string, awardId: string, reason: string | undefined, actorId: string, port?: DiscordPort) {
  const gid = assertGuildId(guildId);
  const a = await prisma.qualificationAward.findFirst({ where: { id: awardId, guildId: gid }, include: { qualification: true } });
  if (!a) throw new QualificationError('not-found', 'Vergabe nicht gefunden.');
  const why = reason?.trim();
  if (!why || why.length < 3) throw new QualificationError('invalid', 'Bitte einen Grund für den Entzug angeben.');
  const r = await prisma.qualificationAward.updateMany({ where: { id: awardId, revokedAt: null }, data: { revokedAt: new Date(), revokedBy: actorId, revokeReason: why, activeKey: null } });
  if (r.count === 0) throw new QualificationError('conflict', 'Diese Qualifikation wurde bereits entzogen.');
  if (a.entryId) await revokeEntry(gid, a.entryId, `Qualifikation entzogen: ${why}`, actorId).catch(() => undefined);
  let roleResult: string | null = null;
  if (a.qualification.grantRoleId && port) {
    const stillHas = (await activeAwards(gid, a.userId)).some((x) => x.qualification.grantRoleId === a.qualification.grantRoleId);
    if (!stillHas) {
      const res = await applyRoleChanges({ guildId: gid, userId: a.userId, remove: [a.qualification.grantRoleId], trigger: `Qualifikation entzogen: ${a.qualification.name}`, actorId, resourceType: 'Qualification', resourceId: a.qualificationId, permission: 'qualification.manage' }, port.roleDriver(gid));
      roleResult = `remove:${res.status}`;
    }
  }
  await auditRepository.createRaw({ data: { guildId: gid, actorType: 'USER', actorId, action: 'qualification.revoked', resourceType: 'QualificationAward', resourceId: awardId, before: { qualification: a.qualification.name, userId: a.userId } as Json, reason: why, permission: 'qualification.manage', result: 'success' } });
  return { roleResult };
}

/** Besitzer einer Qualifikation (aktiv). */
export async function holders(guildId: string, qualificationId: string, now = new Date()) {
  const rows = await prisma.qualificationAward.findMany({ where: { guildId: assertGuildId(guildId), qualificationId, revokedAt: null }, orderBy: { awardedAt: 'desc' } });
  return rows.filter((a) => isActiveAward(a, now));
}

/** Automatische Vergabe: alle `autoGrant`-Qualifikationen prüfen, deren Voraussetzungen jetzt erfüllt sind. */
export async function evaluateAuto(guildId: string, userId: string, port?: DiscordPort, now = new Date()): Promise<string[]> {
  const gid = assertGuildId(guildId);
  const have = new Set((await activeAwards(gid, userId, now)).map((a) => a.qualificationId));
  const granted: string[] = [];
  // mehrere Durchläufe: eine neue Qualifikation kann die Voraussetzung einer weiteren erfüllen
  for (let round = 0; round < 5; round++) {
    let progress = false;
    for (const q of await prisma.qualification.findMany({ where: { guildId: gid, active: true, autoGrant: true } })) {
      if (have.has(q.id)) continue;
      if (!(await checkEligibility(gid, userId, q, now)).eligible) continue;
      try {
        await award({ guildId: gid, qualificationId: q.id, userId, actorId: null, port }, now);
        have.add(q.id);
        granted.push(q.name);
        progress = true;
      } catch {
        /* z. B. parallel vergeben – ignorieren */
      }
    }
    if (!progress) break;
  }
  return granted;
}

// Nach bestandener Ausbildung automatische Qualifikationen prüfen.
registerPassHook(async (ctx) => {
  await evaluateAuto(ctx.guildId, ctx.userId, ctx.port);
});
