import { z } from 'zod';

// ───────────── Prüfungen: Fragen, Bewertung, Einstellungen ─────────────

export const EXAM_QUESTION_TYPES = ['SINGLE', 'MULTI', 'YESNO', 'TEXT', 'NUMBER', 'ORDER', 'MATCH', 'GAP'] as const;
export type ExamQuestionType = (typeof EXAM_QUESTION_TYPES)[number];
export const EXAM_QUESTION_TYPE_LABEL: Record<ExamQuestionType, string> = {
  SINGLE: 'Single Choice', MULTI: 'Multiple Choice', YESNO: 'Ja/Nein', TEXT: 'Freitext', NUMBER: 'Zahl', ORDER: 'Reihenfolge', MATCH: 'Zuordnung', GAP: 'Lückentext',
};
export const EXAM_QUESTION_TYPE_HINT: Record<ExamQuestionType, string> = {
  SINGLE: 'Genau eine Antwort ist richtig.', MULTI: 'Mehrere Antworten können richtig sein.', YESNO: 'Ja oder Nein.',
  TEXT: 'Freie Antwort – automatisch über Stichworte oder durch einen Prüfer.', NUMBER: 'Zahl, optional mit Toleranz.',
  ORDER: 'Einträge in die richtige Reihenfolge bringen. Im Editor in der richtigen Reihenfolge eintragen – sie werden beim Versuch gemischt.',
  MATCH: 'Jedem Begriff links das passende Gegenstück rechts zuordnen. Im Editor jeweils als richtiges Paar eintragen.',
  GAP: 'Lücken im Text mit {{Antwort}} markieren, Alternativen mit | trennen, z. B. „Innerorts gilt {{50|fünfzig}} km/h“.',
};
/** Typen, bei denen die Antwortmöglichkeiten gemischt werden können. */
export const EXAM_SHUFFLE_TYPES: readonly ExamQuestionType[] = ['SINGLE', 'MULTI', 'ORDER', 'MATCH'];

