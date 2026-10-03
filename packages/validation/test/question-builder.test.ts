import type { Question } from '@nexus/types';
import { describe, expect, it } from 'vitest';
import {
  QuestionBuilderError,
  addQuestion,
  checkConditions,
  checkQuestionsForPublish,
  dependentsOf,
  moveQuestion,
  removeQuestion,
  updateQuestion,
} from '../src/question-builder.js';

const text = (title: string, extra: Record<string, unknown> = {}) => ({
  type: 'TEXT',
  title,
  ...extra,
});
const build = (...titles: string[]) =>
  titles.reduce<Question[]>(
    (list, t, i) => addQuestion(list, text(t, { id: `q${i + 1}` })).list,
    [],
  );
const err = (fn: () => unknown): QuestionBuilderError => {
  try {
    fn();
  } catch (e) {
    return e as QuestionBuilderError;
  }
  throw new Error('kein Fehler');
};
const ids = (l: Question[]) => l.map((q) => q.id);
const opt = (label: string, value = label.toLowerCase()) => ({
  id: label,
  label,
  value,
  enabled: true,
});
const cond = (questionId: string) => ({
  type: 'leaf',
  questionId,
  operator: 'equals',
  value: 'true',
});

describe('addQuestion', () => {
  it('hängt an, nummeriert lückenlos, erzeugt IDs und Standardwerte', () => {
    const { list, question } = addQuestion([], { type: 'TEXT', title: ' Name ' });
    expect(question).toMatchObject({
      id: 'frage-1',
      title: 'Name',
      order: 0,
      required: false,
      enabled: true,
    });
    expect(addQuestion(list, text('B')).list.map((q) => q.order)).toEqual([0, 1]);
  });

  it('fügt an einer Position ein', () => {
    const { list } = addQuestion(build('A', 'B'), text('X', { id: 'x1' }), 1);
    expect(ids(list)).toEqual(['q1', 'x1', 'q2']);
    expect(list.map((q) => q.order)).toEqual([0, 1, 2]);
  });

  it('lehnt doppelte IDs, ungültige Typen, leere Titel und Überlänge ab', () => {
    expect(err(() => addQuestion(build('A'), text('B', { id: 'q1' }))).code).toBe('conflict');
    expect(err(() => addQuestion([], { type: 'FILE', title: 'x' })).code).toBe('invalid');
    expect(err(() => addQuestion([], text('  '))).code).toBe('invalid');
    expect(err(() => addQuestion([], text('x'.repeat(201)))).code).toBe('invalid');
    expect(err(() => addQuestion([], text('x', { id: 'Ungültig!' }))).code).toBe('invalid');
  });

  it('erzwingt das Limit von 100 Fragen', () => {
    let list: Question[] = [];
    for (let i = 0; i < 100; i++) list = addQuestion(list, text(`F${i}`)).list;
    expect(err(() => addQuestion(list, text('zu viel'))).code).toBe('limit');
  });

  it('Auswahlfragen brauchen aktive, eindeutige Optionen', () => {
    expect(err(() => addQuestion([], { type: 'SINGLE_SELECT', title: 's' })).details?.[0]).toMatch(
      /Option/,
    );
    expect(
      err(() =>
        addQuestion([], { type: 'SINGLE_SELECT', title: 's', options: [opt('A'), opt('a', 'x')] }),
      ).details?.[0],
    ).toMatch(/eindeutig/);
    expect(
      addQuestion([], {
        type: 'MULTI_SELECT',
        title: 's',
        options: [opt('A'), opt('B')],
        validation: { minSelections: 1, maxSelections: 2 },
      }).list,
    ).toHaveLength(1);
    expect(
      err(() =>
        addQuestion([], {
          type: 'MULTI_SELECT',
          title: 's',
          options: [opt('A')],
          validation: { minSelections: 2 },
        }),
      ).details?.[0],
    ).toMatch(/Mindestanzahl/);
    expect(
      err(() => addQuestion([], { type: 'TEXT', title: 's', options: [opt('A')] })).details?.[0],
    ).toMatch(/Nur Auswahlfragen/);
  });

  it('prüft Grenzwerte, Muster und Anzeige-Elemente', () => {
    const first = (input: unknown) => err(() => addQuestion([], input)).details?.[0];
    expect(first(text('t', { validation: { minLength: 10, maxLength: 5 } }))).toMatch(
      /Mindestlänge/,
    );
    expect(first({ type: 'NUMBER', title: 'n', validation: { min: 5, max: 1 } })).toMatch(
      /Minimum/,
    );
    expect(first({ type: 'RATING', title: 'r', validation: { max: 11 } })).toMatch(/Bewertung/);
    expect(first(text('t', { validation: { pattern: '(' } }))).toMatch(/ungültig/);
    expect(first(text('t', { validation: { pattern: '(a+)+$' } }))).toMatch(/komplex/);
    expect(first({ type: 'NUMBER', title: 'n', validation: { pattern: '^a$' } })).toMatch(
      /Textfragen/,
    );
    expect(first({ type: 'INFO', title: 'i', required: true })).toMatch(/Anzeige/);
  });
});

