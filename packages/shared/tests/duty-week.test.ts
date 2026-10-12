import { describe, expect, it } from 'vitest';
import { weekIso, nextWeekStart, weekKey, weekLabel, weekStartOf, weekTotals } from '../src/duty-week';

describe('Dienstwoche Europe/Berlin', () => {
  it('Montag 00:00 Ortszeit; Sonntag 23:59 gehört noch zur alten Woche', () => {
    expect(weekStartOf(new Date('2026-10-11T21:59:00Z')).toISOString()).toBe('2026-10-04T22:00:00.000Z'); // So 23:59 MESZ
    expect(weekStartOf(new Date('2026-10-11T22:00:00Z')).toISOString()).toBe('2026-10-11T22:00:00.000Z'); // Mo 00:00 MESZ
    expect(weekStartOf(new Date('2026-10-12T08:00:00Z')).toISOString()).toBe('2026-10-11T22:00:00.000Z');
  });
  it('Winterzeit-Umstellung: Woche hat 169 Stunden, Sommerzeit-Umstellung 167', () => {
    const w = weekStartOf(new Date('2026-10-20T12:00:00Z')); // Woche mit dem 25.10. (Umstellung)
    expect(w.toISOString()).toBe('2026-10-18T22:00:00.000Z');
    const n = nextWeekStart(w);
    expect(n.toISOString()).toBe('2026-10-25T23:00:00.000Z'); // Mo 00:00 MEZ
    expect((n.getTime() - w.getTime()) / 3_600_000).toBe(169);
    const s = weekStartOf(new Date('2027-03-25T12:00:00Z'));
    expect(s.toISOString()).toBe('2027-03-21T23:00:00.000Z');
    expect((nextWeekStart(s).getTime() - s.getTime()) / 3_600_000).toBe(167);
    expect(nextWeekStart(s).toISOString()).toBe('2027-03-28T22:00:00.000Z');
  });
  it('Schlüssel, Kalenderwoche und Bezeichnung (auch über den Jahreswechsel)', () => {
    const w = new Date('2026-10-04T22:00:00Z');
    expect(weekKey(w)).toBe('2026-10-05');
    expect(weekIso(w)).toEqual({ year: 2026, week: 41 });
    expect(weekLabel(w)).toBe('KW 41/2026 · 05.10.–11.10.2026');
    const ny = weekStartOf(new Date('2027-01-01T12:00:00Z'));
    expect(weekKey(ny)).toBe('2026-12-28');
    expect(weekIso(ny)).toEqual({ year: 2026, week: 53 });
    expect(weekLabel(ny)).toBe('KW 53/2026 · 28.12.–03.01.2027');
  });
  it('Summen: an den Wochengrenzen abgeschnitten, Pause zählt nicht', () => {
    const from = new Date('2026-10-04T22:00:00Z'), to = new Date('2026-10-11T22:00:00Z');
    const r = weekTotals([
      { userId: 'a', status: 'ON_DUTY', startedAt: new Date('2026-10-04T21:00:00Z'), endedAt: new Date('2026-10-04T23:00:00Z') }, // 1 h in der Woche
      { userId: 'a', status: 'BREAK', startedAt: new Date('2026-10-05T10:00:00Z'), endedAt: new Date('2026-10-05T10:30:00Z') },
      { userId: 'b', status: 'ON_DUTY', startedAt: new Date('2026-10-11T20:00:00Z'), endedAt: null }, // läuft über den Reset
      { userId: 'c', status: 'ON_DUTY', startedAt: new Date('2026-10-12T01:00:00Z'), endedAt: new Date('2026-10-12T02:00:00Z') }, // nächste Woche
    ], from, to, new Date('2026-10-12T08:00:00Z'));
    expect(r.map((x) => [x.userId, x.minutes, x.breakMinutes])).toEqual([['b', 120, 0], ['a', 60, 30]]);
  });
});
