import { assertGuildId, auditRepository, prisma, type Prisma } from '@nexus/database';
import { addEntry, getRecordByUser } from '@nexus/personnel';
import { OperationError } from './errors.js';
import { PRIORITIES, STATUSES, canTransition, formatNumber, isOpen, type OpPriority, type OpStatus } from './status.js';

/**
 * Einsatzsystem: Einsatznummer (fortlaufend, atomar), Ort, Priorität, Art, Beschreibung, Einheiten, Einsatzleiter,
 * Status (angefordert → angefahren → aktiv → abgeschlossen/abgebrochen) und Abschlussbericht.
 *
 * Verknüpfung: Eine zugewiesene Einheit steht auf „Im Einsatz“ (Phase 14) und wird beim Ende auf ihren früheren Status
 * zurückgesetzt. Beim Abschluss entsteht für jeden Beteiligten ein Eintrag „OPERATION“ in der Personalakte.
 */
type Json = Prisma.InputJsonValue;
const text = (v: string | undefined, max: number) => {
  const t = v?.trim();
  if (t && t.length > max) throw new OperationError('invalid', `Der Text ist zu lang (max. ${max} Zeichen).`);
  return t || undefined;
};

async function event(operationId: string, guildId: string, type: string, actorId: string | null, data?: unknown) {
  await prisma.operationEvent.create({ data: { operationId, guildId, type, actorId, ...(data !== undefined ? { data: data as Json } : {}) } });
  // Abbruch hat einen eigenen Audit-Eintrag (mit Grund und Berechtigung)
  if (!(type === 'status' && (data as { to?: string } | undefined)?.to === 'CANCELLED')) await auditRepository.mirrorEvent({ guildId, area: 'operation', resourceType: 'Operation', resourceId: operationId, type, actorId, data });
}

const include = { units: { where: { activeKey: 'active' as const }, orderBy: { assignedAt: 'asc' as const } }, participants: true } satisfies Prisma.OperationInclude;

export async function getOperation(guildId: string, id: string) {
  const op = await prisma.operation.findFirst({ where: { id, guildId: assertGuildId(guildId) }, include });
  if (!op) throw new OperationError('not-found', 'Einsatz nicht gefunden.');
  return op;
}

export async function getByNumber(guildId: string, number: number) {
  const op = await prisma.operation.findUnique({ where: { guildId_number: { guildId: assertGuildId(guildId), number } }, include });
  if (!op) throw new OperationError('not-found', `Einsatz ${formatNumber(number)} nicht gefunden.`);
  return op;
}

export interface CreateInput {
  guildId: string;
  actorId: string;
  kind: string;
  location: string;
  priority?: string | undefined;
  description?: string | undefined;
}

export async function createOperation(i: CreateInput) {
  const guildId = assertGuildId(i.guildId);
  const kind = text(i.kind, 60);
  const location = text(i.location, 100);
  if (!kind) throw new OperationError('invalid', 'Die Art des Einsatzes fehlt.');
  if (!location) throw new OperationError('invalid', 'Der Ort fehlt.');
  if (i.priority && !PRIORITIES.includes(i.priority as OpPriority)) throw new OperationError('invalid', 'Unbekannte Priorität.');
  const op = await prisma.$transaction(async (tx) => {
    const c = await tx.operationCounter.upsert({ where: { guildId }, create: { guildId, last: 1 }, update: { last: { increment: 1 } } });
    return tx.operation.create({ data: { guildId, number: c.last, kind, location, priority: (i.priority ?? 'NORMAL') as OpPriority, description: text(i.description, 2000) ?? null, createdBy: i.actorId }, include });
  });
  await event(op.id, guildId, 'created', i.actorId, { kind, location, priority: op.priority });
  return op;
}

export async function updateOperation(guildId: string, id: string, patch: { kind?: string | undefined; location?: string | undefined; priority?: string | undefined; description?: string | undefined }, actorId: string) {
  const gid = assertGuildId(guildId);
  const op = await getOperation(gid, id);
  if (!isOpen(op.status)) throw new OperationError('conflict', 'Ein beendeter Einsatz lässt sich nicht mehr bearbeiten.');
  if (patch.priority && !PRIORITIES.includes(patch.priority as OpPriority)) throw new OperationError('invalid', 'Unbekannte Priorität.');
  const data: Prisma.OperationUpdateInput = {};
  if (patch.kind !== undefined) data.kind = text(patch.kind, 60) ?? op.kind;
  if (patch.location !== undefined) data.location = text(patch.location, 100) ?? op.location;
  if (patch.priority !== undefined) data.priority = patch.priority as OpPriority;
  if (patch.description !== undefined) data.description = text(patch.description, 2000) ?? null;
  const updated = await prisma.operation.update({ where: { id }, data, include });
  await event(id, gid, 'updated', actorId, { before: { kind: op.kind, location: op.location, priority: op.priority, description: op.description }, patch });
  return updated;
}

