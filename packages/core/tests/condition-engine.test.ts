import { describe, it, expect } from 'vitest';
import { ConditionCombinator, ConditionOperator } from '@nexus/types';
import {
  evaluateCondition,
  resolveFromMap,
  collectConditionQuestionIds,
  type AnswerResolver,
} from '../src/index.js';

const leaf = (questionId: string, operator: ConditionOperator, value?: string | string[]) => ({
  type: 'leaf' as const,
  questionId,
  operator,
  value,
});

const group = (combinator: ConditionCombinator, children: unknown[]) => ({
  type: 'group' as const,
  combinator,
  children,
});

const withAnswers = (answers: Record<string, unknown>): AnswerResolver =>
  resolveFromMap(answers as never);

describe('Condition Engine – Operatoren (§13)', () => {
  it('equals / not_equals (case-insensitive)', () => {
    expect(evaluateCondition(leaf('q1', 'equals', 'ja'), withAnswers({ q1: 'Ja' }))).toBe(true);
    expect(evaluateCondition(leaf('q1', 'equals', 'ja'), withAnswers({ q1: 'nein' }))).toBe(false);
    expect(evaluateCondition(leaf('q1', 'not_equals', 'ja'), withAnswers({ q1: 'NeIN' }))).toBe(
      true,
    );
  });

  it('contains / not_contains / starts_with / ends_with', () => {
    expect(
      evaluateCondition(
        leaf('q1', 'contains', 'polizei'),
        withAnswers({ q1: 'Ich will zur Polizei' }),
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        leaf('q1', 'not_contains', 'polizei'),
        withAnswers({ q1: 'Ich will zur Feuerwehr' }),
      ),
    ).toBe(true);
    expect(
      evaluateCondition(leaf('q1', 'starts_with', 'max'), withAnswers({ q1: 'MaxMustermann' })),
    ).toBe(true);
    expect(
      evaluateCondition(leaf('q1', 'ends_with', 'mann'), withAnswers({ q1: 'MaxMustermann' })),
    ).toBe(true);
  });

  it('numerische Vergleiche', () => {
    expect(evaluateCondition(leaf('q1', 'greater_than', '17'), withAnswers({ q1: '21' }))).toBe(
      true,
    );
    expect(evaluateCondition(leaf('q1', 'less_than', '18'), withAnswers({ q1: '21' }))).toBe(false);
    expect(evaluateCondition(leaf('q1', 'greater_or_equal', '21'), withAnswers({ q1: 21 }))).toBe(
      true,
    );
    expect(evaluateCondition(leaf('q1', 'less_or_equal', '20'), withAnswers({ q1: '21' }))).toBe(
      false,
    );
    expect(evaluateCondition(leaf('q1', 'greater_than', '10'), withAnswers({ q1: 'abc' }))).toBe(
      false,
    );
  });

  it('is_empty / is_not_empty', () => {
    expect(evaluateCondition(leaf('q1', 'is_empty'), withAnswers({}))).toBe(true);
    expect(evaluateCondition(leaf('q1', 'is_empty'), withAnswers({ q1: '' }))).toBe(true);
    expect(evaluateCondition(leaf('q1', 'is_empty'), withAnswers({ q1: 'text' }))).toBe(false);
    expect(evaluateCondition(leaf('q1', 'is_not_empty'), withAnswers({ q1: 'text' }))).toBe(true);
  });

  it('in / not_in', () => {
    expect(evaluateCondition(leaf('q1', 'in', ['a', 'b']), withAnswers({ q1: 'b' }))).toBe(true);
    expect(evaluateCondition(leaf('q1', 'in', ['a', 'b']), withAnswers({ q1: 'c' }))).toBe(false);
    expect(evaluateCondition(leaf('q1', 'not_in', ['a', 'b']), withAnswers({ q1: 'c' }))).toBe(
      true,
    );
  });

  it('Array-Antworten (Multi-Select): equals bedeutet enthalten', () => {
    expect(evaluateCondition(leaf('q1', 'equals', 'b'), withAnswers({ q1: ['a', 'b'] }))).toBe(
      true,
    );
    expect(evaluateCondition(leaf('q1', 'contains', 'b'), withAnswers({ q1: ['a', 'b'] }))).toBe(
      true,
    );
  });

  it('vergleicht boolesche Antworten (YES_NO) mit ja/nein', () => {
    expect(evaluateCondition(leaf('q1', 'equals', 'ja'), withAnswers({ q1: true }))).toBe(true);
    expect(evaluateCondition(leaf('q1', 'equals', 'nein'), withAnswers({ q1: true }))).toBe(false);
    expect(evaluateCondition(leaf('q1', 'equals', 'nein'), withAnswers({ q1: false }))).toBe(true);
  });
});

describe('Condition Engine – Logik (§13)', () => {
  it('AND: alle erfüllt', () => {
    const node = group('AND', [leaf('q1', 'equals', 'ja'), leaf('q2', 'greater_than', '17')]);
    expect(evaluateCondition(node, withAnswers({ q1: 'ja', q2: '21' }))).toBe(true);
    expect(evaluateCondition(node, withAnswers({ q1: 'ja', q2: '16' }))).toBe(false);
  });

  it('OR: mindestens eine', () => {
    const node = group('OR', [leaf('q1', 'equals', 'ja'), leaf('q2', 'equals', 'ja')]);
    expect(evaluateCondition(node, withAnswers({ q1: 'nein', q2: 'ja' }))).toBe(true);
    expect(evaluateCondition(node, withAnswers({ q1: 'nein', q2: 'nein' }))).toBe(false);
  });

  it('NOT: Negation', () => {
    const node = group('NOT', [leaf('q1', 'equals', 'ja')]);
    expect(evaluateCondition(node, withAnswers({ q1: 'nein' }))).toBe(true);
    expect(evaluateCondition(node, withAnswers({ q1: 'ja' }))).toBe(false);
  });

  it('verschachtelte Gruppen', () => {
    const node = group('AND', [
      leaf('q1', 'equals', 'ja'),
      group('OR', [leaf('q2', 'greater_than', '17'), leaf('q3', 'equals', 'ja')]),
    ]);
    expect(evaluateCondition(node, withAnswers({ q1: 'ja', q2: '16', q3: 'ja' }))).toBe(true);
    expect(evaluateCondition(node, withAnswers({ q1: 'ja', q2: '16', q3: 'nein' }))).toBe(false);
  });

  it('undefined Condition ist true', () => {
    expect(evaluateCondition(undefined, withAnswers({}))).toBe(true);
  });

  it('sammelt referenzierte Frage-IDs', () => {
    const node = group('AND', [leaf('a', 'equals', '1'), group('OR', [leaf('b', 'equals', '2')])]);
    expect([...collectConditionQuestionIds(node)].sort()).toEqual(['a', 'b']);
  });
});
