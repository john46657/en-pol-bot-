import { describe, expect, it } from 'vitest';
import { berlinBoundaries, computeStats, type StatsRow } from '../src/modules/applications/services/team-chance-stats.js';

describe('Team-Chance-Auswertung', () => {
  it('Tages-, Wochen- und Monatsbeginn in deutscher Zeit (Sommer- und Winterzeit)', () => {
    // Mittwoch, 15.10.2026 10:00 Berlin (Sommerzeit, UTC+2)
    const s = berlinBoundaries(new Date('2026-10-15T08:00:00Z'));
    expect(s.day.toISOString()).toBe('2026-10-14T22:00:00.000Z');
    expect(s.week.toISOString()).toBe('2026-10-11T22:00:00.000Z'); // Montag 12.10.
    expect(s.month.toISOString()).toBe('2026-09-30T22:00:00.000Z');
    // Dienstag, 15.12.2026 00:30 Berlin (Winterzeit, UTC+1) – UTC ist noch der Vortag
    const w = berlinBoundaries(new Date('2026-12-14T23:30:00Z'));
    expect(w.day.toISOString()).toBe('2026-12-14T23:00:00.000Z');
    expect(w.week.toISOString()).toBe('2026-12-13T23:00:00.000Z');
  });

  it('Kennzahlen: Zeiträume, offen, Ergebnisse, Quoten, Ø Bearbeitungszeit', () => {
    const now = new Date('2026-10-15T08:00:00Z');
    const r = (status: string, submitted: string | null, decidedMin?: number): StatsRow => {
      const sub = submitted ? new Date(submitted) : null;
      const dec = sub && decidedMin !== undefined ? new Date(sub.getTime() + decidedMin * 60_000) : null;
      return { applicationId: 'a', status, startedAt: sub ?? now, submittedAt: sub, acceptedAt: status === 'ACCEPTED' ? dec : null, deniedAt: status === 'DENIED' ? dec : null };
    };
    const rows = [
      r('SUBMITTED', '2026-10-15T07:00:00Z'), // heute
      r('ON_HOLD', '2026-10-13T07:00:00Z'), // diese Woche
      r('ACCEPTED', '2026-10-02T07:00:00Z', 30), // diesen Monat
      r('ACCEPTED', '2026-09-20T07:00:00Z', 90),
      r('DENIED', '2026-09-10T07:00:00Z', 60),
      r('CANCELLED', null),
      r('EXPIRED', null),
    ];
    expect(computeStats(rows, now)).toEqual({
      started: 7,
      submitted: 5,
      today: 1,
      week: 2,
      month: 3,
      open: 2,
      onHold: 1,
      accepted: 2,
      denied: 1,
      cancelled: 1,
      expired: 1,
      withdrawn: 0,
      avgProcessingMinutes: 60,
      acceptanceRate: 2 / 3,
      denialRate: 1 / 3,
    });
  });

  it('ohne Entscheidungen keine Quoten und keine Bearbeitungszeit', () => {
    expect(computeStats([])).toMatchObject({ started: 0, acceptanceRate: null, denialRate: null, avgProcessingMinutes: null });
  });
});
