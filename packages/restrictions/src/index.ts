import { assertGuildId, auditRepository, prisma, type Prisma } from '@nexus/database';

/**
 * Sperren (Bewerbung, Ticket, Fraktion, Funk): Typ, Grund, Start, Ende, Status, Notiz, Ersteller. Eine Sperre wirkt, solange sie
 * ACTIVE ist, ihr Start erreicht und ihr Ende (falls gesetzt) noch nicht erreicht ist. Abgelaufene Sperren werden vom Worker
 * auf EXPIRED gesetzt und vor jeder Prüfung eines Servers zusätzlich nachgezogen – der Zugriff ist also genau ab dem Ende
 * wieder frei, auch zwischen zwei Worker-Läufen und nur, wenn keine weitere Sperre derselben Art besteht.
 */
type Json = Prisma.InputJsonValue;
export const TYPES = ['APPLICATION', 'TICKET', 'FACTION', 'RADIO'] as const;
export type RestrictionKind = (typeof TYPES)[number];
export const TYPE_LABEL: Record<RestrictionKind, string> = { APPLICATION: 'Bewerbungssperre', TICKET: 'Ticketsperre', FACTION: 'Fraktionssperre', RADIO: 'Funk-/Kommunikationssperre' };
/** Wofür die Sperre gilt, als Satzteil der Benutzermeldung. */
const BLOCKED_FOR: Record<RestrictionKind, string> = { APPLICATION: 'Bewerbungen', TICKET: 'Tickets', FACTION: 'Fraktionen', RADIO: 'den Funk' };
export const MAX_REASON = 300;
export const MAX_NOTE = 1000;

export class RestrictionError extends Error {
  constructor(public readonly code: 'invalid' | 'not-found' | 'conflict' | 'blocked', message: string) {
    super(message);
    this.name = 'RestrictionError';
  }
}

const ID = /^\d{5,25}$/;
const fmt = (d: Date) => d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' });

export interface CreateInput {
  guildId: string;
  userId: string;
  type: string;
  reason: string;
  note?: string | undefined;
  startsAt?: Date | undefined;
  endsAt?: Date | null | undefined;
  actorId: string;
}

async function audit(guildId: string, actorId: string | null, action: string, id: string, before: unknown, after: unknown, reason?: string) {
  await auditRepository.createRaw({ data: { guildId, actorType: actorId ? 'USER' : 'SYSTEM', actorId, action, resourceType: 'Restriction', resourceId: id, before: before as Json, after: after as Json, reason: reason ?? null, result: 'success' } });
}

export async function createRestriction(i: CreateInput) {
  const guildId = assertGuildId(i.guildId);
  if (!ID.test(i.userId)) throw new RestrictionError('invalid', 'Ungültige Discord-Benutzer-ID.');
  if (!(TYPES as readonly string[]).includes(i.type)) throw new RestrictionError('invalid', 'Unbekannte Sperrart.');
  const reason = i.reason?.trim();
  if (!reason || reason.length < 3) throw new RestrictionError('invalid', 'Bitte einen Grund angeben.');
  if (reason.length > MAX_REASON) throw new RestrictionError('invalid', `Der Grund ist zu lang (max. ${MAX_REASON} Zeichen).`);
  const note = i.note?.trim() || null;
  if (note && note.length > MAX_NOTE) throw new RestrictionError('invalid', `Die Notiz ist zu lang (max. ${MAX_NOTE} Zeichen).`);
  const startsAt = i.startsAt ?? new Date();
  const endsAt = i.endsAt ?? null;
  if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime()))) throw new RestrictionError('invalid', 'Ungültiges Datum.');
  if (endsAt && endsAt.getTime() <= startsAt.getTime()) throw new RestrictionError('invalid', 'Das Ende muss nach dem Start liegen.');
  if (endsAt && endsAt.getTime() <= Date.now()) throw new RestrictionError('invalid', 'Das Ende liegt bereits in der Vergangenheit.');
  const row = await prisma.restriction.create({ data: { guildId, userId: i.userId, type: i.type as RestrictionKind, reason, note, startsAt, endsAt, createdBy: i.actorId } });
  await audit(guildId, i.actorId, 'restriction.created', row.id, null, { type: row.type, userId: row.userId, startsAt, endsAt }, reason);
  return row;
}

