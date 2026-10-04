import type { DiscordPort } from '@nexus/automation';
import { assertGuildId, guildRepository, prisma, type Prisma } from '@nexus/database';
import { addEntry, getRecordByUser, revokeEntry } from '@nexus/personnel';

/**
 * Abmeldungen: Antrag (Zeitraum, Kategorie, Begründung), Genehmigung/Ablehnung mit Grund, Zurückziehen, vorzeitiges
 * Zurückmelden, Historie. Genehmigte Abmeldungen erscheinen automatisch als Eintrag „ABSENCE“ in der Personalakte.
 * Daten sind Kalendertage (Europe/Berlin); Start- und Endtag zählen mit.
 */
type Json = Prisma.InputJsonValue;
export const CATEGORIES = ['URLAUB', 'KRANK', 'BERUFLICH', 'SONSTIGES'] as const;
export type AbsenceCategory = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<AbsenceCategory, string> = { URLAUB: 'Urlaub', KRANK: 'Krankheit', BERUFLICH: 'Beruflich/Schule', SONSTIGES: 'Sonstiges' };
export const MAX_DAYS = 60;
export const MAX_ADVANCE_DAYS = 120;
const DAY = 86_400_000;
export const formatNumber = (n: number) => `A-${String(n).padStart(4, '0')}`;

export class AbsenceError extends Error {
  constructor(public readonly code: 'invalid' | 'not-found' | 'conflict' | 'forbidden', message: string) {
    super(message);
    this.name = 'AbsenceError';
  }
}

// --- Datum (Kalendertage in Berlin) --------------------------------------------------------------------------

/** Heutiger Kalendertag in Berlin als UTC-Mitternacht-Datum. */
export function berlinToday(now: Date = new Date()): Date {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return new Date(`${p}T00:00:00.000Z`);
}

/** „TT.MM.JJJJ“ oder „JJJJ-MM-TT“ → Kalendertag (UTC-Mitternacht); `null` bei Ungültigem (z. B. 31.02.). */
export function parseDay(input: string): Date | null {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/.exec(input) ?? /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(input);
  if (!m) return null;
  const [d, mo, y] = m[0].includes('-') ? [Number(m[3]), Number(m[2]), Number(m[1])] : [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y!, mo! - 1, d!));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo! - 1 && date.getUTCDate() === d ? date : null;
}

export const fmtDay = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY) + 1;

// --- Antrag ----------------------------------------------------------------------------------------------------

export interface RequestInput {
  guildId: string;
  userId: string;
  start: Date;
  end: Date;
  category: string;
  reason: string;
  port?: DiscordPort | undefined;
}

