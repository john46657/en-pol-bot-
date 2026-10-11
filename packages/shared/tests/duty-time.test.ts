import { describe, expect, it } from 'vitest';
import { dutyTimeText, isDutyTimeField, periodEnd, periodStart, policeReportFields, reportMessage, reportTemplateSchema } from '../src/duty-reports';

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

describe('reportMessage – Listen-Darstellung', () => {
  it('rendert ➣-Liste mit Trennlinien und Fußzeile wie im Polizei-Format', () => {
    const t = reportTemplateSchema.parse({ id: '00000000-0000-4000-8000-000000000000', name: 'Tagesbericht', emoji: '📖', fields: policeReportFields(), layout: 'LIST' });
    const m = reportMessage(t, { number: '67', period: 'DAILY', periodStart: new Date(), values: { roblox: 'frd_le0n', dienstzeit: '2 h 22 min', verfolgungen: '8', dispatch: '5' }, authorName: 'frd_le0n', authorDiscordId: '823132981676736522', status: 'SUBMITTED', updatedAt: new Date(), edited: false }, 'x');
    const e = m.embeds![0]!;
    expect(e.title).toBe('📖 Tagesbericht frd_le0n');
    expect(e.description).toContain('➣ **Roblox-Username:** frd_le0n\n➣ **Zeitraum:** 2 h 22 min\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n➣ **Verfolgungen:** 8');
    expect(e.description).toContain('➣ **Geblitzt:** \n');
    expect(e.footer).toBe('67 | frd_le0n ( 823132981676736522 )');
    expect(e.fields).toBeUndefined();
  });
  it('alte Vorlagen bleiben bei Embed-Feldern', () => {
    const t = reportTemplateSchema.parse({ id: '00000000-0000-4000-8000-000000000000', name: 'X', fields: [{ id: 'a', label: 'A' }] });
    expect(t.layout).toBe('FIELDS');
    expect(reportMessage(t, { number: 'TB-1', period: 'DAILY', periodStart: new Date(), values: { a: '1' }, authorName: 'M', status: 'SUBMITTED', updatedAt: new Date(), edited: false }, 'x').embeds![0]!.fields).toHaveLength(1);
  });
});