export async function revokeRestriction(guildId: string, id: string, reason: string | undefined, actorId: string) {
  const gid = assertGuildId(guildId);
  await expireDueRestrictions(gid);
  const r = await prisma.restriction.findFirst({ where: { id, guildId: gid } });
  if (!r) throw new RestrictionError('not-found', 'Sperre nicht gefunden.');
  const why = reason?.trim();
  if (!why || why.length < 3) throw new RestrictionError('invalid', 'Bitte einen Grund für das Aufheben angeben.');
  if (why.length > MAX_REASON) throw new RestrictionError('invalid', `Der Grund ist zu lang (max. ${MAX_REASON} Zeichen).`);
  const u = await prisma.restriction.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedBy: actorId, revokeReason: why, revokedAt: new Date() } });
  if (u.count === 0) throw new RestrictionError('conflict', 'Diese Sperre ist bereits beendet.');
  await audit(gid, actorId, 'restriction.revoked', id, { status: 'ACTIVE' }, { status: 'REVOKED' }, why);
  return prisma.restriction.findFirstOrThrow({ where: { id } });
}

/** Setzt Sperren, deren Ende erreicht ist, auf EXPIRED (Audit „Sperre abgelaufen“). Ohne Server: alle. */
export async function expireDueRestrictions(guildId?: string, now = new Date()): Promise<{ expired: number }> {
  const due = await prisma.restriction.findMany({ where: { status: 'ACTIVE', endsAt: { lte: now }, ...(guildId ? { guildId: assertGuildId(guildId) } : {}) }, select: { id: true, guildId: true, type: true, userId: true } });
  let expired = 0;
  for (const r of due) {
    const u = await prisma.restriction.updateMany({ where: { id: r.id, status: 'ACTIVE' }, data: { status: 'EXPIRED', expiredAt: now } });
    if (u.count === 0) continue;
    await audit(r.guildId, null, 'restriction.expired', r.id, { status: 'ACTIVE' }, { status: 'EXPIRED', type: r.type, userId: r.userId }, 'Automatisch abgelaufen');
    expired++;
  }
  return { expired };
}

/** Wirksame Sperre dieser Art (die mit dem spätesten Ende, unbefristet zuerst) oder `null`. */
export async function getActive(guildId: string, userId: string, type: RestrictionKind, now = new Date()) {
  const gid = assertGuildId(guildId);
  await expireDueRestrictions(gid, now);
  const rows = await prisma.restriction.findMany({ where: { guildId: gid, userId, type, status: 'ACTIVE', startsAt: { lte: now } } });
  if (rows.length === 0) return null;
  return rows.sort((a, b) => (a.endsAt?.getTime() ?? Infinity) - (b.endsAt?.getTime() ?? Infinity)).at(-1)!;
}

/** Verständliche Meldung für den Gesperrten (mit Ende und Grund). */
export function blockedMessage(r: { type: string; reason: string; endsAt: Date | null }): string {
  const what = BLOCKED_FOR[r.type as RestrictionKind] ?? 'diese Funktion';
  const until = r.endsAt ? `bis zum ${fmt(r.endsAt)} Uhr` : 'bis auf Weiteres';
  return `Du bist ${until} für ${what} gesperrt. Grund: ${r.reason}`;
}

/** Wirft `RestrictionError('blocked')` mit verständlicher Meldung, wenn der Benutzer gesperrt ist. */
export async function assertNotRestricted(guildId: string, userId: string, type: RestrictionKind): Promise<void> {
  const r = await getActive(guildId, userId, type);
  if (r) throw new RestrictionError('blocked', blockedMessage(r));
}

export interface ListFilter {
  guildId: string;
  userId?: string | undefined;
  type?: string | undefined;
  status?: string | undefined;
  limit?: number | undefined;
}
export async function listRestrictions(f: ListFilter) {
  const guildId = assertGuildId(f.guildId);
  await expireDueRestrictions(guildId);
  return prisma.restriction.findMany({
    where: {
      guildId,
      ...(f.userId ? { userId: f.userId } : {}),
      ...((TYPES as readonly string[]).includes(f.type ?? '') ? { type: f.type as RestrictionKind } : {}),
      ...(f.status === 'ACTIVE' || f.status === 'EXPIRED' || f.status === 'REVOKED' ? { status: f.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(f.limit ?? 100, 1), 300),
  });
}
