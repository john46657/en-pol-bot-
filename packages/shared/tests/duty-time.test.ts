import { describe, expect, it } from 'vitest';
import { dutyTimeText, isDutyTimeField, periodEnd, periodStart } from '../src/duty-reports';

const day = new Date('2026-10-08T00:00:00Z'), end = periodEnd('DAILY', day);
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 8, h, m));

describe('Dienstzeit automatisch', () => {
  it('erkennt Dienstzeit-Felder', () => {
    expect(isDutyTimeField({ id: 'dienstzeit', label: 'Dienstzeit', type: 'short' })).toBe(true);
    expect(isDutyTimeField({ id: 'zeit', label: 'Dienststunden der Woche', type: 'short' })).toBe(true);
    expect(isDutyTimeField({ id: 'taetigkeiten', label: 'Tätigkeiten', type: 'long' })).toBe(false);
  });
  it('Tag: Schichten mit Uhrzeit, Pausen zählen nicht', () => {
    const s = [
      { status: 'ON_DUTY', startedAt: at(16), endedAt: at(17) }, { status: 'BREAK', startedAt: at(17), endedAt: at(17, 30) }, { status: 'ON_DUTY', startedAt: at(17, 30), endedAt: at(19) },
      { status: 'ON_DUTY', startedAt: at(20), endedAt: at(20, 45) },
    ];
    expect(dutyTimeText('DAILY', s, day, end, 'UTC')).toBe('16:00–19:00, 20:00–20:45 (3 h 15 min)');
  });
  it('Woche: Summe und Anzahl Schichten; ohne Dienst null; laufende Schicht „jetzt“', () => {
    const w = periodStart('WEEKLY', day);
    const s = [{ status: 'ON_DUTY', startedAt: at(10), endedAt: at(12) }, { status: 'ON_DUTY', startedAt: new Date(Date.UTC(2026, 9, 6, 18)), endedAt: new Date(Date.UTC(2026, 9, 6, 20, 30)) }];
    expect(dutyTimeText('WEEKLY', s, w, periodEnd('WEEKLY', w), 'UTC')).toBe('4 h 30 min in 2 Schichten');
    expect(dutyTimeText('DAILY', [], day, end, 'UTC')).toBeNull();
    expect(dutyTimeText('DAILY', [{ status: 'ON_DUTY', startedAt: at(18), endedAt: null }], day, end, 'UTC', at(19, 30))).toBe('18:00–jetzt (1 h 30 min)');
  });
});
