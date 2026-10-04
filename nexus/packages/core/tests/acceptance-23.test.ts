import type { AnswerMap, Question } from '@nexus/types';
import {
  addQuestion,
  checkQuestionsForPublish,
  moveQuestion,
  updateQuestion,
} from '@nexus/validation';
import { describe, expect, it } from 'vitest';
import {
  areRequiredQuestionsAnswered,
  computeVisibleQuestions,
  findNextVisibleQuestionIndex,
  validateAnswer,
} from '../src/index.js';

/**
 * Abnahme Phase 8: Eine Bewerbung mit 23 unterschiedlichen Fragen aus allen Basistypen wird mit dem
 * Builder aufgebaut, veröffentlichungsfähig geprüft und mit der Antwort-Logik des Bots durchlaufen.
 */
const opt = (label: string) => ({
  id: label.toLowerCase(),
  label,
  value: label.toLowerCase(),
  enabled: true,
});

const defs: Record<string, unknown>[] = [
  { id: 'info', type: 'INFO', title: 'Willkommen zur Bewerbung' },
  {
    id: 'rpname',
    type: 'TEXT',
    title: 'RP-Name',
    required: true,
    validation: { minLength: 3, maxLength: 40, pattern: '^[a-zäöüß ]+$' },
  },
  { id: 'discord', type: 'USERNAME', title: 'Discord-Name', required: true },
  {
    id: 'alter',
    type: 'NUMBER',
    title: 'Alter',
    required: true,
    validation: { min: 16, max: 99 },
  },
  { id: 'geburt', type: 'DATE', title: 'Geburtsdatum (RP)', required: true },
  { id: 'erfahrung', type: 'YES_NO', title: 'Hast du RP-Erfahrung?', required: true },
  {
    id: 'erfahrung-wo',
    type: 'LONG_TEXT',
    title: 'Wo und wie lange?',
    required: true,
    validation: { minLength: 20, maxLength: 1500 },
    visibleIf: { type: 'leaf', questionId: 'erfahrung', operator: 'equals', value: 'true' },
  },
  {
    id: 'abteilung',
    type: 'SINGLE_SELECT',
    title: 'Wunsch-Abteilung',
    required: true,
    options: ['Streife', 'Leitstelle', 'SEK', 'Verkehr'].map(opt),
  },
  {
    id: 'sek-grund',
    type: 'LONG_TEXT',
    title: 'Warum SEK?',
    required: true,
    visibleIf: { type: 'leaf', questionId: 'abteilung', operator: 'equals', value: 'sek' },
  },
  {
    id: 'faehigkeiten',
    type: 'MULTI_SELECT',
    title: 'Fähigkeiten',
    required: false,
    options: ['Funk', 'Verhandlung', 'Erste Hilfe', 'Fahrtraining'].map(opt),
    validation: { minSelections: 1, maxSelections: 3 },
  },
  { id: 'verfuegbar', type: 'TIME', title: 'Ab wann bist du abends online?' },
  { id: 'start', type: 'DATETIME', title: 'Wunsch-Starttermin' },
  {
    id: 'motivation',
    type: 'LONG_TEXT',
    title: 'Warum möchtest du zur Polizei?',
    required: true,
    validation: { minLength: 50, maxLength: 2000 },
  },
  {
    id: 'stunden',
    type: 'DECIMAL',
    title: 'Stunden pro Woche',
    required: true,
    validation: { min: 1, max: 80 },
  },
  {
    id: 'fahrzeug',
    type: 'SINGLE_SELECT',
    title: 'Eigenes Fahrzeug im RP?',
    options: ['Ja', 'Nein'].map(opt),
  },
  { id: 'regelwerk', type: 'RATING', title: 'Wie gut kennst du das Regelwerk?', required: true },
  {
    id: 'teamarbeit',
    type: 'SLIDER',
    title: 'Teamarbeit vs. Alleingang',
    validation: { min: 1, max: 10 },
  },
  { id: 'lebenslauf', type: 'URL', title: 'Link zu deinem Lebenslauf' },
  { id: 'mail', type: 'EMAIL', title: 'E-Mail für Rückfragen' },
  { id: 'tel', type: 'PHONE', title: 'Telefon (optional)' },
  { id: 'bewerter', type: 'DISCORD_USER', title: 'Wer hat dich geworben?' },
  { id: 'hinweis', type: 'PARAGRAPH', title: 'Bitte antworte ehrlich.' },
  {
    id: 'regeln',
    type: 'CONFIRMATION',
    title: 'Ich habe die Regeln gelesen und akzeptiert',
    required: true,
  },
];

const buildAll = (): Question[] =>
  defs.reduce<Question[]>((list, d) => addQuestion(list, d).list, []);