describe('updateQuestion – bearbeiten, Pflicht/optional, aktiv/inaktiv', () => {
  it('ändert Titel, Pflicht und Aktivierung, behält ID und Position', () => {
    const list = build('A', 'B', 'C');
    const { list: next, question } = updateQuestion(
      list,
      'q2',
      text('B2', { required: true, enabled: false }),
    );
    expect(question).toMatchObject({
      id: 'q2',
      title: 'B2',
      required: true,
      enabled: false,
      order: 1,
    });
    expect(ids(next)).toEqual(['q1', 'q2', 'q3']);
  });

  it('unbekannte Frage → not-found; ungültige Änderung ändert nichts', () => {
    const list = build('A');
    expect(err(() => updateQuestion(list, 'nope', text('x'))).code).toBe('not-found');
    expect(err(() => updateQuestion(list, 'q1', text(''))).code).toBe('invalid');
    expect(list[0]?.title).toBe('A');
  });

  it('Typwechsel wird gegen die neue Definition geprüft', () => {
    expect(
      err(() => updateQuestion(build('A'), 'q1', { type: 'SINGLE_SELECT', title: 'A' })).code,
    ).toBe('invalid');
  });
});

describe('moveQuestion', () => {
  it('verschiebt nach oben und unten mit lückenloser Nummerierung', () => {
    const list = build('A', 'B', 'C', 'D');
    expect(ids(moveQuestion(list, 'q4', 0).list)).toEqual(['q4', 'q1', 'q2', 'q3']);
    expect(ids(moveQuestion(list, 'q1', 2).list)).toEqual(['q2', 'q3', 'q1', 'q4']);
    expect(moveQuestion(list, 'q1', 99).list.at(-1)?.id).toBe('q1');
    expect(moveQuestion(list, 'q2', 2).list.map((q) => q.order)).toEqual([0, 1, 2, 3]);
  });

  it('unbekannte Frage → not-found', () => {
    expect(err(() => moveQuestion(build('A'), 'x', 0)).code).toBe('not-found');
  });
});

describe('Bedingungen und Löschen', () => {
  const withDep = () =>
    addQuestion(build('A', 'B'), { type: 'TEXT', title: 'C', id: 'q3', visibleIf: cond('q1') })
      .list;

  it('Bedingungen dürfen nur auf vorherige, existierende Fragen verweisen', () => {
    expect(
      err(() => addQuestion(build('A'), text('B', { id: 'q9', visibleIf: cond('q9') }))).code,
    ).toBe('conflict');
    expect(
      err(() => addQuestion(build('A'), text('B', { id: 'q9', visibleIf: cond('gibt-es-nicht') })))
        .code,
    ).toBe('conflict');
  });

  it('Verschieben vor die Abhängigkeit wird abgelehnt', () => {
    const e = err(() => moveQuestion(withDep(), 'q3', 0));
    expect(e.code).toBe('conflict');
    expect(e.message).toMatch(/davor/);
  });

  it('Löschen einer Frage, von der andere abhängen, wird abgelehnt und nennt die Abhängigen', () => {
    const list = withDep();
    expect(dependentsOf(list, 'q1').map((q) => q.id)).toEqual(['q3']);
    const e = err(() => removeQuestion(list, 'q1'));
    expect(e.code).toBe('conflict');
    expect(e.details?.[0]).toContain('q3');
  });

  it('löscht freie Fragen und nummeriert neu', () => {
    const { list, removed } = removeQuestion(build('A', 'B', 'C'), 'q2');
    expect(removed.id).toBe('q2');
    expect(list.map((q) => [q.id, q.order])).toEqual([
      ['q1', 0],
      ['q3', 1],
    ]);
    expect(err(() => removeQuestion(list, 'q2')).code).toBe('not-found');
  });

  it('checkConditions erkennt Vorwärtsverweise in fertigen Listen', () => {
    const two = build('A', 'B');
    const bad = [{ ...two[0]!, visibleIf: cond('q2') as never }, two[1]!];
    expect(checkConditions(bad)).toHaveLength(1);
  });
});

describe('checkQuestionsForPublish', () => {
  it('verlangt eine aktive echte Frage', () => {
    expect(checkQuestionsForPublish([])).toContain('Mindestens eine aktive Frage wird benötigt.');
    const onlyInfo = addQuestion([], { type: 'INFO', title: 'Hinweis' }).list;
    expect(checkQuestionsForPublish(onlyInfo).join()).toMatch(/echte Frage/);
    const disabled = updateQuestion(build('A'), 'q1', text('A', { enabled: false })).list;
    expect(checkQuestionsForPublish(disabled)).toContain(
      'Mindestens eine aktive Frage wird benötigt.',
    );
  });

  it('meldet aktive Fragen, die von deaktivierten abhängen', () => {
    let list = addQuestion(build('A'), {
      type: 'TEXT',
      title: 'B',
      id: 'q2',
      visibleIf: cond('q1'),
    }).list;
    expect(checkQuestionsForPublish(list)).toEqual([]);
    list = updateQuestion(list, 'q1', text('A', { enabled: false })).list;
    expect(checkQuestionsForPublish(list).join()).toMatch(/deaktivierten/);
  });

  it('gültige Liste → keine Fehler', () => {
    expect(checkQuestionsForPublish(build('A', 'B'))).toEqual([]);
  });
});
