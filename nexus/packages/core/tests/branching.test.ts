import { describe, it, expect } from 'vitest';
import { QuestionType } from '@nexus/types';
import {
  areRequiredQuestionsAnswered,
  computeVisibleQuestions,
  findNextVisibleQuestionIndex,
  isLastVisibleQuestion,
  pruneInvisibleAnswers,
  sortQuestions,
} from '../src/index.js';
import type { Question } from '@nexus/types';

const q = (id: string, order: number, extra: Partial<Question> = {}): Question => ({
  id,
  type: QuestionType.TEXT,
  title: `Frage ${id}`,
  required: false,
  order,
  ...extra,
});

describe('Branching (§14)', () => {
  const questions: Question[] = [
    q('erfahrung', 0, { type: QuestionType.YES_NO }),
    q('server', 1, {
      visibleIf: {
        type: 'leaf',
        questionId: 'erfahrung',
        operator: 'equals',
        value: 'ja',
      },
    }),
    q('motivation', 2),
    q('fraktion_polizei', 3, {
      visibleIf: {
        type: 'leaf',
        questionId: 'fraktion',
        operator: 'equals',
        value: 'polizei',
      },
    }),
    q('fraktion_feuerwehr', 4, {
      visibleIf: {
        type: 'leaf',
        questionId: 'fraktion',
        operator: 'equals',
        value: 'feuerwehr',
      },
    }),
    q('fraktion', 5, { type: QuestionType.SINGLE_SELECT }),
  ];

  it('sortiert nach order', () => {
    const sorted = sortQuestions([...questions].reverse());
    expect(sorted.map((x) => x.id)).toEqual([
      'erfahrung',
      'server',
      'motivation',
      'fraktion_polizei',
      'fraktion_feuerwehr',
      'fraktion',
    ]);
  });

  it('zeigt ohne Antworten alle Fragen ohne Condition', () => {
    const visible = computeVisibleQuestions(questions, {});
    expect(visible.map((x) => x.id).sort()).toEqual(['erfahrung', 'fraktion', 'motivation']);
  });

  it('überspringt irrelevante Fragen (Branching)', () => {
    const visible = computeVisibleQuestions(questions, {
      erfahrung: true,
      fraktion: 'polizei',
    });
    expect(visible.map((x) => x.id).sort()).toEqual([
      'erfahrung',
      'fraktion',
      'fraktion_polizei',
      'motivation',
      'server',
    ]);
  });

  it('verbirgt Feuerwehr-Fragen bei Polizei-Wahl', () => {
    const visible = computeVisibleQuestions(questions, { fraktion: 'polizei' });
    expect(visible.find((x) => x.id === 'fraktion_feuerwehr')).toBeUndefined();
    expect(visible.find((x) => x.id === 'fraktion_polizei')).toBeDefined();
  });

  it('bestimmt die nächste sichtbare Frage', () => {
    const sorted = sortQuestions(questions);
    const idx = findNextVisibleQuestionIndex(sorted, { erfahrung: true }, 'erfahrung');
    expect(sorted[idx]?.id).toBe('server');
  });

  it('erkennt die letzte Frage', () => {
    const sorted = sortQuestions(questions);
    // 'motivation' folgt 'fraktion' (keine Condition) → nicht zuletzt
    expect(isLastVisibleQuestion(sorted, {}, 'motivation')).toBe(false);
    expect(isLastVisibleQuestion(sorted, {}, 'fraktion')).toBe(true);
  });

  it('entfernt Antworten unsichtbar gewordener Fragen (§24)', () => {
    const { answers, prunedQuestionIds } = pruneInvisibleAnswers(questions, {
      erfahrung: true,
      server: 'irgendein server',
      fraktion: 'feuerwehr',
      fraktion_polizei: 'soll weg',
    });
    expect(answers['server']).toBe('irgendein server');
    expect(prunedQuestionIds).toContain('fraktion_polizei');
  });

  it('fordert Pflichtfragen ein', () => {
    const withRequired = [q('a', 0, { required: true }), q('b', 1)];
    expect(areRequiredQuestionsAnswered(withRequired, { b: 'x' }).complete).toBe(false);
    expect(areRequiredQuestionsAnswered(withRequired, { a: 'x', b: 'y' }).complete).toBe(true);
  });
});
