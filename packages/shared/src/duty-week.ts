/**
 * Dienstwoche für den automatischen Wochen-Reset: Montag 00:00 bis zum folgenden Montag 00:00 in einer Zeitzone
 * (Standard Europe/Berlin, Sommer-/Winterzeit automatisch – eine Woche hat dann 167 bzw. 169 Stunden).
 */
export const WEEK_TIMEZONE = 'Europe/Berlin';

/** Lokales Datum (Jahr, Monat 1–12, Tag) und Wochentag (1 = Montag … 7 = Sonntag) eines Zeitpunkts in `timeZone`. */
function localParts(at: Date, timeZone: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(at).map((x) => [x.type, x.value]));
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday!) + 1;
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute), s: Number(p.second), wd };
}

/** Abstand der Zeitzone zu UTC (ms) zum Zeitpunkt `at`. */
function offsetMs(at: Date, timeZone: string) {
  const l = localParts(at, timeZone);
  return Date.UTC(l.y, l.m - 1, l.d, l.h, l.min, l.s) - Math.floor(at.getTime() / 1000) * 1000;
}

/** Zeitpunkt von lokal 00:00 am Tag (y, m, d) in `timeZone`. Tagesüberlauf (d = 32 …) ist erlaubt. */
export function localMidnight(y: number, m: number, d: number, timeZone = WEEK_TIMEZONE): Date {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMs(new Date(guess), timeZone);
  t = guess - offsetMs(new Date(t), timeZone); // zweiter Schritt, falls zwischen Schätzung und Ergebnis die Zeit umgestellt wurde
  return new Date(t);
}

/** Beginn der Woche (Montag 00:00 lokal), in der `at` liegt. */
export function weekStartOf(at: Date, timeZone = WEEK_TIMEZONE): Date {
  const l = localParts(at, timeZone);
  return localMidnight(l.y, l.m, l.d - (l.wd - 1), timeZone);
}

/** Beginn der folgenden Woche (nächster Montag 00:00 lokal) – zugleich das Ende der Woche ab `weekStart`. */
export function nextWeekStart(weekStart: Date, timeZone = WEEK_TIMEZONE): Date {
  // +3,5 Tage liegt sicher in derselben Woche, unabhängig von der Zeitumstellung
  const l = localParts(new Date(weekStart.getTime() + 84 * 3_600_000), timeZone);
  return localMidnight(l.y, l.m, l.d - (l.wd - 1) + 7, timeZone);
}

/** ISO-Kalenderwoche des lokalen Montags. */
export function weekIso(weekStart: Date, timeZone = WEEK_TIMEZONE): { year: number; week: number } {
  const l = localParts(new Date(weekStart.getTime() + 84 * 3_600_000), timeZone);
  const date = new Date(Date.UTC(l.y, l.m - 1, l.d));
  date.setUTCDate(date.getUTCDate() + 4 - l.wd); // Donnerstag derselben Woche
  const year = date.getUTCFullYear();
  return { year, week: Math.ceil(((date.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7) };
}

/** Schlüssel einer Woche: lokales Datum des Montags, z. B. „2026-10-05“. */
export function weekKey(weekStart: Date, timeZone = WEEK_TIMEZONE): string {
  const l = localParts(new Date(weekStart.getTime() + 84 * 3_600_000), timeZone);
  const mon = new Date(Date.UTC(l.y, l.m - 1, l.d - (l.wd - 1)));
  return mon.toISOString().slice(0, 10);
}

/** „KW 41/2026 · 05.10.–11.10.2026“ */
export function weekLabel(weekStart: Date, timeZone = WEEK_TIMEZONE): string {
  const { year, week } = weekIso(weekStart, timeZone);
  const [y, m, d] = weekKey(weekStart, timeZone).split('-').map(Number) as [number, number, number];
  const f = (x: Date, withYear = false) => x.toLocaleDateString('de-DE', { timeZone: 'UTC', day: '2-digit', month: '2-digit', ...(withYear ? { year: 'numeric' } : {}) });
  return `KW ${week}/${year} · ${f(new Date(Date.UTC(y, m - 1, d)))}–${f(new Date(Date.UTC(y, m - 1, d + 6)), true)}`;
}

export interface WeekSpan { userId: string; status: string; startedAt: Date; endedAt: Date | null }
/** Statuswerte, die in der Wochenrangliste als Dienstzeit zählen (Pause zählt nicht). */
export const WEEK_COUNTED_STATUSES = ['ON_DUTY', 'TRAINING', 'ADMINISTRATIVE'] as const;

/**
 * Dienstzeit je Benutzer in [from, to): Sitzungen werden an den Wochengrenzen abgeschnitten (eine über Mitternacht
 * laufende Schicht zählt anteilig in beide Wochen). `minutes` = gezählte Dienstzeit ohne Pause.
 */
export function weekTotals(sessions: WeekSpan[], from: Date, to: Date, now = new Date()) {
  const rows = new Map<string, { userId: string; minutes: number; breakMinutes: number; byStatus: Record<string, number>; sessions: number }>();
  const counted = new Set<string>(WEEK_COUNTED_STATUSES);
  for (const s of sessions) {
    const a = Math.max(s.startedAt.getTime(), from.getTime());
    const b = Math.min((s.endedAt ?? now).getTime(), to.getTime());
    if (b <= a) continue;
    const r = rows.get(s.userId) ?? { userId: s.userId, minutes: 0, breakMinutes: 0, byStatus: {}, sessions: 0 };
    const min = (b - a) / 60_000;
    r.byStatus[s.status] = (r.byStatus[s.status] ?? 0) + min;
    if (counted.has(s.status)) r.minutes += min;
    if (s.status === 'BREAK') r.breakMinutes += min;
    r.sessions++;
    rows.set(s.userId, r);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, minutes: Math.round(r.minutes), breakMinutes: Math.round(r.breakMinutes), byStatus: Object.fromEntries(Object.entries(r.byStatus).map(([k, v]) => [k, Math.round(v)])) }))
    .filter((r) => r.minutes > 0 || r.breakMinutes > 0)
    .sort((x, y) => y.minutes - x.minutes || y.sessions - x.sessions);
}
