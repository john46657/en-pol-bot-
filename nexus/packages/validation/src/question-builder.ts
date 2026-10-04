import type { ConditionNode, Question } from '@nexus/types';
import { QuestionType } from '@nexus/types';
import { z } from 'zod';
import {
  conditionNodeSchema,
  questionOptionSchema,
  questionValidationSchema,
} from './application.js';

/**
 * Fragen-Builder (reine Logik, ohne I/O): anlegen, bearbeiten, löschen, verschieben, (de)aktivieren.
 * Alle Operationen liefern eine neue, lückenlos nummerierte Liste oder werfen einen `QuestionBuilderError`.
 * Die Persistenz (Transaktion, Audit) liegt im API-Service.
 */
export class QuestionBuilderError extends Error {
  constructor(
    public readonly code: 'invalid' | 'not-found' | 'conflict' | 'limit',
    message: string,
    public readonly details?: string[],
  ) {
    super(message);
    this.name = 'QuestionBuilderError';
  }
}

export const MAX_QUESTIONS = 100;

const DISPLAY_ONLY: ReadonlySet<string> = new Set([
  QuestionType.PARAGRAPH,
  QuestionType.INFO,
  QuestionType.SEPARATOR,
]);
const WITH_OPTIONS: ReadonlySet<string> = new Set([
  QuestionType.SINGLE_SELECT,
  QuestionType.MULTI_SELECT,
  QuestionType.MULTI_CHECKBOX,
]);
/** Typen, die der Builder anbietet (Basis: Text, Langtext, Zahl, Ja/Nein, Auswahl, Mehrfachauswahl, Datum, Bewertung). */
export const BUILDER_QUESTION_TYPES = [
  QuestionType.TEXT,
  QuestionType.LONG_TEXT,
  QuestionType.NUMBER,
  QuestionType.DECIMAL,
  QuestionType.YES_NO,
  QuestionType.SINGLE_SELECT,
  QuestionType.MULTI_SELECT,
  QuestionType.DATE,
  QuestionType.TIME,
  QuestionType.DATETIME,
  QuestionType.RATING,
  QuestionType.SLIDER,
  QuestionType.URL,
  QuestionType.EMAIL,
  QuestionType.PHONE,
  QuestionType.USERNAME,
  QuestionType.DISCORD_USER,
  QuestionType.CONFIRMATION,
  QuestionType.PARAGRAPH,
  QuestionType.INFO,
] as const;

const questionIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{1,39}$/, 'Ungültige Frage-ID.');

