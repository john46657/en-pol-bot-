import type { DiscordPort } from '@nexus/automation';
import { assertGuildId, auditRepository, prisma, type Prisma } from '@nexus/database';
import { addEntry, getRecordByUser, setRank } from '@nexus/personnel';
import { checkEligibility, validateRequirements, type RequirementCheck } from '@nexus/qualifications';

/**
 * Beförderungen: Voraussetzungen je Ziel-Dienstgrad (automatisch geprüft), Anträge, Genehmigung/Ablehnung,
 * Rollenwechsel über die Personalakte (`setRank` → `applyRoleChanges`), Historie. Die Voraussetzungen werden beim
 * Antrag **und** bei der Genehmigung geprüft; Abweichungen sind nur als protokollierte Ausnahme möglich.
 */
type Json = Prisma.InputJsonValue;
export const formatNumber = (n: number) => `B-${String(n).padStart(4, '0')}`;

export class PromotionError extends Error {
  constructor(public readonly code: 'invalid' | 'not-found' | 'conflict' | 'forbidden', message: string) {
    super(message);
    this.name = 'PromotionError';
  }
}

// --- Regeln ---------------------------------------------------------------------------------------

export const listRules = (guildId: string) => prisma.promotionRule.findMany({ where: { guildId: assertGuildId(guildId) } });

/** Voraussetzungen für einen Ziel-Dienstgrad festlegen (dieselben Bausteine wie bei Qualifikationen; leer = nur Genehmigung). */
export async function saveRule(guildId: string, rankId: string, requirements: unknown, actorId: string) {
  const gid = assertGuildId(guildId);
  const rank = await prisma.rank.findFirst({ where: { id: rankId, guildId: gid } });
  if (!rank) throw new PromotionError('not-found', 'Dienstgrad nicht gefunden.');
  const clean = await validateRequirements(gid, requirements).catch((e) => {
    throw new PromotionError('invalid', e instanceof Error ? e.message : 'Ungültige Voraussetzungen.');
  });
  const row = await prisma.promotionRule.upsert({ where: { guildId_rankId: { guildId: gid, rankId } }, create: { guildId: gid, rankId, requirements: clean as Json }, update: { requirements: clean as Json } });
  await auditRepository.createRaw({ data: { guildId: gid, actorType: 'USER', actorId, action: 'promotion.rule.saved', resourceType: 'PromotionRule', resourceId: row.id, after: { rank: rank.name, requirements: clean } as Json, permission: 'promotions.manage', result: 'success' } });
  return row;
}

export async function ruleFor(guildId: string, rankId: string) {
  return prisma.promotionRule.findUnique({ where: { guildId_rankId: { guildId: assertGuildId(guildId), rankId } } });
}

/** Voraussetzungen des Ziel-Dienstgrads für ein Mitglied (jede einzeln erklärt). */
export async function checkFor(guildId: string, userId: string, toRankId: string, now = new Date()): Promise<{ eligible: boolean; checks: RequirementCheck[] }> {
  const rule = await ruleFor(guildId, toRankId);
  return checkEligibility(guildId, userId, { requirements: rule?.requirements ?? [] }, now);
}

// --- Anträge ------------------------------------------------------------------------------------------

export async function getRequest(guildId: string, id: string) {
  const r = await prisma.promotionRequest.findFirst({ where: { id, guildId: assertGuildId(guildId) } });
  if (!r) throw new PromotionError('not-found', 'Antrag nicht gefunden.');
  return r;
}
export async function getByNumber(guildId: string, number: number) {
  const r = await prisma.promotionRequest.findUnique({ where: { guildId_number: { guildId: assertGuildId(guildId), number } } });
  if (!r) throw new PromotionError('not-found', `Antrag ${formatNumber(number)} nicht gefunden.`);
  return r;
}

export interface RequestInput {
  guildId: string;
  userId: string;
  toRankId: string;
  requestedBy: string;
  reason?: string | undefined;
  /** Voraussetzungen übergehen (Begründung Pflicht). */
  override?: boolean | undefined;
}

