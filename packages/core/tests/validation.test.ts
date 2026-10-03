import { describe, it, expect } from 'vitest';
import { QuestionType } from '@nexus/types';
import { validateAnswer } from '../src/index.js';
import type { Question } from '@nexus/types';

const make = (type: QuestionType, extra: Partial<Question> = {}): Question => ({
  id: 'q1',
  type,
  title: 'Frage',
  required: true,
  order: 0,
  ...extra,
});

describe('Antwort-Validierung (§10–§12, §18)', () => {
  it('lehnt leere Antworten auf Pflichtfragen ab', () => {
    const result = validateAnswer(make(QuestionType.TEXT), '');
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('verpflichtend');
  });

  it('akzeptiert leere Antworten auf optionale Fragen', () => {
    const result = validateAnswer({ ...make(QuestionType.TEXT), required: false }, '');
    expect(result.ok).toBe(true);
    expect(result.value).toBeNull();
  });

  it('validiert TEXT: minLength/maxLength/pattern', () => {
    const question = make(QuestionType.TEXT, {
      validation: { minLength: 3, maxLength: 10 },
    });
    expect(validateAnswer(question, 'ab').ok).toBe(false);
    expect(validateAnswer(question, 'abc').ok).toBe(true);
    expect(validateAnswer(question, 'abcdefghijk').ok).toBe(false);

    const pattern = make(QuestionType.TEXT, { validation: { pattern: '^[0-9]+$' } });
    expect(validateAnswer(pattern, '123').ok).toBe(true);
    expect(validateAnswer(pattern, 'abc').ok).toBe(false);
  });

  it('normalisiert (trim + autoCase)', () => {
    const question = make(QuestionType.TEXT, { validation: { autoCase: 'upper' } });
    expect(validateAnswer(question, '  max  ').value).toBe('MAX');
  });

  it('validiert NUMBER/DECIMAL', () => {
    expect(validateAnswer(make(QuestionType.NUMBER), '21').value).toBe(21);
    expect(validateAnswer(make(QuestionType.NUMBER), '21.5').ok).toBe(false);
    expect(validateAnswer(make(QuestionType.DECIMAL), '21.5').value).toBe(21.5);
    expect(validateAnswer(make(QuestionType.NUMBER), 'abc').ok).toBe(false);
    expect(validateAnswer(make(QuestionType.NUMBER, { validation: { min: 18 } }), '16').ok).toBe(
      false,
    );
  });

  it('validiert DATUM in mehreren Formaten', () => {
    expect(validateAnswer(make(QuestionType.DATE), '24.09.2026').value).toBe('2026-09-24');
    expect(validateAnswer(make(QuestionType.DATE), '2026-09-24').value).toBe('2026-09-24');
    expect(validateAnswer(make(QuestionType.DATE), '32.13.9999').ok).toBe(false);
  });

  it('validiert TIME und DATETIME', () => {
    expect(validateAnswer(make(QuestionType.TIME), '18:30').value).toBe('18:30');
    expect(validateAnswer(make(QuestionType.TIME), '25:00').ok).toBe(false);
    expect(validateAnswer(make(QuestionType.DATETIME), '24.09.2026 18:30').value).toBe(
      '2026-09-24T18:30:00',
    );
  });

  it('validiert YES_NO (deutsch/englisch)', () => {
    expect(validateAnswer(make(QuestionType.YES_NO), 'Ja').value).toBe(true);
    expect(validateAnswer(make(QuestionType.YES_NO), 'nein').value).toBe(false);
    expect(validateAnswer(make(QuestionType.YES_NO), 'vielleicht').ok).toBe(false);
  });

  it('validiert SINGLE_SELECT gegen Optionen', () => {
    const question = make(QuestionType.SINGLE_SELECT, {
      options: [
        { id: 'o1', label: 'Keine', value: 'keine', enabled: true },
        { id: 'o2', label: 'Viel', value: 'viel', enabled: true },
        { id: 'o3', label: 'Alt', value: 'alt', enabled: false },
      ],
    });
    expect(validateAnswer(question, 'Viel').value).toBe('viel');
    expect(validateAnswer(question, 'viel').value).toBe('viel');
    expect(validateAnswer(question, 'unbekannt').ok).toBe(false);
    expect(validateAnswer(question, 'Alt').ok).toBe(false); // deaktiviert
  });

  it('validiert MULTI_SELECT mit min/max selections', () => {
    const question = make(QuestionType.MULTI_SELECT, {
      validation: { minSelections: 2, maxSelections: 3 },
      options: [
        { id: 'a', label: 'A', value: 'a', enabled: true },
        { id: 'b', label: 'B', value: 'b', enabled: true },
        { id: 'c', label: 'C', value: 'c', enabled: true },
      ],
    });
    expect(validateAnswer(question, 'a, b').value).toEqual(['a', 'b']);
    expect(validateAnswer(question, 'a').ok).toBe(false);
    expect(validateAnswer(question, 'a, b, c, a').ok).toBe(false);
  });

  it('validiert RATING/SLIDER Bereiche', () => {
    expect(validateAnswer(make(QuestionType.RATING), '5').value).toBe(5);
    expect(
      validateAnswer(make(QuestionType.RATING, { validation: { min: 1, max: 5 } }), '6').ok,
    ).toBe(false);
  });

  it('validiert URL und EMAIL', () => {
    expect(validateAnswer(make(QuestionType.URL), 'https://example.com').ok).toBe(true);
    expect(validateAnswer(make(QuestionType.URL), 'keine url').ok).toBe(false);
    expect(validateAnswer(make(QuestionType.EMAIL), 'a@b.de').value).toBe('a@b.de');
    expect(validateAnswer(make(QuestionType.EMAIL), 'a@').ok).toBe(false);
  });

  it('validiert Discord-Snowflake-IDs', () => {
    expect(validateAnswer(make(QuestionType.DISCORD_USER), '<@1105654859799728271>').value).toBe(
      '1105654859799728271',
    );
    expect(validateAnswer(make(QuestionType.DISCORD_ROLE), 'abc').ok).toBe(false);
  });

  it('display-only Fragen speichern keine Antwort', () => {
    expect(validateAnswer(make(QuestionType.PARAGRAPH), 'irgendwas').value).toBeNull();
    expect(validateAnswer(make(QuestionType.SEPARATOR), 'x').value).toBeNull();
  });
});

