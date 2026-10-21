import { describe, expect, it } from 'vitest';
import {
  anomalies, checkIncident, checkReport, checkWanted, confidenceFor, contradictoryTimeSpans, drawQuestions, estimateNext, examProblems, examSchema, gradeAnswer,
  incidentNumbersIn, isRemovedExamTask, lowStaffingWindows, qualityConfigSchema, questionSchema, rubricScore, splitFindings, staffingHeatmap, titleSimilarity, weakTopicsOf,
  ALL_PERMISSIONS, moduleOfPermission,
} from '../src';

const cfg = qualityConfigSchema.parse({});
const d = (s: string) => new Date(s);

describe('Qualitätsprüfer: Berichte', () => {
  const base = { type: 'GENERAL', title: 'Streife Innenstadt', body: 'x'.repeat(120), status: 'SUBMITTED', createdAt: d('2026-10-01T10:00:00Z'), updatedAt: d('2026-10-01T10:00:00Z'), incidentId: null, incident: null, unknownNumbers: [] };
  it('vollständiger Bericht ohne Befund', () => expect(checkReport(base, cfg, d('2026-10-01T11:00:00Z'))).toEqual([]));
  it('Pflichtfelder und fehlende Einsatznummer sind Fehler', () => {
    const f = checkReport({ ...base, type: 'ARREST', title: 'x', body: '' }, cfg);
    expect(f.filter((x) => x.level === 'ERROR').map((x) => x.code).sort()).toEqual(['report.body_missing', 'report.incident_missing', 'report.title']);
    expect(f.every((x) => x.hint.length > 10 && x.field)).toBe(true);
  });
  it('ungültige Verknüpfung, unbekannte Nummer, Platzhalter, widersprüchliche Zeiten', () => {
    const f = checkReport({ ...base, incidentId: 'abc', incident: null, unknownNumbers: ['E-2026-00099'], body: `${'x'.repeat(100)} TODO von 14:30 bis 13:10` }, cfg);
    expect(f.map((x) => x.code)).toEqual(expect.arrayContaining(['report.incident_invalid', 'report.unknown_number', 'report.placeholder', 'report.time_span']));
  });
  it('über Mitternacht ist kein Widerspruch', () => {
    expect(contradictoryTimeSpans('23:40 – 00:20')).toEqual([]);
    expect(contradictoryTimeSpans('14:30-13:10')).toEqual(['14:30-13:10']);
  });
  it('Einsatznummern im Text', () => expect(incidentNumbersIn('siehe E-2026-00421 und E-2026-00421, I-2025-123')).toEqual(['E-2026-00421', 'I-2025-123']));
  it('liegen gebliebener Entwurf', () => expect(checkReport({ ...base, status: 'DRAFT' }, cfg, d('2026-10-05T10:00:00Z')).map((x) => x.code)).toContain('report.stale_draft'));
});

describe('Qualitätsprüfer: Fahndungen und Einsätze', () => {
  const w = { reason: 'Raub', description: 'Groß, schwarze Jacke, zuletzt Postal 210 gesehen', priority: 'HIGH', status: 'ACTIVE', createdAt: d('2026-10-01T00:00:00Z'), expiresAt: null, personId: 'p', vehicleId: null, person: { robloxUserId: '123' }, vehicle: null };
  it('vollständige Fahndung ohne Befund', () => expect(checkWanted(w, cfg, d('2026-10-02T00:00:00Z'))).toEqual([]));
  it('unvollständige Beschreibung und widersprüchliches Ablaufdatum', () => {
    const f = checkWanted({ ...w, description: 'groß', expiresAt: d('2026-09-01T00:00:00Z'), person: { robloxUserId: null } }, cfg);
    expect(f.map((x) => x.code).sort()).toEqual(['wanted.description_short', 'wanted.expiry_before_start', 'wanted.no_roblox_id']);
  });
  it('ohne Gesuchten ist ein Fehler', () => expect(checkWanted({ ...w, personId: null, person: null }, cfg).map((x) => x.code)).toContain('wanted.subject_missing'));
  const i = { number: 'E-2026-00001', title: 'Raub', description: 'Täter flüchtig', location: 'Postal 210', type: 'ROBBERY', priority: 'HIGH', status: 'CLOSED', closed: true, createdAt: d('2026-10-01T10:00:00Z'), updatedAt: d('2026-10-01T11:00:00Z'), closedAt: d('2026-10-01T11:00:00Z'), mapX: null, mapZ: null, unitsEver: 1, reports: 1 };
  it('abgeschlossener Einsatz vollständig', () => expect(checkIncident(i, cfg)).toEqual([]));
  it('fehlender Ort ist bei Abschluss ein Fehler, Zeitwiderspruch wird erkannt', () => {
    const f = checkIncident({ ...i, location: null, closedAt: d('2026-10-01T09:00:00Z'), unitsEver: 0, reports: 0 }, qualityConfigSchema.parse({ incidentReportRequired: 'ERROR' }));
    expect(f.filter((x) => x.level === 'ERROR').map((x) => x.code).sort()).toEqual(['incident.closed_before_created', 'incident.location', 'incident.report_missing']);
  });
  it('Ausnahmen blockieren nicht mehr, bleiben aber sichtbar', () => {
    const f = checkIncident({ ...i, location: null }, cfg);
    const s = splitFindings(f, [{ code: 'incident.location', reason: 'Ort unbekannt' }]);
    expect(s.ok).toBe(true);
    expect(s.excepted).toHaveLength(1);
  });
});

