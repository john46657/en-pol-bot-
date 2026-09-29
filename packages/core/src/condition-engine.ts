import type { AnswerValue, ConditionGroup, ConditionLeaf, ConditionNode } from '@nexus/types';

/**
 * Condition Engine (§13).
 *
 * Bewertet Bedingungen gegen die bisherigen Antworten einer Submission.
 * String-Vergleiche sind case-insensitive; numerische Vergleiche parsen beide
 * Seiten als Zahl. Bei Array-Antworten (Multi-Select) bedeutet `equals`
 * → Wert enthalten.
 */

/** Antworten eines Status: questionId → Wert. */
export type AnswerResolver = (questionId: string) => AnswerValue | undefined;

export interface ConditionFailure {
  questionId: string;
  operator: string;
  expected?: string | string[];
  actual: AnswerValue | undefined;
}

export function resolveFromMap(answers: Record<string, AnswerValue>): AnswerResolver {
  return (questionId: string) => answers[questionId];
}

export function evaluateCondition(
  node: ConditionNode | undefined,
  resolve: AnswerResolver,
): boolean {
  if (node === undefined || node === null) return true;
  if (node.type === 'group') return evaluateGroup(node, resolve);
  return evaluateLeaf(node, resolve);
}

export function evaluateGroup(group: ConditionGroup, resolve: AnswerResolver): boolean {
  switch (group.combinator) {
    case 'AND':
      return group.children.every((child) => evaluateCondition(child, resolve));
    case 'OR':
      return group.children.some((child) => evaluateCondition(child, resolve));
    case 'NOT':
      // NOT bezieht sich auf die Gesamtheit der Kinder (i. d. R. genau eines).
      return !group.children.every((child) => evaluateCondition(child, resolve));
    default:
      return false;
  }
}

export function evaluateLeaf(leaf: ConditionLeaf, resolve: AnswerResolver): boolean {
  const actual = resolve(leaf.questionId);
  const expected = leaf.value;

  switch (leaf.operator) {
    case 'is_empty':
      return isEmpty(actual);
    case 'is_not_empty':
      return !isEmpty(actual);

    case 'equals':
      return expected === undefined ? false : looseEquals(actual, String(expected));
    case 'not_equals':
      return expected === undefined ? true : !looseEquals(actual, String(expected));

    case 'in':
      return expected !== undefined && Array.isArray(expected)
        ? expected.some((e) => looseEquals(actual, e))
        : false;
    case 'not_in':
      return expected !== undefined && Array.isArray(expected)
        ? !expected.some((e) => looseEquals(actual, e))
        : true;

    case 'contains':
      return expected !== undefined && stringContains(actual, String(expected));
    case 'not_contains':
      return expected === undefined || !stringContains(actual, String(expected));
    case 'starts_with':
      return expected !== undefined && stringStartsWith(actual, String(expected));
    case 'ends_with':
      return expected !== undefined && stringEndsWith(actual, String(expected));

    case 'greater_than':
    case 'less_than':
    case 'greater_or_equal':
    case 'less_or_equal':
      return numericCompare(actual, expected, leaf.operator);

    default:
      return false;
  }
}

// --- Helfer ---------------------------------------------------------------

function isEmpty(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function asComparable(value: AnswerValue | undefined): string | string[] | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map((v) => String(v).toLowerCase());
  if (typeof value === 'object') return JSON.stringify(value).toLowerCase();
  return String(value).toLowerCase();
}

const TRUTHY_STRINGS = new Set(['ja', 'yes', 'y', 'true', '1', 'stimmt', 'wahr']);
const FALSY_STRINGS = new Set(['nein', 'no', 'n', 'false', '0', 'ne', 'falsch']);

function looseEquals(actual: AnswerValue | undefined, expected: string): boolean {
  const a = asComparable(actual);
  const e = expected.toLowerCase();
  if (a === null) return false;

  // Boolesche Antworten (YES_NO/CONFIRMATION/CHECKBOX) vs. String-Bedingung.
  if (typeof actual === 'boolean') {
    const isTruthyExpected = TRUTHY_STRINGS.has(e);
    const isFalsyExpected = FALSY_STRINGS.has(e);
    if (isTruthyExpected) return actual === true;
    if (isFalsyExpected) return actual === false;
    return false;
  }

  if (Array.isArray(a)) {
    // Array-Antwort (z. B. Multi-Select): enthalten-Sein reicht.
    return a.includes(e) || a.some((v) => v.trim() === e.trim());
  }
  return a.trim() === e.trim();
}

function stringContains(actual: AnswerValue | undefined, expected: string): boolean {
  const a = asComparable(actual);
  if (a === null) return false;
  if (Array.isArray(a)) return a.some((v) => v.includes(expected.toLowerCase()));
  return a.includes(expected.toLowerCase());
}

function stringStartsWith(actual: AnswerValue | undefined, expected: string): boolean {
  const a = asComparable(actual);
  if (a === null) return false;
  if (Array.isArray(a)) return a.some((v) => v.trim().startsWith(expected.toLowerCase()));
  return a.trim().startsWith(expected.toLowerCase());
}

function stringEndsWith(actual: AnswerValue | undefined, expected: string): boolean {
  const a = asComparable(actual);
  if (a === null) return false;
  if (Array.isArray(a)) return a.some((v) => v.trim().endsWith(expected.toLowerCase()));
  return a.trim().endsWith(expected.toLowerCase());
}

function numericCompare(
  actual: AnswerValue | undefined,
  expected: string | string[] | undefined,
  operator: string,
): boolean {
  if (expected === undefined || Array.isArray(expected)) return false;
  const a = toNumber(actual);
  const e = toNumber(expected);
  if (a === null || e === null) return false;
  switch (operator) {
    case 'greater_than':
      return a > e;
    case 'less_than':
      return a < e;
    case 'greater_or_equal':
      return a >= e;
    case 'less_or_equal':
      return a <= e;
    default:
      return false;
  }
}

function toNumber(value: AnswerValue | string | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/,/g, '.').trim();
  const parsed = Number(trimmed);
  return trimmed.length > 0 && Number.isFinite(parsed) ? parsed : null;
}

/**
 * Sammelt alle Frage-IDs, auf die eine Condition (rekursiv) verweist.
 * Nützlich für die Builder-Validierung (§141: invalid references erkennen).
 */
export function collectConditionQuestionIds(node: ConditionNode | undefined): Set<string> {
  const ids = new Set<string>();
  const walk = (n: ConditionNode | undefined): void => {
    if (!n) return;
    if (n.type === 'leaf') ids.add(n.questionId);
    else n.children.forEach(walk);
  };
  walk(node);
  return ids;
}
