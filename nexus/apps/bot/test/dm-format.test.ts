import type { Question } from '@nexus/types';
import { describe, expect, it } from 'vitest';
import {
  chunkLines,
  formatAnswer,
  formatInfoMessage,
  formatQuestionMessage,
  formatSummary,
  questionHint,
} from '../src/applications/dm-format.js';

const q = (o: Partial<Question> & { type: Question['type'] }): Question =>
  ({ id: 'q', title: 'Titel', required: false, order: 0, ...o }) as Question;
const opt = (label: string, description?: string) => ({
  id: label,
  label,
  value: label.toLowerCase(),
  enabled: true,
  ...(description ? { description } : {}),
});

describe('Frage-Nachrichten', () => {
  it('zeigt Pflicht/optional, Frage n von m und die Beschreibung', () => {
    const text = formatQuestionMessage({
      applicationName: 'Polizei',
      question: q({ type: 'TEXT', required: true, description: 'Dein Name im RP' }),
      number: 2,
      total: 20,
    });
    expect(text).toContain('Frage 2 von 20');
    expect(text).toContain('**Titel**');
    expect(text).toContain('Dein Name im RP');
    expect(text).toContain('Pflichtfrage');
    expect(
      formatQuestionMessage({
        applicationName: 'P',
        question: q({ type: 'TEXT' }),
        number: 1,
        total: 1,
      }),
    ).toContain('überspringen');
  });

  it('Optionen werden nummeriert mit Beschreibung angezeigt', () => {
    const h = questionHint(
      q({ type: 'SINGLE_SELECT', options: [opt('Streife', 'Außendienst'), opt('SEK')] }),
    ).join('\n');
    expect(h).toContain('**1.** Streife – Außendienst');
    expect(h).toContain('**2.** SEK');
    expect(h).toContain('Nummer oder dem Namen');
    const multi = questionHint(
      q({
        type: 'MULTI_SELECT',
        options: [opt('A'), opt('B')],
        validation: { minSelections: 1, maxSelections: 2 },
      }),
    ).join('\n');
    expect(multi).toContain('mind. 1, max. 2');
  });

  it('Formathinweise je Typ', () => {
    const hint = (t: Question['type'], v?: Question['validation']) =>
      questionHint(q({ type: t, ...(v ? { validation: v } : {}) })).join(' ');
    expect(hint('DATE')).toContain('TT.MM.JJJJ');
    expect(hint('TIME')).toContain('HH:mm');
    expect(hint('NUMBER', { min: 16, max: 99 })).toContain('16 bis 99');
    expect(hint('RATING')).toContain('1 bis 5');
    expect(hint('YES_NO')).toContain('Ja');
    expect(hint('LONG_TEXT', { minLength: 50 })).toContain('mind. 50');
  });

  it('bleibt auch mit riesigen Texten unter dem Discord-Limit', () => {
    const big = q({
      type: 'LONG_TEXT',
      title: 'T'.repeat(200),
      description: 'x'.repeat(2000),
      options: undefined,
    });
    const text = formatQuestionMessage({
      applicationName: 'P',
      question: big,
      number: 1,
      total: 1,
      expiresAt: new Date(),
    });
    expect(text.length).toBeLessThanOrEqual(2000);
    const manyOptions = q({
      type: 'SINGLE_SELECT',
      description: 'y'.repeat(1900),
      options: Array.from({ length: 25 }, (_, i) => opt(`Option ${i}`, 'z'.repeat(80))),
    });
    expect(
      formatQuestionMessage({ applicationName: 'P', question: manyOptions, number: 1, total: 1 })
        .length,
    ).toBeLessThanOrEqual(2000);
  });

  it('Anzeige-Elemente und Antworten formatieren', () => {
    expect(
      formatInfoMessage(q({ type: 'INFO', title: 'Hinweis', description: 'Lies das' })),
    ).toContain('Lies das');
    const sel = q({ type: 'SINGLE_SELECT', options: [opt('Streife')] });
    expect(formatAnswer('streife', sel)).toBe('Streife');
    expect(formatAnswer(['a', 'b'])).toBe('a, b');
    expect(formatAnswer(true)).toBe('Ja');
    expect(formatAnswer(false)).toBe('Nein');
    expect(formatAnswer(null)).toBe('–');
    expect(formatAnswer(undefined)).toBe('–');
  });
});

describe('Zusammenfassung', () => {
  it('nummeriert nur echte Fragen und lässt Anzeige-Elemente aus', () => {
    const lines = formatSummary(
      [
        q({ id: 'a', type: 'INFO', title: 'Info' }),
        q({ id: 'b', type: 'TEXT', title: 'Name' }),
        q({ id: 'c', type: 'NUMBER', title: 'Alter' }),
      ],
      { b: 'Max', c: 25 },
    ).join('\n');
    expect(lines).toContain('**1. Name**');
    expect(lines).toContain('**2. Alter**');
    expect(lines).not.toContain('Info');
    expect(lines).toContain('25');
  });

  it('teilt lange Zusammenfassungen (100 Fragen) in Nachrichten ≤ 1900 Zeichen, ohne Antworten zu verlieren', () => {
    const qs = Array.from({ length: 100 }, (_, i) =>
      q({ id: `q${i}`, type: 'LONG_TEXT', title: `Frage Nummer ${i}`, order: i }),
    );
    const answers = Object.fromEntries(qs.map((x, i) => [x.id, `Antwort-${i} ${'a'.repeat(300)}`]));
    const chunks = formatSummary(qs, answers);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.length <= 1900)).toBe(true);
    const all = chunks.join('\n');
    for (let i = 0; i < 100; i++) expect(all).toContain(`Antwort-${i} `);
  });

  it('chunkLines: kein Verlust, keine überlangen Nachrichten', () => {
    const chunks = chunkLines(['x'.repeat(5000), 'kurz', 'y'.repeat(1800), 'z'], 1900);
    expect(chunks.every((c) => c.length <= 1900)).toBe(true);
    expect(chunks.join('\n')).toContain('kurz');
    expect(chunkLines([])).toEqual(['']);
  });
});
