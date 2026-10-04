import { assertGuildId, prisma, type Prisma } from '@nexus/database';
import { fromSums, type ShiftStats } from './time.js';

/**
 * Statistik und Leaderboard. Gerechnet wird aus den gespeicherten, **beendeten** Schichten (Nettodauer). Eine Schicht
 * zählt vollständig in den Zeitraum, in dem sie **begonnen** hat (eine Schicht über Mitternacht wird nicht zerteilt).
 * Tages-/Wochen-/Monatsgrenzen gelten in der Zeitzone des Servers (Standard Europe/Berlin), Woche beginnt am Montag.
 */
export const PERIODS = ['day', 'week', 'month', 'all'] as const;
export type Period = (typeof PERIODS)[number];
export const DEFAULT_TZ = 'Europe/Berlin';

/** Versatz (ms) der Zeitzone zu UTC zu einem Zeitpunkt. */
function offsetMs(tz: string, at: Date): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(at.getTime() / 1000) * 1000;
}

/** UTC-Zeitpunkt „Mitternacht lokal“ des Kalendertags (y, m, d) in `tz`. */
function localMidnight(tz: string, y: number, m: number, d: number): Date {
  const guess = Date.UTC(y, m, d);
  const first = guess - offsetMs(tz, new Date(guess));
  return new Date(guess - offsetMs(tz, new Date(first)));
}

function localParts(tz: string, at: Date) {
  const l = new Date(at.getTime() + offsetMs(tz, at));
  return { y: l.getUTCFullYear(), m: l.getUTCMonth(), d: l.getUTCDate(), dow: (l.getUTCDay() + 6) % 7 };
}

/** Zeitraum `[from, to)` für `period` um `now`; `all` hat keine Grenzen. */
export function periodRange(period: Period, now: Date = new Date(), tz: string = DEFAULT_TZ): { from: Date | undefined; to: Date | undefined } {
  if (period === 'all') return { from: undefined, to: undefined };
  const { y, m, d, dow } = localParts(tz, now);
  if (period === 'day') return { from: localMidnight(tz, y, m, d), to: localMidnight(tz, y, m, d + 1) };
  if (period === 'week') return { from: localMidnight(tz, y, m, d - dow), to: localMidnight(tz, y, m, d - dow + 7) };
  return { from: localMidnight(tz, y, m, 1), to: localMidnight(tz, y, m + 1, 1) };
}

export interface StatsScope {
  guildId: string;
  typeId?: string | undefined;
  /** `null` = alle, sonst nur Mitglieder dieser Teams. */
  restrictToTeams?: string[] | null | undefined;
  tz?: string | undefined;
  now?: Date | undefined;
}

async function where(s: StatsScope, period: Period, userId?: string): Promise<Prisma.ShiftWhereInput> {
  const guildId = assertGuildId(s.guildId);
  const { from, to } = periodRange(period, s.now, s.tz);
  let userFilter: Prisma.ShiftWhereInput = userId ? { userId } : {};
  if (s.restrictToTeams) {
    const ids = (await prisma.personnelRecord.findMany({ where: { guildId, teamId: { in: s.restrictToTeams } }, select: { userId: true } })).map((r) => r.userId);
    userFilter = { userId: userId ? (ids.includes(userId) ? userId : '__none__') : { in: ids } };
  }
  return { guildId, status: 'ENDED', durationSeconds: { not: null }, ...(s.typeId ? { typeId: s.typeId } : {}), ...(from || to ? { startedAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}), ...userFilter };
}

export interface PeriodOverview extends ShiftStats {
  period: Period;
  from: string | null;
  to: string | null;
}

/** Heute / Woche / Monat / Gesamt in einem Aufruf – optional für ein einzelnes Mitglied. */
export async function overview(s: StatsScope, userId?: string): Promise<PeriodOverview[]> {
  const out: PeriodOverview[] = [];
  for (const period of PERIODS) {
    // Summe/Anzahl in der Datenbank statt alle Zeilen zu laden (bei 100 000 Schichten sonst Speicher und Zeit)
    const sum = await prisma.shift.aggregate({ where: await where(s, period, userId), _count: { _all: true }, _sum: { durationSeconds: true } });
    const { from, to } = periodRange(period, s.now, s.tz);
    out.push({ period, from: from?.toISOString() ?? null, to: to?.toISOString() ?? null, ...fromSums(sum._count._all, sum._sum.durationSeconds ?? 0) });
  }
  return out;
}

export interface LeaderboardEntry extends ShiftStats {
  rank: number;
  userId: string;
}

/** Rangliste nach Gesamtzeit (bei Gleichstand: mehr Schichten, dann Mitglieds-ID – stabil und reproduzierbar). */
export async function leaderboard(s: StatsScope & { period: Period; limit?: number }): Promise<LeaderboardEntry[]> {
  const groups = await prisma.shift.groupBy({ by: ['userId'], where: await where(s, s.period), _sum: { durationSeconds: true }, _count: { _all: true } });
  return groups
    .map((g) => ({ userId: g.userId, count: g._count._all, totalSeconds: g._sum.durationSeconds ?? 0 }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds || b.count - a.count || a.userId.localeCompare(b.userId))
    .slice(0, Math.min(Math.max(s.limit ?? 10, 1), 100))
    .map((g, i) => ({ rank: i + 1, ...g, averageSeconds: g.count ? Math.round(g.totalSeconds / g.count) : 0 }));
}

/** Platz eines Mitglieds in der Rangliste (null = keine Schicht im Zeitraum). */
export async function rankOf(s: StatsScope & { period: Period }, userId: string): Promise<number | null> {
  const all = await leaderboard({ ...s, limit: 100 });
  const hit = all.find((e) => e.userId === userId);
  if (hit) return hit.rank;
  const mine = await prisma.shift.aggregate({ where: await where(s, s.period, userId), _sum: { durationSeconds: true }, _count: { _all: true } });
  if (!mine._count._all) return null;
  const groups = await prisma.shift.groupBy({ by: ['userId'], where: await where(s, s.period), _sum: { durationSeconds: true } });
  return groups.filter((g) => (g._sum.durationSeconds ?? 0) > (mine._sum.durationSeconds ?? 0)).length + 1;
}