export async function requestAbsence(i: RequestInput, now = new Date()) {
  const gid = assertGuildId(i.guildId);
  if (!(CATEGORIES as readonly string[]).includes(i.category)) throw new AbsenceError('invalid', 'Unbekannte Kategorie (Urlaub, Krankheit, Beruflich, Sonstiges).');
  const reason = i.reason?.trim();
  if (!reason || reason.length < 3) throw new AbsenceError('invalid', 'Bitte eine kurze Begründung angeben.');
  if (reason.length > 500) throw new AbsenceError('invalid', 'Die Begründung ist zu lang (max. 500 Zeichen).');
  if (Number.isNaN(i.start.getTime()) || Number.isNaN(i.end.getTime())) throw new AbsenceError('invalid', 'Ungültiges Datum.');
  if (i.end < i.start) throw new AbsenceError('invalid', 'Das Ende liegt vor dem Beginn.');
  const today = berlinToday(now);
  // Krankmeldungen dürfen rückwirkend bis zu 3 Tage eingetragen werden, alles andere nicht
  const earliest = new Date(today.getTime() - (i.category === 'KRANK' ? 3 : 0) * DAY);
  if (i.start < earliest) throw new AbsenceError('invalid', i.category === 'KRANK' ? 'Krankmeldungen können höchstens 3 Tage rückwirkend eingetragen werden.' : 'Der Beginn liegt in der Vergangenheit.');
  if (i.start.getTime() > today.getTime() + MAX_ADVANCE_DAYS * DAY) throw new AbsenceError('invalid', `Der Beginn darf höchstens ${MAX_ADVANCE_DAYS} Tage in der Zukunft liegen.`);
  const days = daysBetween(i.start, i.end);
  if (days > MAX_DAYS) throw new AbsenceError('invalid', `Eine Abmeldung darf höchstens ${MAX_DAYS} Tage dauern (beantragt: ${days}).`);
  const overlap = await prisma.absence.findFirst({ where: { guildId: gid, userId: i.userId, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: i.end }, endDate: { gte: i.start } } });
  if (overlap) throw new AbsenceError('conflict', `Für diesen Zeitraum gibt es bereits ${formatNumber(overlap.number)} (${fmtDay(overlap.startDate)}–${fmtDay(overlap.endDate)}).`);
  const a = await prisma.$transaction(async (tx) => {
    const c = await tx.absenceCounter.upsert({ where: { guildId: gid }, create: { guildId: gid, last: 1 }, update: { last: { increment: 1 } } });
    return tx.absence.create({ data: { guildId: gid, number: c.last, userId: i.userId, startDate: i.start, endDate: i.end, category: i.category, reason } });
  });
  if (i.port) await announce(i.port, gid, a).catch(() => undefined);
  return a;
}

/** Meldet den Antrag im Kanal „absence-channel“ (falls gesetzt), damit die Führung ihn sieht. */
async function announce(port: DiscordPort, guildId: string, a: { number: number; userId: string; startDate: Date; endDate: Date; category: string; reason: string }) {
  const channel = (await guildRepository.getSelections(guildId))['absence-channel'];
  if (!channel) return;
  await port.postMessage(channel, { embeds: [{ title: `🏖️ Abmeldung ${formatNumber(a.number)}`, description: `<@${a.userId}> · ${CATEGORY_LABEL[a.category as AbsenceCategory] ?? a.category}\n**${fmtDay(a.startDate)} – ${fmtDay(a.endDate)}** (${daysBetween(a.startDate, a.endDate)} Tage)\n${a.reason}`, color: 0xf59e0b }], allowed_mentions: { parse: [] } } as never);
}

export async function getAbsence(guildId: string, id: string) {
  const a = await prisma.absence.findFirst({ where: { id, guildId: assertGuildId(guildId) } });
  if (!a) throw new AbsenceError('not-found', 'Abmeldung nicht gefunden.');
  return a;
}
export async function getByNumber(guildId: string, number: number) {
  const a = await prisma.absence.findUnique({ where: { guildId_number: { guildId: assertGuildId(guildId), number } } });
  if (!a) throw new AbsenceError('not-found', `Abmeldung ${formatNumber(number)} nicht gefunden.`);
  return a;
}

async function notify(port: DiscordPort | undefined, userId: string, content: string) {
  if (port) await port.sendDm(userId, { content }).catch(() => undefined);
}

export interface DecideInput {
  guildId: string;
  absenceId: string;
  actorId: string;
  reason?: string | undefined;
  port?: DiscordPort | undefined;
}