describe('Abnahme Phase 8 – 23 Fragen', () => {
  const questions = buildAll();

  it('Builder nimmt 23 Fragen an; Reihenfolge lückenlos, alle Basistypen vertreten', () => {
    expect(questions).toHaveLength(23);
    expect(questions.map((q) => q.order)).toEqual(questions.map((_, i) => i));
    const types = new Set<string>(questions.map((q) => q.type));
    for (const t of [
      'TEXT',
      'LONG_TEXT',
      'NUMBER',
      'YES_NO',
      'SINGLE_SELECT',
      'MULTI_SELECT',
      'DATE',
      'RATING',
    ]) {
      expect(types.has(t), t).toBe(true);
    }
  });

  it('ist veröffentlichungsfähig', () => {
    expect(checkQuestionsForPublish(questions)).toEqual([]);
  });

  const valid: Record<string, string> = {
    rpname: 'Max Mustermann',
    discord: 'max_rp',
    alter: '25',
    geburt: '01.02.2000',
    erfahrung: 'Ja',
    'erfahrung-wo': 'Drei Jahre auf mehreren Servern als Streifenbeamter.',
    abteilung: 'Streife',
    faehigkeiten: 'Funk, Erste Hilfe',
    verfuegbar: '18:30',
    start: '01.11.2026 19:00',
    motivation:
      'Ich möchte Verantwortung übernehmen und das Team auf dem Server langfristig unterstützen.',
    stunden: '12,5',
    fahrzeug: 'Nein',
    regelwerk: '4',
    teamarbeit: '7',
    lebenslauf: 'https://example.com/cv',
    mail: 'Max@Example.com',
    tel: '+49 171 1234567',
    bewerter: '<@123456789012345678>',
    regeln: 'ja',
  };

  it('durchläuft die DM-Logik: jede sichtbare Frage nimmt eine gültige Antwort an', () => {
    const answers: AnswerMap = {};
    let asked = 0;
    let id: string | undefined;
    for (;;) {
      const idx = findNextVisibleQuestionIndex(questions, answers, id);
      if (idx === -1) break;
      const q = computeVisibleQuestions(questions, answers)[idx]!;
      id = q.id;
      asked++;
      if (q.type === 'INFO' || q.type === 'PARAGRAPH') continue;
      const r = validateAnswer(q, valid[q.id] ?? '');
      expect(r.errors, q.id).toEqual([]);
      expect(r.ok, q.id).toBe(true);
      answers[q.id] = r.value;
    }
    // „SEK“ wurde nicht gewählt → 22 von 23 Fragen gestellt (SEK-Frage übersprungen)
    expect(asked).toBe(22);
    expect(answers['alter']).toBe(25);
    expect(answers['geburt']).toBe('2000-02-01');
    expect(answers['stunden']).toBe(12.5);
    expect(answers['faehigkeiten']).toEqual(['funk', 'erste hilfe']);
    expect(answers['mail']).toBe('max@example.com');
    expect(areRequiredQuestionsAnswered(questions, answers).complete).toBe(true);
  });

  it('Verzweigung: SEK blendet die Zusatzfrage ein, „Nein“ bei Erfahrung blendet das Detail aus', () => {
    const ids = (a: AnswerMap) => computeVisibleQuestions(questions, a).map((q) => q.id);
    expect(ids({ abteilung: 'sek', erfahrung: true })).toContain('sek-grund');
    expect(ids({ abteilung: 'streife', erfahrung: true })).not.toContain('sek-grund');
    expect(ids({ erfahrung: false })).not.toContain('erfahrung-wo');
  });

  it('lehnt ungültige Antworten pro Typ ab', () => {
    const q = (id: string) => questions.find((x) => x.id === id)!;
    expect(validateAnswer(q('alter'), '12').ok).toBe(false);
    expect(validateAnswer(q('alter'), 'abc').ok).toBe(false);
    expect(validateAnswer(q('geburt'), '31.02.2000').ok).toBe(false);
    expect(validateAnswer(q('erfahrung'), 'vielleicht').ok).toBe(false);
    expect(validateAnswer(q('abteilung'), 'Feuerwehr').ok).toBe(false);
    expect(
      validateAnswer(q('faehigkeiten'), 'Funk, Verhandlung, Erste Hilfe, Fahrtraining').ok,
    ).toBe(false);
    expect(validateAnswer(q('regelwerk'), '9').ok).toBe(false);
    expect(validateAnswer(q('rpname'), 'X1').ok).toBe(false);
    expect(validateAnswer(q('motivation'), 'zu kurz').ok).toBe(false);
    expect(validateAnswer(q('mail'), 'kein-mail').ok).toBe(false);
    expect(validateAnswer(q('rpname'), '').errors[0]).toMatch(/verpflichtend/);
    expect(validateAnswer(q('tel'), '').ok).toBe(true); // optional
  });

  it('deaktivierte Fragen werden nicht gestellt, aktivieren stellt sie wieder', () => {
    const phone = { type: 'PHONE', title: 'Telefon (optional)' };
    const off = updateQuestion(questions, 'tel', { ...phone, enabled: false }).list;
    expect(computeVisibleQuestions(off, {}).some((x) => x.id === 'tel')).toBe(false);
    expect(computeVisibleQuestions(off, {})).toHaveLength(
      computeVisibleQuestions(questions, {}).length - 1,
    );
    const on = updateQuestion(off, 'tel', { ...phone, enabled: true }).list;
    expect(computeVisibleQuestions(on, {}).some((x) => x.id === 'tel')).toBe(true);
  });

  it('Verschieben ändert die Reihenfolge des Flows', () => {
    const moved = moveQuestion(questions, 'regeln', 1).list;
    expect(computeVisibleQuestions(moved, {})[1]?.id).toBe('regeln');
  });
});