describe('Prognose', () => {
  it('Besetzung je Stunde und Fenster mit geringer Besetzung', () => {
    const from = d('2026-10-05T00:00:00+02:00'), to = d('2026-10-12T00:00:00+02:00');
    const spans = [{ start: d('2026-10-05T18:00:00+02:00'), end: d('2026-10-05T20:00:00+02:00') }, { start: d('2026-10-05T18:00:00+02:00'), end: d('2026-10-05T19:00:00+02:00') }];
    const { avg } = staffingHeatmap(spans, from, to);
    expect(avg[0]![18]).toBe(2);
    expect(avg[0]![19]).toBe(1);
    expect(avg[0]![3]).toBe(0);
    const low = lowStaffingWindows(avg, 1);
    expect(low[0]).toMatchObject({ day: 'Montag', from: 0, to: 18 });
  });
  it('Schätzung braucht mindestens 3 Werte und wird nie negativ', () => {
    expect(estimateNext([1, 2])).toBeNull();
    expect(estimateNext([10, 5, 1], 3)!.every((x) => x.value >= 0)).toBe(true);
    expect(estimateNext([2, 4, 6, 8], 1)![0]!.value).toBeGreaterThan(6);
  });
  it('Aussagekraft und Auffälligkeiten', () => {
    expect(confidenceFor(0, 0).level).toBe('NONE');
    expect(confidenceFor(2, 50).level).toBe('LOW');
    expect(confidenceFor(8, 300).level).toBe('HIGH');
    expect(anomalies([5, 6, 5, 6, 30].map((value, i) => ({ label: `W${i}`, value })))).toEqual([{ label: 'W4', value: 30, expected: 5.5, direction: 'up' }]);
    expect(anomalies([3, 3, 3, 3, 20, 3].map((value, i) => ({ label: `W${i}`, value })))[0]).toMatchObject({ label: 'W4', direction: 'up' });
    expect(anomalies([3, 3, 3, 3, 3].map((value, i) => ({ label: `W${i}`, value })))).toEqual([]);
  });
});

describe('Prüfungszentrum', () => {
  const q = (id: string, topic: string | null, difficulty = 'MEDIUM', extra: Record<string, unknown> = {}) => questionSchema.parse({ id, type: 'SINGLE', text: id, options: ['a', 'b'], correct: ['0'], topic, difficulty, ...extra });
  it('Ziehregeln nach Thema/Schwierigkeit, schwache Themen bevorzugt, keine Doppelten', () => {
    const all = [q('1', 'Festnahme'), q('2', 'Festnahme', 'HARD'), q('3', 'Verkehrskontrolle'), q('4', 'Recht'), q('5', 'Recht')];
    const r = drawQuestions(all, [{ topic: 'Festnahme', difficulty: null, count: 1 }, { topic: null, difficulty: null, count: 2 }], ['Recht'], () => 0);
    expect(r.questions).toHaveLength(3);
    expect(new Set(r.questions.map((x) => x.id)).size).toBe(3);
    expect(r.questions.filter((x) => x.topic === 'Recht')).toHaveLength(2);
    expect(drawQuestions(all, [{ topic: 'Festnahme', difficulty: 'EASY', count: 2 }], [], () => 0).missing).toBe(2);
  });
  it('schwache Themen und Kriterienkatalog', () => {
    const all = [q('1', 'Festnahme'), q('2', 'Recht')];
    expect(weakTopicsOf(all, { 1: 1, 2: 0 }, 70)).toEqual(['Recht']);
    const c = questionSchema.parse({ id: 'c', type: 'CASE', text: 'Fall', points: 5, rubric: [{ id: 'a', label: 'A', points: 3 }, { id: 'b', label: 'B', points: 3 }] });
    expect(gradeAnswer(c, 'Antwort')).toBeNull();
    expect(rubricScore(c, { a: 3, b: 3 })).toBe(5);
    expect(rubricScore(c, { a: 9 })).toBe(3);
  });
  it('Verkehrsunfall und Leitstellenübung werden abgelehnt', () => {
    expect(isRemovedExamTask('Leitstellenübung')).toBe(true);
    expect(isRemovedExamTask('Verkehrsunfall aufnehmen')).toBe(true);
    expect(isRemovedExamTask('Verkehrskontrolle')).toBe(false);
    const e = examSchema.parse({ title: 'Prüfung', category: 'Verkehrsunfall', questions: [q('1', 'Leitstellen-Übung')] });
    expect(examProblems(e).join(' ')).toMatch(/entfernt/);
  });
});

describe('Rechte und Vorgänge', () => {
  it('neue Rechte im Katalog und einem Modul zugeordnet', () => {
    for (const p of ['situation.view', 'situation.create', 'career.view', 'cases.view', 'cases.manage', 'quality.view', 'quality.exception', 'quality.manage', 'forecast.view', 'integrations.view', 'integrations.manage', 'backups.view', 'backups.manage', 'backups.restore']) expect(ALL_PERMISSIONS).toContain(p);
    expect(moduleOfPermission('cases.manage')).toBe('reports');
    expect(moduleOfPermission('forecast.view')).toBe('personnel');
    expect(moduleOfPermission('backups.restore')).toBe('core');
  });
  it('Titelähnlichkeit nur als Vorschlag', () => {
    expect(titleSimilarity('Raub Tankstelle Postal 210', 'Raub an der Tankstelle')).toBeGreaterThan(0.3);
    expect(titleSimilarity('Raub', 'Verkehrskontrolle')).toBe(0);
  });
});