/** Genehmigt: Eintrag „ABSENCE“ in der Personalakte (falls vorhanden), Benachrichtigung, Audit-Log. */
export async function approve(i: DecideInput, now = new Date()) {
  const gid = assertGuildId(i.guildId);
  const a = await getAbsence(gid, i.absenceId);
  if (a.status !== 'PENDING') throw new AbsenceError('conflict', 'Diese Abmeldung ist bereits entschieden oder zurückgezogen.');
  if (a.userId === i.actorId) throw new AbsenceError('forbidden', 'Du kannst deine eigene Abmeldung nicht genehmigen.');
  if (a.endDate < berlinToday(now)) throw new AbsenceError('conflict', 'Der Zeitraum ist bereits vorbei – bitte ablehnen oder neu beantragen.');
  const r = await prisma.absence.updateMany({ where: { id: a.id, status: 'PENDING' }, data: { status: 'APPROVED', decidedBy: i.actorId, decidedAt: now, decisionReason: i.reason?.trim() || null } });
  if (r.count === 0) throw new AbsenceError('conflict', 'Die Abmeldung wurde gerade entschieden.');
  let entryId: string | null = null;
  const record = await getRecordByUser(gid, a.userId);
  if (record && record.status === 'ACTIVE') {
    const e = await addEntry(gid, record.id, { kind: 'ABSENCE', title: `Abmeldung ${fmtDay(a.startDate)} – ${fmtDay(a.endDate)}: ${CATEGORY_LABEL[a.category as AbsenceCategory] ?? a.category}`, body: `${a.reason}\nGenehmigt von <@${i.actorId}>`, occurredAt: a.startDate, data: { absenceId: a.id, number: a.number, start: fmtDay(a.startDate), end: fmtDay(a.endDate) } }, i.actorId);
    entryId = e.id;
  }
  const saved = await prisma.absence.update({ where: { id: a.id }, data: { entryId } });
  await prisma.auditLog.create({ data: { guildId: gid, actorType: 'USER', actorId: i.actorId, action: 'absence.approved', resourceType: 'Absence', resourceId: a.id, after: { userId: a.userId, start: fmtDay(a.startDate), end: fmtDay(a.endDate) } as Json, reason: i.reason?.trim() ?? null, permission: 'absence.manage', result: 'success' } });
  await notify(i.port, a.userId, `✅ Deine Abmeldung ${formatNumber(a.number)} (${fmtDay(a.startDate)} – ${fmtDay(a.endDate)}) wurde genehmigt.`);
  return saved;
}

export async function reject(i: DecideInput, now = new Date()) {
  const gid = assertGuildId(i.guildId);
  const a = await getAbsence(gid, i.absenceId);
  if (a.status !== 'PENDING') throw new AbsenceError('conflict', 'Diese Abmeldung ist bereits entschieden oder zurückgezogen.');
  if (a.userId === i.actorId) throw new AbsenceError('forbidden', 'Du kannst deine eigene Abmeldung nicht ablehnen – ziehe sie stattdessen zurück.');
  const why = i.reason?.trim();
  if (!why || why.length < 3) throw new AbsenceError('invalid', 'Bitte einen Ablehnungsgrund angeben (das Mitglied sieht ihn).');
  const r = await prisma.absence.updateMany({ where: { id: a.id, status: 'PENDING' }, data: { status: 'REJECTED', decidedBy: i.actorId, decidedAt: now, decisionReason: why } });
  if (r.count === 0) throw new AbsenceError('conflict', 'Die Abmeldung wurde gerade entschieden.');
  await prisma.auditLog.create({ data: { guildId: gid, actorType: 'USER', actorId: i.actorId, action: 'absence.rejected', resourceType: 'Absence', resourceId: a.id, after: { userId: a.userId } as Json, reason: why, permission: 'absence.manage', result: 'success' } });
  await notify(i.port, a.userId, `❌ Deine Abmeldung ${formatNumber(a.number)} wurde abgelehnt: ${why}`);
  return getAbsence(gid, a.id);
}