// --- Einheiten ---------------------------------------------------------------------------------------

async function snapshotParticipants(op: { id: string; guildId: string }, unitId: string, callsign: string, leaderId?: string | null) {
  const members = await prisma.unitMember.findMany({ where: { unitId, openKey: 'open' } });
  for (const m of members) {
    await prisma.operationParticipant.upsert({
      where: { operationId_userId: { operationId: op.id, userId: m.userId } },
      create: { guildId: op.guildId, operationId: op.id, userId: m.userId, callsign, isLeader: m.userId === leaderId },
      update: {},
    });
  }
  return members;
}

export async function assignUnit(guildId: string, operationId: string, unitId: string, actorId: string) {
  const gid = assertGuildId(guildId);
  const op = await getOperation(gid, operationId);
  if (!isOpen(op.status)) throw new OperationError('conflict', 'Dem beendeten Einsatz lassen sich keine Einheiten mehr zuweisen.');
  const unit = await prisma.unit.findFirst({ where: { id: unitId, guildId: gid, activeKey: 'active' } });
  if (!unit) throw new OperationError('not-found', 'Diese Einheit gibt es nicht (mehr).');
  const staffed = await prisma.unitMember.count({ where: { unitId, openKey: 'open' } });
  if (staffed === 0) throw new OperationError('conflict', 'Die Einheit ist nicht besetzt.');
  try {
    await prisma.operationUnit.create({ data: { guildId: gid, operationId, unitId, callsign: unit.callsign, activeKey: 'active', prevStatus: unit.status } });
  } catch (e) {
    if (e instanceof Error && /Unique constraint/i.test(e.message)) throw new OperationError('conflict', `„${unit.callsign}“ ist bereits einem Einsatz zugewiesen.`);
    throw e;
  }
  await prisma.unit.update({ where: { id: unitId }, data: { status: 'BUSY', statusSince: new Date() } });
  const members = await snapshotParticipants(op, unitId, unit.callsign, op.leaderId);
  await event(operationId, gid, 'unit.assigned', actorId, { unitId, callsign: unit.callsign, members: members.map((m) => m.userId) });
  // Erste Einheit: deren Führung wird Einsatzleiter, falls noch keiner gesetzt ist
  if (!op.leaderId) {
    const lead = members.find((m) => m.role === 'LEADER') ?? members[0];
    if (lead) await setLeader(gid, operationId, lead.userId, actorId, true);
  }
  return getOperation(gid, operationId);
}

async function releaseUnits(operationId: string, guildId: string, actorId: string | null) {
  const open = await prisma.operationUnit.findMany({ where: { operationId, activeKey: 'active' } });
  for (const ou of open) {
    await prisma.operationUnit.update({ where: { id: ou.id }, data: { activeKey: null, releasedAt: new Date() } });
    const unit = await prisma.unit.findFirst({ where: { id: ou.unitId, activeKey: 'active' } });
    // nur zurücksetzen, wenn niemand den Status inzwischen manuell geändert hat
    if (unit && unit.status === 'BUSY') await prisma.unit.update({ where: { id: unit.id }, data: { status: (ou.prevStatus as 'AVAILABLE' | 'BREAK' | 'UNAVAILABLE' | null) ?? 'AVAILABLE', statusSince: new Date() } });
    await event(operationId, guildId, 'unit.released', actorId, { unitId: ou.unitId, callsign: ou.callsign });
  }
}

