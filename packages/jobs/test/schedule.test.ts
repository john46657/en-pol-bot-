import { describe, expect, it } from 'vitest';
import { berlinTime, nextRun } from '../src/schedule.js';

const iso = (d: Date | null) => d?.toISOString() ?? null;

describe('Zeitplan automatischer Nachrichten', () => {
  it('deutsche Uhrzeit → UTC (Sommer- und Winterzeit)', () => {
    expect(iso(berlinTime(2026, 6, 1, 9, 0))).toBe('2026-07-01T07:00:00.000Z');
    expect(iso(berlinTime(2026, 11, 1, 9, 0))).toBe('2026-12-01T08:00:00.000Z');
  });
  it('einmalig: nur wenn in der Zukunft', () => {
    const at = new Date('2026-10-06T10:00:00Z');
    expect(iso(nextRun({ scheduleType: 'once', runAt: at }, new Date('2026-10-05T10:00:00Z')))).toBe(at.toISOString());
    expect(nextRun({ scheduleType: 'once', runAt: at }, new Date('2026-10-07T10:00:00Z'))).toBeNull();
  });
  it('Intervall: mindestens 10 Minuten; optionaler Start', () => {
    const now = new Date('2026-10-05T10:00:00Z');
    expect(iso(nextRun({ scheduleType: 'interval', intervalMinutes: 60 }, now))).toBe('2026-10-05T11:00:00.000Z');
    expect(iso(nextRun({ scheduleType: 'interval', intervalMinutes: 1 }, now))).toBe('2026-10-05T10:10:00.000Z');
    expect(iso(nextRun({ scheduleType: 'interval', intervalMinutes: 60, runAt: new Date('2026-10-05T12:30:00Z') }, now))).toBe('2026-10-05T12:30:00.000Z');
  });
  it('täglich: heute, wenn noch nicht vorbei, sonst morgen', () => {
    expect(iso(nextRun({ scheduleType: 'daily', timeOfDay: '18:00' }, new Date('2026-10-05T10:00:00Z')))).toBe('2026-10-05T16:00:00.000Z');
    expect(iso(nextRun({ scheduleType: 'daily', timeOfDay: '09:00' }, new Date('2026-10-05T10:00:00Z')))).toBe('2026-10-06T07:00:00.000Z');
    expect(nextRun({ scheduleType: 'daily', timeOfDay: '25:00' }, new Date())).toBeNull();
  });
  it('wöchentlich: nächster gewählter Wochentag; über die Zeitumstellung (25.10.2026)', () => {
    // Montag, 05.10.2026 – Mittwoch und Freitag 20:00
    expect(iso(nextRun({ scheduleType: 'weekly', timeOfDay: '20:00', weekdays: [3, 5] }, new Date('2026-10-05T10:00:00Z')))).toBe('2026-10-07T18:00:00.000Z');
    // Samstag, 24.10. → Montag, 26.10. 09:00 Winterzeit (UTC+1)
    expect(iso(nextRun({ scheduleType: 'weekly', timeOfDay: '09:00', weekdays: [1] }, new Date('2026-10-24T12:00:00Z')))).toBe('2026-10-26T08:00:00.000Z');
    expect(nextRun({ scheduleType: 'weekly', timeOfDay: '09:00', weekdays: [] }, new Date())).toBeNull();
  });
});
