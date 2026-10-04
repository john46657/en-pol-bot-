/**
 * Zeitberechnung für Schichten (reine Funktionen, alles in UTC-Zeitstempeln).
 *
 * Nettodauer = (Ende − Beginn) − Pausen. Eine laufende Pause zählt bis zum Ende bzw. bis „jetzt“.
 */
export interface TimedShift {
  startedAt: Date;
  endedAt?: Date | null | undefined;
  /** Beginn der aktuell laufenden Pause. */
  pausedAt?: Date | null | undefined;
  /** Summe der bereits beendeten Pausen. */
  pausedSeconds: number;
}

export interface Duration {
  grossSeconds: number;
  pausedSeconds: number;
  netSeconds: number;
}

const secs = (a: Date, b: Date) => Math.max(0, Math.floor((b.getTime() - a.getTime()) / 1000));

/** Dauer einer Schicht; offene Schichten werden bis `now` gerechnet. Nie negativ. */
export function computeDuration(s: TimedShift, now: Date = new Date()): Duration {
  const end = s.endedAt ?? now;
  const grossSeconds = secs(s.startedAt, end);
  const open = s.pausedAt ? secs(s.pausedAt, end) : 0;
  const pausedSeconds = Math.min(grossSeconds, Math.max(0, s.pausedSeconds) + open);
  return { grossSeconds, pausedSeconds, netSeconds: grossSeconds - pausedSeconds };
}

export interface ShiftStats {
  count: number;
  totalSeconds: number;
  averageSeconds: number;
}

/** Anzahl, Gesamt- und Durchschnittsdauer (nur Nettodauern beendeter Schichten). */
export function aggregate(durations: readonly number[]): ShiftStats {
  const totalSeconds = durations.reduce((a, b) => a + b, 0);
  return {
    count: durations.length,
    totalSeconds,
    averageSeconds: durations.length ? Math.round(totalSeconds / durations.length) : 0,
  };
}

/** Wie {@link aggregate}, aber aus bereits berechneter Anzahl und Summe (z. B. aus einer Datenbank-Aggregation). */
export function fromSums(count: number, totalSeconds: number): ShiftStats {
  return { count, totalSeconds, averageSeconds: count ? Math.round(totalSeconds / count) : 0 };
}

export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h} Std ${String(m).padStart(2, '0')} Min`;
  if (m > 0) return `${m} Min ${String(r).padStart(2, '0')} Sek`;
  return `${r} Sek`;
}

/** Läuft die offene Schicht länger als erlaubt? (Brutto, damit auch eine „vergessene“ Pause auffällt.) */
export function isOverlong(s: TimedShift, maxMinutes: number, now: Date = new Date()): boolean {
  return computeDuration({ ...s, endedAt: null }, now).grossSeconds > maxMinutes * 60;
}

/** Prüft eine manuelle Korrektur. Gibt Fehlertexte zurück (leer = gültig). */
export function validateCorrection(
  c: { startedAt: Date; endedAt: Date; pausedSeconds: number },
  now: Date = new Date(),
): string[] {
  const errors: string[] = [];
  if (Number.isNaN(c.startedAt.getTime()) || Number.isNaN(c.endedAt.getTime())) return ['Ungültiges Datum.'];
  if (c.endedAt.getTime() < c.startedAt.getTime()) errors.push('Das Ende liegt vor dem Beginn.');
  if (c.endedAt.getTime() > now.getTime() + 60_000) errors.push('Das Ende darf nicht in der Zukunft liegen.');
  if (!Number.isInteger(c.pausedSeconds) || c.pausedSeconds < 0) errors.push('Die Pausenzeit muss eine nicht-negative ganze Zahl sein.');
  else if (c.pausedSeconds > secs(c.startedAt, c.endedAt)) errors.push('Die Pausen sind länger als die Schicht.');
  if (secs(c.startedAt, c.endedAt) > 7 * 86_400) errors.push('Eine Schicht darf höchstens 7 Tage dauern.');
  return errors;
}
