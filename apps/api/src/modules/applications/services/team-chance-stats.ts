/**
 * Auswertung der Bewerbungsarten (Team-Chance, Punkt 19) – reine Berechnung aus den Bewerbungen (ohne Testbewerbungen).
 * Zeiträume „heute/Woche/Monat“ in deutscher Zeit (Woche ab Montag), bezogen auf das Einreichen.
 */
export interface StatsRow {
  applicationId: string;
  status: string;
  startedAt: Date;
  submittedAt: Date | null;
  acceptedAt: Date | null;
  deniedAt: Date | null;
}

export interface TeamChanceStats {
  started: number;
  submitted: number;
  today: number;
  week: number;
  month: number;
  open: number;
  onHold: number;
  accepted: number;
  denied: number;
  cancelled: number;
  expired: number;
  withdrawn: number;
  /** Durchschnittliche Bearbeitungszeit (Einreichen → Entscheidung) in Minuten; null ohne Entscheidungen. */
  avgProcessingMinutes: number | null;
  /** Anteil an den Entscheidungen (0–1); null ohne Entscheidungen. */
  acceptanceRate: number | null;
  denialRate: number | null;
}

const OPEN = new Set(['SUBMITTED', 'UNDER_REVIEW', 'ON_HOLD']);

/** Beginn von Tag, Woche (Montag) und Monat in Europe/Berlin als UTC-Zeitpunkt. */
export function berlinBoundaries(now: Date): { day: Date; week: Date; month: Date } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  // Versatz Berlin ↔ UTC zu diesem Zeitpunkt (Sommer-/Winterzeit)
  const asUtc = Date.UTC(Number(parts['year']), Number(parts['month']) - 1, Number(parts['day']), Number(parts['hour']) % 24, Number(parts['minute']));
  const offset = asUtc - Math.floor(now.getTime() / 60_000) * 60_000;
  const midnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - offset);
  const y = Number(parts['year']);
  const m = Number(parts['month']) - 1;
  const d = Number(parts['day']);
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(String(parts['weekday']));
  return { day: midnight(y, m, d), week: midnight(y, m, d - weekday), month: midnight(y, m, 1) };
}

export function computeStats(rows: StatsRow[], now = new Date()): TeamChanceStats {
  const b = berlinBoundaries(now);
  const submitted = rows.filter((r) => r.submittedAt);
  const count = (st: string) => rows.filter((r) => r.status === st).length;
  const decided = rows.flatMap((r) => {
    const at = r.acceptedAt ?? r.deniedAt;
    return r.submittedAt && at && (r.status === 'ACCEPTED' || r.status === 'DENIED') ? [at.getTime() - r.submittedAt.getTime()] : [];
  });
  const accepted = count('ACCEPTED');
  const denied = count('DENIED');
  const decisions = accepted + denied;
  return {
    started: rows.length,
    submitted: submitted.length,
    today: submitted.filter((r) => r.submittedAt! >= b.day).length,
    week: submitted.filter((r) => r.submittedAt! >= b.week).length,
    month: submitted.filter((r) => r.submittedAt! >= b.month).length,
    open: rows.filter((r) => OPEN.has(r.status)).length,
    onHold: count('ON_HOLD'),
    accepted,
    denied,
    cancelled: count('CANCELLED'),
    expired: count('EXPIRED'),
    withdrawn: count('WITHDRAWN'),
    avgProcessingMinutes: decided.length ? Math.round(decided.reduce((a, x) => a + x, 0) / decided.length / 60_000) : null,
    acceptanceRate: decisions ? accepted / decisions : null,
    denialRate: decisions ? denied / decisions : null,
  };
}