export async function requestPromotion(i: RequestInput, now = new Date()) {
  const gid = assertGuildId(i.guildId);
  if (i.userId === i.requestedBy) throw new PromotionError('forbidden', 'Du kannst dich nicht selbst zur Beförderung vorschlagen.');
  const record = await getRecordByUser(gid, i.userId);
  if (!record || record.status !== 'ACTIVE') throw new PromotionError('not-found', 'Für dieses Mitglied gibt es keine aktive Personalakte.');
  const to = await prisma.rank.findFirst({ where: { id: i.toRankId, guildId: gid, active: true } });
  if (!to) throw new PromotionError('not-found', 'Der Ziel-Dienstgrad existiert nicht oder ist deaktiviert.');
  const from = record.rank;
  if (from && to.order <= from.order) throw new PromotionError('invalid', `„${to.name}“ liegt nicht über dem aktuellen Dienstgrad „${from.name}“.`);
  const reason = i.reason?.trim() || null;
  if (reason && reason.length > 500) throw new PromotionError('invalid', 'Die Begründung ist zu lang (max. 500 Zeichen).');
  const elig = await checkFor(gid, i.userId, to.id, now);
  if (!elig.eligible) {
    if (!i.override) throw new PromotionError('conflict', `Voraussetzungen nicht erfüllt: ${elig.checks.filter((c) => !c.met).map((c) => `${c.label} (${c.detail})`).join('; ')}.`);
    if (!reason || reason.length < 3) throw new PromotionError('invalid', 'Für eine Ausnahme ist eine Begründung nötig (wird protokolliert).');
  }
  try {
    const req = await prisma.$transaction(async (tx) => {
      const c = await tx.promotionCounter.upsert({ where: { guildId: gid }, create: { guildId: gid, last: 1 }, update: { last: { increment: 1 } } });
      return tx.promotionRequest.create({ data: { guildId: gid, number: c.last, userId: i.userId, recordId: record.id, fromRankId: from?.id ?? null, fromRankName: from?.name ?? null, toRankId: to.id, toRankName: to.name, pendingKey: 'pending', requestedBy: i.requestedBy, reason, checks: elig.checks as unknown as Json, override: !elig.eligible } });
    });
    await auditRepository.log({ guildId: gid, actorId: i.requestedBy, action: 'promotion.requested', resource: ['PromotionRequest', req.id], after: { userId: i.userId, from: from?.name ?? null, to: to.name, override: !elig.eligible } as Json, reason, permission: 'promotions.create' });
    return req;
  } catch (e) {
    if (e instanceof Error && /Unique constraint/i.test(e.message)) {
      const open = await prisma.promotionRequest.findFirst({ where: { guildId: gid, userId: i.userId, pendingKey: 'pending' } });
      throw new PromotionError('conflict', `Für dieses Mitglied läuft bereits der Antrag ${open ? formatNumber(open.number) : ''}.`);
    }
    throw e;
  }
}

export interface DecideInput {
  guildId: string;
  requestId: string;
  actorId: string;
  /** `promotions.manage`: darf auch eigene Anträge entscheiden und Voraussetzungen übergehen. */
  manage?: boolean | undefined;
  reason?: string | undefined;
  port?: DiscordPort | undefined;
}

/** Genehmigt: prüft die Voraussetzungen erneut, setzt den Dienstgrad (inkl. Rollenwechsel) und schreibt Akte + Historie. */
export async function approve(i: DecideInput, now = new Date()) {
  const gid = assertGuildId(i.guildId);
  const req = await getRequest(gid, i.requestId);
  if (req.status !== 'PENDING') throw new PromotionError('conflict', 'Dieser Antrag ist bereits entschieden oder zurückgezogen.');
  if (!i.manage && (i.actorId === req.requestedBy || i.actorId === req.userId)) throw new PromotionError('forbidden', 'Antragsteller und Beförderte dürfen nicht selbst genehmigen (Vier-Augen-Prinzip).');
  const elig = await checkFor(gid, req.userId, req.toRankId, now);
  if (!elig.eligible && !req.override) throw new PromotionError('conflict', `Die Voraussetzungen sind inzwischen nicht mehr erfüllt: ${elig.checks.filter((c) => !c.met).map((c) => c.label).join('; ')}.`);
  const record = await getRecordByUser(gid, req.userId);
  if (!record || record.status !== 'ACTIVE') throw new PromotionError('conflict', 'Die Personalakte ist nicht (mehr) aktiv.');
  if (record.rankId !== (req.fromRankId ?? null)) throw new PromotionError('conflict', 'Der Dienstgrad hat sich seit dem Antrag geändert – bitte neu beantragen.');
  const claimed = await prisma.promotionRequest.updateMany({ where: { id: req.id, status: 'PENDING' }, data: { status: 'APPROVED', pendingKey: null, decidedBy: i.actorId, decidedAt: now, decisionReason: i.reason?.trim() || null } });
  if (claimed.count === 0) throw new PromotionError('conflict', 'Der Antrag wurde gerade entschieden.');
  const { roleChange } = await setRank(gid, record.id, req.toRankId, i.actorId, { permission: 'promotions.approve', ...(i.port ? { port: i.port } : {}) });
  await addEntry(gid, record.id, { kind: 'PROMOTION', title: `Beförderung: ${req.fromRankName ?? 'ohne Dienstgrad'} → ${req.toRankName}`, body: [`Antrag ${formatNumber(req.number)}`, req.reason ? `Begründung: ${req.reason}` : '', req.override ? 'Voraussetzungen als Ausnahme übergangen.' : ''].filter(Boolean).join('\n'), occurredAt: now, data: { requestId: req.id, number: req.number, from: req.fromRankId, to: req.toRankId } }, i.actorId);
  const roleResult = roleChange ? roleChange.status : null;
  const saved = await prisma.promotionRequest.update({ where: { id: req.id }, data: { roleResult } });
  await auditRepository.createRaw({ data: { guildId: gid, actorType: 'USER', actorId: i.actorId, action: 'promotion.approved', resourceType: 'PromotionRequest', resourceId: req.id, before: { rank: req.fromRankName } as Json, after: { rank: req.toRankName, userId: req.userId, roleResult } as Json, reason: i.reason?.trim() ?? null, permission: 'promotions.approve', result: 'success' } });
  return { request: saved, roleChange };
}