/** Zurückziehen: offene Anträge sofort; genehmigte, die noch nicht begonnen haben, ebenfalls (Akteneintrag wird widerrufen). */
export async function withdraw(guildId: string, absenceId: string, actorId: string, manage = false, now = new Date()) {
  const gid = assertGuildId(guildId);
  const a = await getAbsence(gid, absenceId);
  if (a.userId !== actorId && !manage) throw new AbsenceError('forbidden', 'Nur du selbst oder die Führung kann die Abmeldung zurückziehen.');
  if (a.status === 'PENDING') {
    await prisma.absence.update({ where: { id: a.id }, data: { status: 'WITHDRAWN' } });
  } else if (a.status === 'APPROVED') {
    if (a.startDate <= berlinToday(now)) throw new AbsenceError('conflict', 'Die Abmeldung läuft bereits – melde dich stattdessen vorzeitig zurück.');
    await prisma.absence.update({ where: { id: a.id }, data: { status: 'WITHDRAWN' } });
    if (a.entryId) await revokeEntry(gid, a.entryId, 'Abmeldung zurückgezogen', actorId).catch(() => undefined);
  } else throw new AbsenceError('conflict', 'Diese Abmeldung ist bereits beendet oder abgelehnt.');
  await prisma.auditLog.create({ data: { guildId: gid, actorType: 'USER', actorId, action: 'absence.withdrawn', resourceType: 'Absence', resourceId: a.id, before: { status: a.status } as Json, ...(a.userId !== actorId ? { permission: 'absence.manage' } : {}), result: 'success' } });
  return getAbsence(gid, a.id);
}

/** Vorzeitig zurückmelden: laufende genehmigte Abmeldung endet heute. */
export async function endEarly(guildId: string, absenceId: string, actorId: string, manage = false, now = new Date()) {
  const gid = assertGuildId(guildId);
  const a = await getAbsence(gid, absenceId);
  if (a.userId !== actorId && !manage) throw new AbsenceError('forbidden', 'Nur du selbst oder die Führung kann dich zurückmelden.');
  const today = berlinToday(now);
  if (a.status !== 'APPROVED' || a.startDate > today || a.endDate < today) throw new AbsenceError('conflict', 'Nur eine laufende, genehmigte Abmeldung lässt sich vorzeitig beenden.');
  await prisma.absence.update({ where: { id: a.id }, data: { status: 'ENDED', endedAt: now } });
  await prisma.auditLog.create({ data: { guildId: gid, actorType: 'USER', actorId, action: 'absence.ended_early', resourceType: 'Absence', resourceId: a.id, after: { end: fmtDay(today) } as Json, ...(a.userId !== actorId ? { permission: 'absence.manage' } : {}), result: 'success' } });
  return getAbsence(gid, a.id);
}

// --- Abfragen -------------------------------------------------------------------------------------------------------

/** Aktuell gültige (genehmigte, laufende) Abmeldung eines Mitglieds. */
export async function activeAbsence(guildId: string, userId: string, now = new Date()) {
  const today = berlinToday(now);
  return prisma.absence.findFirst({ where: { guildId: assertGuildId(guildId), userId, status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } } });
}

/** Wer ist heute abgemeldet? */
export async function listActive(guildId: string, now = new Date()) {
  const today = berlinToday(now);
  return prisma.absence.findMany({ where: { guildId: assertGuildId(guildId), status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } }, orderBy: { endDate: 'asc' } });
}

export interface AbsenceFilter {
  guildId: string;
  status?: string | undefined;
  userId?: string | undefined;
  upcoming?: boolean | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export async function listAbsences(f: AbsenceFilter, now = new Date()) {
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const rows = await prisma.absence.findMany({
    where: {
      guildId: assertGuildId(f.guildId),
      ...(['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'ENDED'].includes(f.status ?? '') ? { status: f.status as 'PENDING' } : {}),
      ...(f.userId ? { userId: f.userId } : {}),
      ...(f.upcoming ? { status: 'APPROVED' as const, endDate: { gte: berlinToday(now) } } : {}),
    },
    orderBy: { number: 'desc' },
    take: limit + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
  });
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
}

/** Historie eines Mitglieds: alle Abmeldungen, neueste zuerst. */
export const historyOf = (guildId: string, userId: string) => prisma.absence.findMany({ where: { guildId: assertGuildId(guildId), userId }, orderBy: { startDate: 'desc' }, take: 100 });