export const questionSchema = z.object({
  id: z.string().min(1).max(40), type: z.enum(EXAM_QUESTION_TYPES), text: z.string().trim().min(1).max(2000),
  /** Antwortmöglichkeiten (Choice), Einträge in richtiger Reihenfolge (ORDER) oder linke Seite (MATCH) */
  options: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  /** MATCH: rechte Seite – matches[i] gehört zu options[i] */
  matches: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  /** richtige Antwort(en): Option-Index als Text, „ja“/„nein“, Zahl oder Stichworte (Freitext ohne Stichworte → Prüfer) */
  correct: z.array(z.string().max(200)).max(12).default([]),
  points: z.number().min(0).max(100).default(1),
  /** Teilpunkte (Multiple Choice, Freitext-Stichworte, Reihenfolge, Zuordnung, Lückentext) */
  partial: z.boolean().default(false),
  /** NUMBER: erlaubte Abweichung */
  tolerance: z.number().min(0).max(1_000_000_000).default(0),
  /** Erklärung, die nach der Bewertung (Einsicht mit Lösungen) angezeigt wird */
  explanation: z.string().max(2000).nullable().default(null),
  /** optionales Bild (nur https) */
  image: z.string().max(500).regex(/^https:\/\//i, 'Bild-Link muss mit https:// beginnen').nullable().default(null),
});
export type Question = z.infer<typeof questionSchema>;

/** Gespeicherte Fragen lesen (ältere Einträge ohne neue Felder bekommen die Standardwerte, kaputte fallen weg). */
export function parseQuestions(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((q) => { const r = questionSchema.safeParse(q); return r.success ? [r.data] : []; });
}

// ───────────── Lückentext ─────────────

const GAP = /\{\{([^{}]*)\}\}/g;
/** Akzeptierte Antworten je Lücke („{{50|fünfzig}}“ → ['50', 'fünfzig']). */
export const gapAnswers = (text: string): string[][] => [...text.matchAll(GAP)].map((m) => (m[1] ?? '').split('|').map((s) => s.trim()).filter(Boolean));
/** Text ohne Lösungen (für Teilnehmer). */
export const maskGaps = (text: string) => text.replace(GAP, '{{}}');
/** Text in Abschnitte zerlegen: Zeichenketten und Lücken-Nummern. */
export function splitGaps(text: string): (string | number)[] {
  const out: (string | number)[] = [];
  let last = 0; let n = 0;
  for (const m of text.matchAll(GAP)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(n++);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ───────────── Bewertung ─────────────

const norm = (x: unknown) => String(x ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const num = (x: unknown) => { const s = String(x ?? '').trim().replace(',', '.'); return s === '' ? NaN : Number(s); };
const list = (a: unknown): string[] => (Array.isArray(a) ? a.map((x) => String(x ?? '')) : a == null || a === '' ? [] : [String(a)]);
const round = (n: number) => Math.round(n * 100) / 100;

/** Ist die Frage beantwortet? (Reihenfolge/Zuordnung/Lücken: alle Teile ausgefüllt) */
export function isAnswered(q: { type: ExamQuestionType; text: string; options: readonly unknown[] }, a: unknown): boolean {
  const l = list(a);
  if (q.type === 'ORDER' || q.type === 'MATCH') return l.length === q.options.length && l.every((x) => x !== '');
  if (q.type === 'GAP') { const n = splitGaps(q.text).filter((s) => typeof s === 'number').length; return l.filter((x) => x.trim()).length >= n && n > 0; }
  return l.some((x) => x.trim() !== '');
}

/** Automatische Auswertung einer Antwort; `null` = muss manuell bewertet werden (Freitext ohne Stichworte). */
export function gradeAnswer(q: Question, a: unknown): number | null {
  const pts = q.points;
  const partial = q.partial ?? false;
  const score = (hits: number, total: number) => (total <= 0 ? 0 : partial ? round(pts * Math.max(0, Math.min(1, hits / total))) : hits >= total ? pts : 0);
  switch (q.type) {
    case 'TEXT': {
      if (!q.correct.length) return null;
      const t = norm(a);
      return score(q.correct.filter((k) => t.includes(norm(k))).length, q.correct.length);
    }
    case 'NUMBER': {
      const n = num(Array.isArray(a) ? a[0] : a); const c = num(q.correct[0]);
      return !Number.isNaN(n) && !Number.isNaN(c) && Math.abs(n - c) <= (q.tolerance ?? 0) + 1e-9 ? pts : 0;
    }
    case 'MULTI': {
      const got = new Set(list(a).map(norm)); const want = new Set(q.correct.map(norm));
      const right = [...got].filter((x) => want.has(x)).length; const wrong = got.size - right;
      if (!partial) return wrong === 0 && right === want.size ? pts : 0;
      return score(right - wrong, want.size);
    }
    case 'ORDER':
    case 'MATCH': {
      const got = list(a); const n = q.options.length;
      return score(Array.from({ length: n }, (_, i) => got[i] === String(i)).filter(Boolean).length, n);
    }
    case 'GAP': {
      const gaps = gapAnswers(q.text); const got = list(a);
      return score(gaps.filter((alts, i) => alts.map(norm).includes(norm(got[i]))).length, gaps.length);
    }
    default:
      return norm(Array.isArray(a) ? a[0] : a) === norm(q.correct[0]) ? pts : 0;
  }
}

/** Probleme einer Frage (für Editor und Server). `label` z. B. „Frage 3“. */
export function questionProblems(q: Question, label: string): string[] {
  const out: string[] = [];
  const opts = q.options ?? [];
  if (!q.text.trim()) out.push(`${label}: Text fehlt`);
  if (q.type === 'SINGLE' || q.type === 'MULTI') {
    if (opts.length < 2) out.push(`${label}: mindestens 2 Antworten`);
    if (opts.some((o) => !o.trim())) out.push(`${label}: leere Antwortmöglichkeit`);
    const valid = q.correct.filter((c) => /^\d+$/.test(c) && Number(c) < opts.length);
    if (q.type === 'SINGLE' && valid.length !== 1) out.push(`${label}: richtige Antwort wählen`);
    if (q.type === 'MULTI' && !valid.length) out.push(`${label}: mindestens eine richtige Antwort wählen`);
  }
  if (q.type === 'YESNO' && !['ja', 'nein'].includes(norm(q.correct[0]))) out.push(`${label}: richtige Antwort wählen`);
  if (q.type === 'NUMBER' && Number.isNaN(num(q.correct[0]))) out.push(`${label}: richtige Zahl fehlt`);
  if (q.type === 'ORDER') {
    if (opts.length < 2) out.push(`${label}: mindestens 2 Einträge`);
    if (opts.some((o) => !o.trim())) out.push(`${label}: leerer Eintrag`);
    if (new Set(opts.map(norm)).size !== opts.length) out.push(`${label}: Einträge müssen unterschiedlich sein`);
  }
  if (q.type === 'MATCH') {
    if (opts.length < 2) out.push(`${label}: mindestens 2 Paare`);
    if (opts.some((o) => !o.trim()) || (q.matches ?? []).some((o) => !o.trim()) || (q.matches ?? []).length !== opts.length) out.push(`${label}: jedes Paar braucht beide Seiten`);
  }
  if (q.type === 'GAP') {
    const gaps = gapAnswers(q.text);
    if (!gaps.length) out.push(`${label}: mindestens eine Lücke {{…}} im Text`);
    else if (gaps.some((g) => !g.length)) out.push(`${label}: leere Lücke {{}} – Antwort eintragen`);
  }
  return out;
}

// ───────────── Prüfungs-Einstellungen ─────────────

/** Einsicht nach der Bewertung: nichts, eigene Antworten (richtig/falsch) oder zusätzlich Lösungen und Erklärungen. */
export const EXAM_REVIEW_MODES = ['NONE', 'ANSWERS', 'SOLUTIONS'] as const;
export type ExamReviewMode = (typeof EXAM_REVIEW_MODES)[number];
export const EXAM_REVIEW_LABEL: Record<ExamReviewMode, string> = { NONE: 'Keine Einsicht', ANSWERS: 'Eigene Antworten (richtig/falsch)', SOLUTIONS: 'Antworten mit Lösungen und Erklärungen' };
export const EXAM_LAYOUTS = ['PAGED', 'LIST'] as const;
export type ExamLayout = (typeof EXAM_LAYOUTS)[number];
export const EXAM_LAYOUT_LABEL: Record<ExamLayout, string> = { PAGED: 'Eine Frage pro Seite', LIST: 'Alle Fragen auf einer Seite' };
export const EXAM_ATTEMPT_STATUSES = ['IN_PROGRESS', 'SUBMITTED', 'GRADED', 'VOIDED'] as const;
export type ExamAttemptStatus = (typeof EXAM_ATTEMPT_STATUSES)[number];
export const EXAM_ATTEMPT_STATUS_LABEL: Record<ExamAttemptStatus, string> = { IN_PROGRESS: 'Läuft', SUBMITTED: 'Wartet auf Bewertung', GRADED: 'Bewertet', VOIDED: 'Annulliert' };

const isoDate = z.string().datetime({ offset: true });
export const examSchema = z.object({
  title: z.string().trim().min(1).max(120), description: z.string().max(3000).nullable().default(null),
  /** Hinweise auf der Startseite vor Beginn */
  instructions: z.string().max(4000).nullable().default(null),
  category: z.string().trim().max(60).nullable().default(null),
  questions: z.array(questionSchema).max(200).default([]),
  questionCount: z.number().int().min(0).max(200).default(0), passPercent: z.number().int().min(1).max(100).default(70), timeLimitMin: z.number().int().min(1).max(600).nullable().default(null),
  maxAttempts: z.number().int().min(1).max(50).default(3), retryHours: z.number().int().min(0).max(24 * 90).default(24),
  autoGrade: z.boolean().default(true), showResult: z.boolean().default(true), reviewMode: z.enum(EXAM_REVIEW_MODES).default('ANSWERS'), layout: z.enum(EXAM_LAYOUTS).default('PAGED'),
  shuffleQuestions: z.boolean().default(false), shuffleOptions: z.boolean().default(false),
  examinerIds: z.array(z.string().uuid()).max(30).default([]),
  /** Dashboard-Rollen, die die Prüfung sehen/ablegen dürfen (leer = alle mit exam.view) */
  audienceRoleIds: z.array(z.string().uuid()).max(30).default([]),
  trainingId: z.string().uuid().nullable().default(null),
  /** muss vorher bestanden sein */
  requiredExamId: z.string().uuid().nullable().default(null),
  availableFrom: isoDate.nullable().default(null), availableUntil: isoDate.nullable().default(null),
  /** Prüfer bei Abgabe benachrichtigen, wenn manuell bewertet werden muss */
  notifyExaminers: z.boolean().default(true),
  active: z.boolean().default(true),
}).refine((e) => !e.availableFrom || !e.availableUntil || new Date(e.availableFrom) < new Date(e.availableUntil), { message: '„Verfügbar bis“ muss nach „Verfügbar ab“ liegen.', path: ['availableUntil'] });
export type ExamInput = z.infer<typeof examSchema>;

/** Alle Probleme einer Prüfung (Editor zeigt sie an, Server lehnt ab). */
export function examProblems(e: Pick<ExamInput, 'title' | 'questions' | 'questionCount'>): string[] {
  const out: string[] = [];
  if (!e.title.trim()) out.push('Titel fehlt');
  const ids = e.questions.map((q) => q.id);
  if (new Set(ids).size !== ids.length) out.push('Fragen-IDs müssen eindeutig sein');
  e.questions.forEach((q, i) => out.push(...questionProblems(q, `Frage ${i + 1}`)));
  if (e.questions.length && e.questions.reduce((n, q) => n + q.points, 0) <= 0) out.push('Die Fragen haben zusammen 0 Punkte');
  return out;
}

/** Austauschformat für Import/Export einer Prüfung als JSON-Datei. */
export const EXAM_EXPORT_FORMAT = 'enrp.exam';
export const examExportSchema = z.object({ format: z.literal(EXAM_EXPORT_FORMAT), version: z.literal(1), exam: z.record(z.unknown()) });