export async function reject(i: DecideInput, now = new Date()) {
  const gid = assertGuildId(i.guildId);
  const req = await getRequest(gid, i.requestId);
  if (req.status !== 'PENDING') throw new PromotionError('conflict', 'Dieser Antrag ist bereits entschieden oder zurückgezogen.');
  const why = i.reason?.trim();
  if (!why || why.length < 3) throw new PromotionError('invalid', 'Bitte einen Ablehnungsgrund angeben (das Mitglied sieht ihn).');
  const r = await prisma.promotionRequest.updateMany({ where: { id: req.id, status: 'PENDING' }, data: { status: 'REJECTED', pendingKey: null, decidedBy: i.actorId, decidedAt: now, decisionReason: why } });
  if (r.count === 0) throw new PromotionError('conflict', 'Der Antrag wurde gerade entschieden.');
  await auditRepository.createRaw({ data: { guildId: gid, actorType: 'USER', actorId: i.actorId, action: 'promotion.rejected', resourceType: 'PromotionRequest', resourceId: req.id, after: { userId: req.userId, rank: req.toRankName } as Json, reason: why, permission: 'promotions.reject', result: 'success' } });
  return getRequest(gid, req.id);
}

export async function withdraw(guildId: string, requestId: string, actorId: string, manage = false) {
  const gid = assertGuildId(guildId);
  const req = await getRequest(gid, requestId);
  if (req.status !== 'PENDING') throw new PromotionError('conflict', 'Dieser Antrag ist bereits entschieden oder zurückgezogen.');
  if (!manage && req.requestedBy !== actorId) throw new PromotionError('forbidden', 'Nur der Antragsteller kann den Antrag zurückziehen.');
  await prisma.promotionRequest.update({ where: { id: req.id }, data: { status: 'WITHDRAWN', pendingKey: null, decidedBy: actorId, decidedAt: new Date() } });
  await auditRepository.log({ guildId: gid, actorId, action: 'promotion.withdrawn', resource: ['PromotionRequest', req.id], after: { userId: req.userId, to: req.toRankName } as Json });
  return getRequest(gid, req.id);
}

export interface RequestFilter {
  guildId: string;
  status?: string | undefined;
  userId?: string | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}
export async function listRequests(f: RequestFilter) {
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const rows = await prisma.promotionRequest.findMany({
    where: { guildId: assertGuildId(f.guildId), ...(['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'].includes(f.status ?? '') ? { status: f.status as 'PENDING' } : {}), ...(f.userId ? { userId: f.userId } : {}) },
    orderBy: { number: 'desc' },
    take: limit + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
  });
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
}

/** Beförderungshistorie eines Mitglieds (genehmigte Anträge, neueste zuerst). */
export const historyOf = (guildId: string, userId: string) => prisma.promotionRequest.findMany({ where: { guildId: assertGuildId(guildId), userId, status: 'APPROVED' }, orderBy: { decidedAt: 'desc' } });

export interface Candidate {
  userId: string;
  rpName: string;
  fromRank: string | null;
  toRankId: string;
  toRank: string;
  hasOpenRequest: boolean;
}

/**
 * Wer erfüllt die Voraussetzungen des **nächsthöheren** Dienstgrads? (automatische Prüfung für die Führung;
 * höchstens 300 aktive Akten pro Aufruf.)
 */
export async function eligibleCandidates(guildId: string, now = new Date()): Promise<Candidate[]> {
  const gid = assertGuildId(guildId);
  const [ranks, records, pending] = await Promise.all([
    prisma.rank.findMany({ where: { guildId: gid, active: true }, orderBy: { order: 'asc' } }),
    prisma.personnelRecord.findMany({ where: { guildId: gid, status: 'ACTIVE' }, include: { rank: true }, take: 300 }),
    prisma.promotionRequest.findMany({ where: { guildId: gid, status: 'PENDING' }, select: { userId: true } }),
  ]);
  const open = new Set(pending.map((p) => p.userId));
  const out: Candidate[] = [];
  for (const r of records) {
    const next = ranks.find((k) => k.order > (r.rank?.order ?? Number.NEGATIVE_INFINITY));
    if (!next) continue;
    const e = await checkFor(gid, r.userId, next.id, now);
    if (e.eligible) out.push({ userId: r.userId, rpName: r.rpName, fromRank: r.rank?.name ?? null, toRankId: next.id, toRank: next.name, hasOpenRequest: open.has(r.userId) });
  }
  return out;
}
