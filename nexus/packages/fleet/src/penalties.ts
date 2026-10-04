import { assertGuildId, auditRepository, prisma, type Prisma } from '@nexus/database';
import { addEntry, getRecordByUser, revokeEntry } from '@nexus/personnel';
import { FleetError, normalizeName, normalizePlate, text } from './errors.js';

/**
 * RP-Strafen gegen Personen: Bußgeld, Verwarnung, Strafpunkte, Führerscheinentzug, Fahrzeugbeschlagnahmung.
 * Jede Strafe hat eine Nummer (S-0001), einen Aussteller und erzeugt einen Eintrag „PENALTY“ in dessen
 * Personalakte (falls vorhanden). Aufheben mit Grund widerruft den Eintrag; nichts wird gelöscht.
 */
type Json = Prisma.InputJsonValue;
export const KINDS = ['FINE', 'WARNING', 'POINTS', 'LICENSE_REVOCATION', 'VEHICLE_SEIZURE'] as const;
export type PenaltyKindKey = (typeof KINDS)[number];
export const KIND_LABEL: Record<PenaltyKindKey, string> = { FINE: 'Bußgeld', WARNING: 'Verwarnung', POINTS: 'Strafpunkte', LICENSE_REVOCATION: 'Führerscheinentzug', VEHICLE_SEIZURE: 'Fahrzeugbeschlagnahmung' };
export const formatNumber = (n: number) => `S-${String(n).padStart(4, '0')}`;
/** Ab so vielen aktiven Strafpunkten gilt der Führerschein als zu entziehen (Hinweis, keine automatische Strafe). */
export const POINTS_LIMIT = 8;
const DAY = 86_400_000;

export interface PenaltyInput {
  guildId: string;
  kind: string;
  subjectName: string;
  subjectUserId?: string | undefined;
  reason: string;
  issuedBy: string;
  amount?: number | undefined;
  points?: number | undefined;
  durationDays?: number | undefined;
  plate?: string | undefined;
  operationNumber?: number | undefined;
}

const int = (v: number | undefined, min: number, max: number, label: string) => {
  if (v === undefined || !Number.isInteger(v) || v < min || v > max) throw new FleetError('invalid', `${label} muss eine ganze Zahl von ${min} bis ${max} sein.`);
  return v;
};

