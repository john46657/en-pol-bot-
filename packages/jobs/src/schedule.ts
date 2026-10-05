/**
 * Zeitplan automatischer Nachrichten (reine Logik): nächster Sendezeitpunkt nach `after`. Uhrzeiten gelten in deutscher
 * Zeit (Europe/Berlin, inkl. Sommer-/Winterzeit). Wochentage: 1 = Montag … 7 = Sonntag.
 */
export type ScheduleType = 'once' | 'interval' | 'daily' | 'weekly';
export interface Schedule {
  scheduleType: ScheduleType | string;
  runAt?: Date | null | undefined;
  intervalMinutes?: number | null | undefined;
  timeOfDay?: string | null | undefined;
  weekdays?: number[] | null | undefined;
}

export const MIN_INTERVAL_MINUTES = 10;
const TZ = 'Europe/Berlin';

/** Versatz Berlin ↔ UTC (Minuten) zu einem Zeitpunkt. */
function offsetMinutes(at: Date): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p['year']), Number(p['month']) - 1, Number(p['day']), Number(p['hour']), Number(p['minute']));
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/** Berliner Kalenderdatum (y, m 0-basiert, d) und Wochentag (1 = Mo … 7 = So) eines Zeitpunkts. */
function berlinDate(at: Date): { y: number; m: number; d: number; weekday: number } {
  const local = new Date(at.getTime() + offsetMinutes(at) * 60_000);
  const wd = local.getUTCDay();
  return { y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate(), weekday: wd === 0 ? 7 : wd };
}

/** Berliner Wanduhrzeit → Zeitpunkt (bei der Zeitumstellung wird die nächstgültige Zeit genommen). */
export function berlinTime(y: number, m: number, d: number, hh: number, mm: number): Date {
  const guess = Date.UTC(y, m, d, hh, mm);
  let t = guess - offsetMinutes(new Date(guess)) * 60_000;
  t = guess - offsetMinutes(new Date(t)) * 60_000;
  return new Date(t);
}

export function parseTimeOfDay(v: string | null | undefined): { hh: number; mm: number } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v ?? '');
  return m ? { hh: Number(m[1]), mm: Number(m[2]) } : null;
}

export function nextRun(s: Schedule, after: Date): Date | null {
  if (s.scheduleType === 'once') return s.runAt && s.runAt > after ? s.runAt : null;
  if (s.scheduleType === 'interval') {
    const min = Math.max(MIN_INTERVAL_MINUTES, s.intervalMinutes ?? 0);
    if (s.runAt && s.runAt > after) return s.runAt;
    return new Date(after.getTime() + min * 60_000);
  }
  const t = parseTimeOfDay(s.timeOfDay);
  if (!t) return null;
  const days = s.scheduleType === 'weekly' ? new Set((s.weekdays ?? []).filter((w) => w >= 1 && w <= 7)) : new Set([1, 2, 3, 4, 5, 6, 7]);
  if (s.scheduleType !== 'daily' && s.scheduleType !== 'weekly') return null;
  if (days.size === 0) return null;
  const start = berlinDate(after);
  for (let i = 0; i <= 8; i++) {
    const day = new Date(Date.UTC(start.y, start.m, start.d + i));
    const wd = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
    if (!days.has(wd)) continue;
    const at = berlinTime(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), t.hh, t.mm);
    if (at > after) return at;
  }
  return null;
}