describe('Auswahl per Nummer (DM-Komfort)', () => {
  const opt = (label: string) => ({ id: label, label, value: label.toLowerCase(), enabled: true });
  const q = (type: 'SINGLE_SELECT' | 'MULTI_SELECT', labels: string[]) =>
    ({ id: 'q', type, title: 'x', required: true, order: 0, options: labels.map(opt) }) as never;
  it('akzeptiert 1-basierte Nummern, Beschriftung und Wert', () => {
    const s = q('SINGLE_SELECT', ['Streife', 'SEK', 'Verkehr']);
    expect(validateAnswer(s, '2')).toMatchObject({ ok: true, value: 'sek' });
    expect(validateAnswer(s, 'verkehr')).toMatchObject({ ok: true, value: 'verkehr' });
    expect(validateAnswer(s, '4').ok).toBe(false);
    expect(validateAnswer(s, '0').ok).toBe(false);
  });
  it('Beschriftung hat Vorrang vor der Nummer (Option „2“)', () => {
    const s = q('SINGLE_SELECT', ['1', '2', '3']);
    expect(validateAnswer(s, '2')).toMatchObject({ ok: true, value: '2' });
  });
  it('Mehrfachauswahl mit Nummern', () => {
    const s = q('MULTI_SELECT', ['Funk', 'Erste Hilfe', 'Fahrtraining']);
    expect(validateAnswer(s, '1, 3')).toMatchObject({ ok: true, value: ['funk', 'fahrtraining'] });
    expect(validateAnswer(s, '1, 9').ok).toBe(false);
  });
});