export async function issuePenalty(i: PenaltyInput, now = new Date()) {
  const guildId = assertGuildId(i.guildId);
  if (!(KINDS as readonly string[]).includes(i.kind)) throw new FleetError('invalid', 'Unbekannte Strafart.');
  const kind = i.kind as PenaltyKindKey;
  const name = text(i.subjectName, 80, 'Der Name');
  if (!name) throw new FleetError('invalid', 'Der Name der Person fehlt.');
  const reason = text(i.reason, 500, 'Der Grund');
  if (!reason || reason.length < 3) throw new FleetError('invalid', 'Bitte einen Grund angeben.');
  if (i.subjectUserId && !/^\d{5,25}$/.test(i.subjectUserId)) throw new FleetError('invalid', 'Ungültige Discord-ID.');
  const data: Partial<Prisma.PenaltyUncheckedCreateInput> = {};
  if (kind === 'FINE') data.amount = int(i.amount, 1, 10_000_000, 'Der Betrag');
  if (kind === 'POINTS') data.points = int(i.points, 1, 20, 'Die Punktzahl');
  if (kind === 'LICENSE_REVOCATION') {
    data.durationDays = int(i.durationDays, 1, 3650, 'Die Dauer (Tage)');
    data.until = new Date(now.getTime() + data.durationDays * DAY);
  }
  if (kind === 'VEHICLE_SEIZURE') {
    const plate = text(i.plate, 15, 'Das Kennzeichen');
    if (!plate || normalizePlate(plate).length < 2) throw new FleetError('invalid', 'Für eine Beschlagnahmung ist das Kennzeichen nötig.');
    data.plate = plate.toUpperCase();
  } else if (i.plate) data.plate = text(i.plate, 15, 'Das Kennzeichen')?.toUpperCase() ?? null; // Tatfahrzeug
  if (kind !== 'FINE' && i.amount !== undefined) throw new FleetError('invalid', 'Ein Betrag gehört nur zum Bußgeld.');
  if (kind !== 'POINTS' && i.points !== undefined) throw new FleetError('invalid', 'Punkte gehören nur zu Strafpunkten.');
  if (kind !== 'LICENSE_REVOCATION' && i.durationDays !== undefined) throw new FleetError('invalid', 'Eine Dauer gehört nur zum Führerscheinentzug.');

  const penalty = await prisma.$transaction(async (tx) => {
    const c = await tx.penaltyCounter.upsert({ where: { guildId }, create: { guildId, last: 1 }, update: { last: { increment: 1 } } });
    return tx.penalty.create({ data: { guildId, number: c.last, kind, subjectName: name, subjectKey: normalizeName(name), subjectUserId: i.subjectUserId ?? null, reason, issuedBy: i.issuedBy, operationNumber: i.operationNumber ?? null, ...data } });
  });
  // Personalakte des Ausstellers (nur wenn vorhanden und aktiv)
  const record = await getRecordByUser(guildId, i.issuedBy);
  if (record && record.status === 'ACTIVE') {
    const detail = describe(penalty);
    const entry = await addEntry(guildId, record.id, { kind: 'PENALTY', title: `Strafe ${formatNumber(penalty.number)}: ${KIND_LABEL[kind]} – ${name}`.slice(0, 200), body: [detail, `Grund: ${reason}`].filter(Boolean).join('\n'), occurredAt: now, data: { penaltyId: penalty.id, number: penalty.number, kind } }, i.issuedBy);
    await prisma.penalty.update({ where: { id: penalty.id }, data: { personnelEntryId: entry.id } });
  }
  await auditRepository.log({ guildId, actorId: i.issuedBy, action: 'penalty.issued', resource: ['Penalty', penalty.id], after: { number: penalty.number, kind, subject: name, amount: data.amount ?? null, points: data.points ?? null, durationDays: data.durationDays ?? null, until: data.until ? new Date(data.until as Date).toISOString() : null, plate: data.plate ?? null } as unknown as Json, reason, permission: 'penalties.issue' });
  return prisma.penalty.findUniqueOrThrow({ where: { id: penalty.id } });
}

export function describe(p: { kind: string; amount: number | null; points: number | null; durationDays: number | null; plate: string | null }): string {
  if (p.kind === 'FINE') return `${p.amount} $`;
  if (p.kind === 'POINTS') return `${p.points} Punkt(e)`;
  if (p.kind === 'LICENSE_REVOCATION') return `${p.durationDays} Tage`;
  if (p.kind === 'VEHICLE_SEIZURE') return `Kennzeichen ${p.plate}`;
  return '';
}

export async function getPenalty(guildId: string, id: string) {
  const p = await prisma.penalty.findFirst({ where: { id, guildId: assertGuildId(guildId) } });
  if (!p) throw new FleetError('not-found', 'Strafe nicht gefunden.');
  return p;
}
export async function getByNumber(guildId: string, number: number) {
  const p = await prisma.penalty.findUnique({ where: { guildId_number: { guildId: assertGuildId(guildId), number } } });
  if (!p) throw new FleetError('not-found', `Strafe ${formatNumber(number)} nicht gefunden.`);
  return p;
}