/** Eingabe zum Anlegen/Ändern (Reihenfolge bestimmt der Builder). */
export const questionInputSchema = z.object({
  id: questionIdSchema.optional(),
  type: z.enum(BUILDER_QUESTION_TYPES),
  title: z.string().trim().min(1, 'Der Titel fehlt.').max(200),
  description: z.string().trim().max(2000).optional(),
  required: z.boolean().default(false),
  enabled: z.boolean().default(true),
  placeholder: z.string().trim().max(200).optional(),
  defaultValue: z.string().max(10000).optional(),
  validation: questionValidationSchema.optional(),
  options: z.array(questionOptionSchema).max(25).optional(),
  visibleIf: conditionNodeSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

/** Verschachtelte Quantoren wie `(a+)+` können einen Regex-Engine-Stillstand (ReDoS) auslösen. */
const RISKY_REGEX = /\([^)]*[+*][^)]*\)\s*[+*{]/;

/** Fachliche Prüfung einer einzelnen Frage (typabhängig). Gibt Fehlertexte zurück. */
export function checkQuestionDefinition(q: {
  type: string;
  required: boolean;
  options?: { label: string; value: string; enabled?: boolean }[] | undefined;
  validation?: z.infer<typeof questionValidationSchema> | undefined;
}): string[] {
  const errors: string[] = [];
  const v = q.validation ?? {};
  if (DISPLAY_ONLY.has(q.type) && q.required)
    errors.push('Reine Anzeige-Elemente können nicht verpflichtend sein.');
  if (WITH_OPTIONS.has(q.type)) {
    const opts = (q.options ?? []).filter((o) => o.enabled !== false);
    if (opts.length === 0) errors.push('Auswahlfragen brauchen mindestens eine aktive Option.');
    const values = opts.map((o) => o.value.trim().toLowerCase());
    const labels = opts.map((o) => o.label.trim().toLowerCase());
    if (new Set(values).size !== values.length || new Set(labels).size !== labels.length) {
      errors.push('Optionen müssen eindeutige Beschriftungen und Werte haben.');
    }
    if (q.type !== QuestionType.SINGLE_SELECT) {
      if (
        v.minSelections !== undefined &&
        v.maxSelections !== undefined &&
        v.minSelections > v.maxSelections
      ) {
        errors.push('Mindestanzahl der Auswahl ist größer als die Höchstanzahl.');
      }
      if (v.minSelections !== undefined && opts.length > 0 && v.minSelections > opts.length) {
        errors.push('Mindestanzahl der Auswahl ist größer als die Zahl der Optionen.');
      }
    }
  } else if (q.options?.length) {
    errors.push('Nur Auswahlfragen haben Optionen.');
  }
  if (v.minLength !== undefined && v.maxLength !== undefined && v.minLength > v.maxLength) {
    errors.push('Mindestlänge ist größer als die Höchstlänge.');
  }
  if (v.min !== undefined && v.max !== undefined && v.min > v.max)
    errors.push('Minimum ist größer als das Maximum.');
  if (q.type === QuestionType.RATING && (v.max ?? 5) > 10)
    errors.push('Eine Bewertung geht höchstens bis 10.');
  if (v.pattern) {
    if (q.type !== QuestionType.TEXT && q.type !== QuestionType.USERNAME)
      errors.push('Ein Muster ist nur bei Textfragen möglich.');
    try {
      new RegExp(v.pattern);
    } catch {
      errors.push('Das Muster (Regex) ist ungültig.');
    }
    if (RISKY_REGEX.test(v.pattern))
      errors.push('Das Muster ist zu komplex (verschachtelte Wiederholungen sind nicht erlaubt).');
  }
  return errors;
}

function collectRefs(node: ConditionNode | undefined, out: Set<string> = new Set()): Set<string> {
  if (!node) return out;
  if (node.type === 'leaf') out.add(node.questionId);
  else node.children.forEach((c) => collectRefs(c, out));
  return out;
}

/** Bedingungen dürfen nur auf existierende, **vorherige** Fragen verweisen. */
export function checkConditions(list: readonly Question[]): string[] {
  const errors: string[] = [];
  const index = new Map(list.map((q, i) => [q.id, i]));
  list.forEach((q, i) => {
    for (const ref of collectRefs(q.visibleIf)) {
      const at = index.get(ref);
      if (at === undefined)
        errors.push(
          `„${q.title}“ verweist in der Bedingung auf eine nicht vorhandene Frage (${ref}).`,
        );
      else if (at >= i) errors.push(`„${q.title}“ darf nur von Fragen abhängen, die davor stehen.`);
    }
  });
  return errors;
}

const renumber = (list: Question[]): Question[] => list.map((q, i) => ({ ...q, order: i }));
const sorted = (list: readonly Question[]): Question[] =>
  [...list].sort((a, b) => a.order - b.order);

function parse(input: unknown): QuestionInput {
  const r = questionInputSchema.safeParse(input);
  if (!r.success) {
    throw new QuestionBuilderError(
      'invalid',
      'Die Frage ist ungültig.',
      r.error.issues.map((i) => `${i.path.join('.') || 'frage'}: ${i.message}`),
    );
  }
  const errors = checkQuestionDefinition(r.data);
  if (errors.length) throw new QuestionBuilderError('invalid', 'Die Frage ist ungültig.', errors);
  return r.data;
}

function finish(list: Question[]): Question[] {
  const numbered = renumber(list);
  const errors = checkConditions(numbered);
  if (errors.length) throw new QuestionBuilderError('conflict', errors[0]!, errors);
  return numbered;
}

const clean = (q: QuestionInput, id: string, order: number): Question => {
  const { id: _id, ...rest } = q;
  return Object.fromEntries(
    Object.entries({ ...rest, id, order }).filter(([, v]) => v !== undefined),
  ) as unknown as Question;
};

export function generateQuestionId(existing: readonly Question[]): string {
  const used = new Set(existing.map((q) => q.id));
  for (let n = existing.length + 1; ; n++) if (!used.has(`frage-${n}`)) return `frage-${n}`;
}

export function addQuestion(
  list: readonly Question[],
  input: unknown,
  position?: number,
): { list: Question[]; question: Question } {
  const data = parse(input);
  if (list.length >= MAX_QUESTIONS)
    throw new QuestionBuilderError('limit', `Maximal ${MAX_QUESTIONS} Fragen pro Bewerbung.`);
  const id = data.id ?? generateQuestionId(list);
  if (list.some((q) => q.id === id))
    throw new QuestionBuilderError('conflict', `Die Frage-ID „${id}“ gibt es schon.`);
  const next = sorted(list);
  const at = position === undefined ? next.length : Math.min(Math.max(position, 0), next.length);
  next.splice(at, 0, clean(data, id, at));
  const result = finish(next);
  return { list: result, question: result[at]! };
}

export function updateQuestion(
  list: readonly Question[],
  id: string,
  input: unknown,
): { list: Question[]; question: Question } {
  const current = list.find((q) => q.id === id);
  if (!current) throw new QuestionBuilderError('not-found', 'Frage nicht gefunden.');
  const data = parse({ ...(input as object), id });
  const next = sorted(list).map((q) => (q.id === id ? clean(data, id, q.order) : q));
  const result = finish(next);
  return { list: result, question: result.find((q) => q.id === id)! };
}

/** Fragen, deren Bedingung auf `id` verweist. */
export function dependentsOf(list: readonly Question[], id: string): Question[] {
  return list.filter((q) => collectRefs(q.visibleIf).has(id));
}

export function removeQuestion(
  list: readonly Question[],
  id: string,
): { list: Question[]; removed: Question } {
  const removed = list.find((q) => q.id === id);
  if (!removed) throw new QuestionBuilderError('not-found', 'Frage nicht gefunden.');
  const deps = dependentsOf(list, id);
  if (deps.length) {
    throw new QuestionBuilderError(
      'conflict',
      'Andere Fragen hängen von dieser Frage ab.',
      deps.map((q) => `„${q.title}“ (${q.id})`),
    );
  }
  return { list: renumber(sorted(list).filter((q) => q.id !== id)), removed };
}

export function moveQuestion(
  list: readonly Question[],
  id: string,
  toIndex: number,
): { list: Question[] } {
  const next = sorted(list);
  const from = next.findIndex((q) => q.id === id);
  if (from === -1) throw new QuestionBuilderError('not-found', 'Frage nicht gefunden.');
  const [item] = next.splice(from, 1);
  next.splice(Math.min(Math.max(toIndex, 0), next.length), 0, item!);
  return { list: finish(next) };
}

/** Vollständige Prüfung vor dem Veröffentlichen. */
export function checkQuestionsForPublish(list: readonly Question[]): string[] {
  const errors: string[] = [];
  const active = sorted(list).filter((q) => q.enabled !== false);
  if (active.length === 0) errors.push('Mindestens eine aktive Frage wird benötigt.');
  if (!active.some((q) => !DISPLAY_ONLY.has(q.type)))
    errors.push('Es muss mindestens eine echte Frage geben (nicht nur Anzeige-Elemente).');
  for (const q of active) {
    for (const e of checkQuestionDefinition(q)) errors.push(`„${q.title}“: ${e}`);
  }
  errors.push(...checkConditions(sorted(list)));
  const disabled = new Set(list.filter((q) => q.enabled === false).map((q) => q.id));
  for (const q of active) {
    for (const ref of collectRefs(q.visibleIf)) {
      if (disabled.has(ref))
        errors.push(
          `„${q.title}“ hängt von einer deaktivierten Frage ab und würde nie erscheinen.`,
        );
    }
  }
  return errors;
}
