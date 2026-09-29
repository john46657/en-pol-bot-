import type { AnswerMap, Question } from '@nexus/types';
import { evaluateCondition } from './condition-engine.js';

/**
 * Branching (§14): Ermittelt, welche Fragen für einen Bewerber sichtbar sind.
 *
 * Bedingungen werden in Frage-Reihenfolge evaluiert und sehen nur Antworten
 * vorheriger Fragen. Nicht relevante Fragen werden übersprungen, die Submission
 * behält aber ihre vollständige Struktur (§14).
 */

export function sortQuestions(questions: Question[]): Question[] {
  return [...questions].sort((a, b) => a.order - b.order);
}

/**
 * Sichtbare Fragen (in Reihenfolge). Liefert nur Fragen, die
 *   a) eine Chance hatten, beantwortet zu werden (vorherige Fragen sichtbar),
 *   b) deren visibleIf-Bedingung mit den gegebenen Antworten erfüllt ist.
 */
export function computeVisibleQuestions(questions: Question[], answers: AnswerMap): Question[] {
  const sorted = sortQuestions(questions);
  const visible: Question[] = [];

  for (const question of sorted) {
    // Optional configuration. `visibleIf === undefined` ⇒ immer sichtbar.
    if (question.visibleIf && !evaluateCondition(question.visibleIf, (id) => answers[id])) {
      continue;
    }
    visible.push(question);
  }

  return visible;
}

/**
 * Index der nächsten sichtbaren Frage nach `currentQuestionId`.
 * Liefert -1, wenn keine weitere Frage folgt → Summary (§23).
 */
export function findNextVisibleQuestionIndex(
  questions: Question[],
  answers: AnswerMap,
  currentQuestionId: string | undefined,
): number {
  const visible = computeVisibleQuestions(questions, answers);
  if (!currentQuestionId) return 0;

  const currentIndex = visible.findIndex((q) => q.id === currentQuestionId);
  if (currentIndex === -1) {
    // Aktuelle Frage ist (z. B. nach Condition-Wechsel) nicht mehr sichtbar:
    // nehme die erste Frage, deren order > aktuelle ist.
    const currentOrder = questions.find((q) => q.id === currentQuestionId)?.order ?? -1;
    const fallback = visible.findIndex((q) => q.order > currentOrder);
    return fallback === -1 ? -1 : fallback;
  }
  const nextIndex = currentIndex + 1;
  return nextIndex >= visible.length ? -1 : nextIndex;
}

export function isLastVisibleQuestion(
  questions: Question[],
  answers: AnswerMap,
  currentQuestionId: string,
): boolean {
  return findNextVisibleQuestionIndex(questions, answers, currentQuestionId) === -1;
}

/**
 * Antworten Questions entfernen, deren Frage aktuell nicht mehr sichtbar ist
 * (§24: Conditions neu auswerten). Wird beim Editieren verwendet.
 */
export function pruneInvisibleAnswers(
  questions: Question[],
  answers: AnswerMap,
): { answers: AnswerMap; prunedQuestionIds: string[] } {
  const visible = new Set(computeVisibleQuestions(questions, answers).map((q) => q.id));
  const pruned: string[] = [];
  const next: AnswerMap = {};

  for (const [questionId, value] of Object.entries(answers)) {
    if (visible.has(questionId)) {
      next[questionId] = value;
    } else {
      pruned.push(questionId);
    }
  }

  return { answers: next, prunedQuestionIds: pruned };
}

/**
 * Sind alle sichtbaren, Pflicht-Fragen beantwortet? (Voraussetzung §23.)
 */
export function areRequiredQuestionsAnswered(
  questions: Question[],
  answers: AnswerMap,
): { complete: boolean; missingQuestionIds: string[] } {
  const visible = computeVisibleQuestions(questions, answers);
  const missing = visible.filter((q) => q.required && answers[q.id] === undefined);
  return { complete: missing.length === 0, missingQuestionIds: missing.map((q) => q.id) };
}