/** Aufheben (z. B. Einspruch): Grund Pflicht; der Eintrag in der Personalakte des Ausstellers wird widerrufen. */
export async function revokePenalty(guildId: string, id: string, reason: string | undefined, actorId: string, permission = 'penalties.revoke') {
  const gid = assertGuildId(guildId);
  const p = await getPenalty(gid, id);
  const why = reason?.trim();
  if (!why || why.length < 3) throw new FleetError('invalid', 'Bitte einen Grund für das Aufheben angeben.');
  if (why.length > 300) throw new FleetError('invalid', 'Der Grund ist zu lang (max. 300 Zeichen).');
  const r = await prisma.penalty.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedBy: actorId, revokeReason: why, revokedAt: new Date() } });
  if (r.count === 0) throw new FleetError('conflict', 'Diese Strafe ist bereits aufgehoben.');
  if (p.personnelEntryId) await revokeEntry(gid, p.personnelEntryId, `Strafe aufgehoben: ${why}`, actorId).catch(() => undefined);
  await auditRepository.createRaw({ data: { guildId: gid, actorType: 'USER', actorId, action: 'penalty.revoked', resourceType: 'Penalty', resourceId: id, before: { number: p.number, kind: p.kind } as Json, after: { status: 'REVOKED' } as Json, reason: why, permission, result: 'success' } });
  return getPenalty(gid, id);
}

export interface PenaltyFilter {
  guildId: string;
  query?: string | undefined;
  kind?: string | undefined;
  status?: string | undefined;
  issuedBy?: string | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export async function listPenalties(f: PenaltyFilter) {
  const guildId = assertGuildId(f.guildId);
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const q = f.query?.trim();
  const num = q && /^(?:S-?)?(\d{1,6})$/i.exec(q);
  const rows = await prisma.penalty.findMany({
    where: {
      guildId,
      ...((KINDS as readonly string[]).includes(f.kind ?? '') ? { kind: f.kind as PenaltyKindKey } : {}),
      ...(f.status === 'ACTIVE' || f.status === 'REVOKED' ? { status: f.status } : {}),
      ...(f.issuedBy ? { issuedBy: f.issuedBy } : {}),
      ...(q ? { OR: [...(num ? [{ number: Number(num[1]) }] : []), { subjectKey: { contains: normalizeName(q) } }, { plate: { contains: q, mode: 'insensitive' as const } }, { reason: { contains: q, mode: 'insensitive' as const } }] } : {}),
    },
    orderBy: { number: 'desc' },
    take: limit + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
  });
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
}

export interface SubjectRegister {
  subjectName: string;
  finesTotal: number;
  warnings: number;
  /** Summe der aktiven Strafpunkte. */
  points: number;
  pointsLimitReached: boolean;
  /** Führerschein aktuell entzogen (laufender Entzug) bis … */
  licenseRevokedUntil: Date | null;
  seizedPlates: string[];
  penalties: Awaited<ReturnType<typeof listPenalties>>['items'];
}

/** Strafenregister einer Person (nur aktive Strafen zählen für Summen). */
export async function registerOf(guildId: string, name: string, now = new Date()): Promise<SubjectRegister> {
  const gid = assertGuildId(guildId);
  const key = normalizeName(name);
  const all = await prisma.penalty.findMany({ where: { guildId: gid, subjectKey: key }, orderBy: { number: 'desc' } });
  const active = all.filter((p) => p.status === 'ACTIVE');
  const points = active.filter((p) => p.kind === 'POINTS').reduce((a, p) => a + (p.points ?? 0), 0);
  const until = active.filter((p) => p.kind === 'LICENSE_REVOCATION' && p.until && p.until > now).map((p) => p.until!).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return {
    subjectName: all[0]?.subjectName ?? name.trim(),
    finesTotal: active.filter((p) => p.kind === 'FINE').reduce((a, p) => a + (p.amount ?? 0), 0),
    warnings: active.filter((p) => p.kind === 'WARNING').length,
    points,
    pointsLimitReached: points >= POINTS_LIMIT,
    licenseRevokedUntil: until,
    seizedPlates: active.filter((p) => p.kind === 'VEHICLE_SEIZURE' && p.plate).map((p) => p.plate!),
    penalties: all,
  };
}