export async function unassignUnit(guildId: string, operationId: string, unitId: string, actorId: string) {
  const gid = assertGuildId(guildId);
  const op = await getOperation(gid, operationId);
  const ou = op.units.find((u) => u.unitId === unitId);
  if (!ou) throw new OperationError('not-found', 'Diese Einheit ist dem Einsatz nicht zugewiesen.');
  await prisma.operationUnit.update({ where: { id: ou.id }, data: { activeKey: null, releasedAt: new Date() } });
  const unit = await prisma.unit.findFirst({ where: { id: unitId, activeKey: 'active' } });
  if (unit && unit.status === 'BUSY') await prisma.unit.update({ where: { id: unitId }, data: { status: (ou.prevStatus as 'AVAILABLE') ?? 'AVAILABLE', statusSince: new Date() } });
  await event(operationId, gid, 'unit.unassigned', actorId, { unitId, callsign: ou.callsign });
  return getOperation(gid, operationId);
}

/** Einsatzleiter muss Mitglied einer zugewiesenen Einheit sein. */
export async function setLeader(guildId: string, operationId: string, userId: string, actorId: string, auto = false) {
  const gid = assertGuildId(guildId);
  const op = await getOperation(gid, operationId);
  if (!isOpen(op.status)) throw new OperationError('conflict', 'Der Einsatz ist beendet.');
  const inUnit = await prisma.unitMember.count({ where: { guildId: gid, userId, openKey: 'open', unitId: { in: op.units.map((u) => u.unitId) } } });
  if (!inUnit) throw new OperationError('invalid', 'Der Einsatzleiter muss Mitglied einer zugewiesenen Einheit sein.');
  await prisma.$transaction([
    prisma.operation.update({ where: { id: operationId }, data: { leaderId: userId } }),
    prisma.operationParticipant.updateMany({ where: { operationId }, data: { isLeader: false } }),
    prisma.operationParticipant.upsert({ where: { operationId_userId: { operationId, userId } }, create: { guildId: gid, operationId, userId, isLeader: true }, update: { isLeader: true } }),
  ]);
  await event(operationId, gid, 'leader', actorId, { userId, auto, previous: op.leaderId });
  return getOperation(gid, operationId);
}

// --- Status ----------------------------------------------------------------------------------------

export interface StatusInput {
  guildId: string;
  operationId: string;
  to: string;
  actorId: string;
  /** Abschlussbericht (bei „abgeschlossen“ Pflicht) bzw. Abbruchgrund (bei „abgebrochen“ Pflicht). */
  report?: string | undefined;
  outcome?: string | undefined;
  permission?: string | undefined;
}

export async function changeStatus(i: StatusInput, now = new Date()) {
  const gid = assertGuildId(i.guildId);
  if (!STATUSES.includes(i.to as OpStatus)) throw new OperationError('invalid', 'Unbekannter Status.');
  const to = i.to as OpStatus;
  const op = await getOperation(gid, i.operationId);
  if (!canTransition(op.status, to)) throw new OperationError('conflict', `Von „${op.status}“ ist kein Wechsel nach „${to}“ möglich.`);
  const report = text(i.report, 4000);
  if (to === 'COMPLETED' && (!report || report.length < 10)) throw new OperationError('invalid', 'Für den Abschluss ist ein Abschlussbericht nötig (mind. 10 Zeichen).');
  if (to === 'CANCELLED' && (!report || report.length < 3)) throw new OperationError('invalid', 'Bitte einen Abbruchgrund angeben.');
  if ((to === 'EN_ROUTE' || to === 'ACTIVE' || to === 'COMPLETED') && op.units.length === 0) throw new OperationError('conflict', 'Weise dem Einsatz zuerst mindestens eine Einheit zu.');
  const r = await prisma.operation.updateMany({
    where: { id: op.id, status: op.status },
    data: { status: to, ...(to === 'ACTIVE' && !op.startedAt ? { startedAt: now } : {}), ...(to === 'COMPLETED' || to === 'CANCELLED' ? { completedAt: now, report: report ?? null, outcome: text(i.outcome, 100) ?? null } : {}) },
  });
  if (r.count === 0) throw new OperationError('conflict', 'Der Einsatz wurde gerade geändert – bitte erneut versuchen.');
  await event(op.id, gid, 'status', i.actorId, { from: op.status, to, ...(report ? { report } : {}) });
  let transferred: string[] = [];
  if (to === 'COMPLETED' || to === 'CANCELLED') {
    // Beteiligte vor dem Freigeben der Einheiten festhalten (auch wer später dazugekommen ist)
    for (const u of op.units) await snapshotParticipants(op, u.unitId, u.callsign, op.leaderId);
    await releaseUnits(op.id, gid, i.actorId);
  }
  if (to === 'COMPLETED') transferred = await transferToPersonnel(gid, op.id, i.actorId);
  if (to === 'CANCELLED') {
    await prisma.auditLog.create({ data: { guildId: gid, actorType: 'USER', actorId: i.actorId, action: 'operation.cancelled', resourceType: 'Operation', resourceId: op.id, after: { number: op.number } as Json, reason: report ?? null, result: 'success', ...(i.permission ? { permission: i.permission } : {}) } });
  }
  return { operation: await getOperation(gid, op.id), transferred };
}

/** Schreibt für jeden Beteiligten mit Personalakte genau einen Eintrag „OPERATION“ (idempotent). Liefert die Nutzer-IDs. */
export async function transferToPersonnel(guildId: string, operationId: string, actorId: string | null): Promise<string[]> {
  const op = await getOperation(guildId, operationId);
  if (op.status !== 'COMPLETED') throw new OperationError('conflict', 'Nur abgeschlossene Einsätze werden in die Personalakten übernommen.');
  const done: string[] = [];
  for (const p of op.participants) {
    if (p.recordEntryId) continue;
    const record = await getRecordByUser(guildId, p.userId);
    if (!record || record.status !== 'ACTIVE') continue;
    const entry = await addEntry(guildId, record.id, {
      kind: 'OPERATION',
      title: `Einsatz ${formatNumber(op.number)}: ${op.kind}`.slice(0, 200),
      body: [`Ort: ${op.location}`, p.isLeader ? 'Rolle: Einsatzleiter' : 'Rolle: Beteiligt', op.report ? `Bericht: ${op.report}` : ''].filter(Boolean).join('\n').slice(0, 4000),
      occurredAt: op.completedAt ?? new Date(),
      data: { operationId: op.id, number: op.number, priority: op.priority, leader: p.isLeader, callsign: p.callsign },
    }, actorId);
    await prisma.operationParticipant.update({ where: { id: p.id }, data: { recordEntryId: entry.id } });
    done.push(p.userId);
  }
  if (done.length) await event(operationId, guildId, 'personnel.transferred', actorId, { users: done });
  return done;
}

// --- Abfragen (auch Grundlage für Berichte, Phase 27) -----------------------------------------------------

export interface OperationFilter {
  guildId: string;
  status?: string | undefined;
  open?: boolean | undefined;
  priority?: string | undefined;
  userId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export async function listOperations(f: OperationFilter) {
  const guildId = assertGuildId(f.guildId);
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const rows = await prisma.operation.findMany({
    where: {
      guildId,
      ...(f.status && STATUSES.includes(f.status as OpStatus) ? { status: f.status as OpStatus } : {}),
      ...(f.open ? { status: { in: ['REQUESTED', 'EN_ROUTE', 'ACTIVE'] as OpStatus[] } } : {}),
      ...(f.priority && PRIORITIES.includes(f.priority as OpPriority) ? { priority: f.priority as OpPriority } : {}),
      ...(f.userId ? { participants: { some: { userId: f.userId } } } : {}),
      ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) } } : {}),
    },
    orderBy: [{ number: 'desc' }],
    take: limit + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
    include,
  });
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
}

export const operationHistory = (guildId: string, id: string) => prisma.operationEvent.findMany({ where: { guildId: assertGuildId(guildId), operationId: id }, orderBy: { at: 'asc' } });

/** Kennzahlen für Berichte: Anzahl je Status/Priorität und Beteiligungen je Beamter im Zeitraum (nach Erstellung). */
export async function operationStats(guildId: string, from?: Date, to?: Date) {
  const gid = assertGuildId(guildId);
  const where: Prisma.OperationWhereInput = { guildId: gid, ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}) };
  const [byStatus, byPriority, parts] = await Promise.all([
    prisma.operation.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.operation.groupBy({ by: ['priority'], where, _count: { _all: true } }),
    prisma.operationParticipant.groupBy({ by: ['userId'], where: { guildId: gid, operation: { ...where, status: 'COMPLETED' } }, _count: { _all: true } }),
  ]);
  return {
    byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
    byPriority: Object.fromEntries(byPriority.map((g) => [g.priority, g._count._all])),
    participation: parts.map((p) => ({ userId: p.userId, operations: p._count._all })).sort((a, b) => b.operations - a.operations),
  };
}
