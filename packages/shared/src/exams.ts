import { z } from 'zod';

// ───────────── Prüfungen: Fragen, Bewertung, Einstellungen ─────────────

export const EXAM_QUESTION_TYPES = ['SINGLE', 'MULTI', 'YESNO', 'TEXT', 'NUMBER', 'ORDER', 'MATCH', 'GAP', 'CASE'] as const;
export type ExamQuestionType = (typeof EXAM_QUESTION_TYPES)[number];
export const EXAM_QUESTION_TYPE_LABEL: Record<ExamQuestionType, string> = {
  SINGLE: 'Single Choice', MULTI: 'Multiple Choice', YESNO: 'Ja/Nein', TEXT: 'Freitext', NUMBER: 'Zahl', ORDER: 'Reihenfolge', MATCH: 'Zuordnung', GAP: 'Lückentext', CASE: 'Fallbeispiel',
};
export const EXAM_QUESTION_TYPE_HINT: Record<ExamQuestionType, string> = {
  SINGLE: 'Genau eine Antwort ist richtig.', MULTI: 'Mehrere Antworten können richtig sein.', YESNO: 'Ja oder Nein.',
  TEXT: 'Freie Antwort – automatisch über Stichworte oder durch einen Prüfer.', NUMBER: 'Zahl, optional mit Toleranz.',
  ORDER: 'Einträge in die richtige Reihenfolge bringen. Im Editor in der richtigen Reihenfolge eintragen – sie werden beim Versuch gemischt.',
  MATCH: 'Jedem Begriff links das passende Gegenstück rechts zuordnen. Im Editor jeweils als richtiges Paar eintragen.',
  GAP: 'Lücken im Text mit {{Antwort}} markieren, Alternativen mit | trennen, z. B. „Innerorts gilt {{50|fünfzig}} km/h“.',
  CASE: 'Fiktives Fallbeispiel mit offener Antwort. Bewertet wird von Hand anhand des Kriterienkatalogs.',
};

// ───────────── Themen, Schwierigkeit, Fallbeispiele ─────────────

export const EXAM_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type ExamDifficulty = (typeof EXAM_DIFFICULTIES)[number];
export const EXAM_DIFFICULTY_LABEL: Record<ExamDifficulty, string> = { EASY: 'Leicht', MEDIUM: 'Mittel', HARD: 'Schwer' };
/** Fallbeispiel-Arten. Verkehrsunfall und Leitstellenübung wurden bewusst entfernt und dürfen nicht wieder eingeführt werden. */
export const EXAM_CASE_KINDS = ['TRAFFIC_STOP', 'ARREST', 'LEADERSHIP', 'OTHER'] as const;
export type ExamCaseKind = (typeof EXAM_CASE_KINDS)[number];
export const EXAM_CASE_KIND_LABEL: Record<ExamCaseKind, string> = { TRAFFIC_STOP: 'Verkehrskontrolle', ARREST: 'Festnahme', LEADERSHIP: 'Führungsaufgabe', OTHER: 'Sonstiges' };
/** Entfernte Aufgaben – Themen/Kategorien mit diesen Namen lehnt der Server ab. */
export const EXAM_REMOVED_TASKS = /verkehrsunfall|unfallaufnahme|leitstellen-?\s?(ü|ue)bung/i;
export const isRemovedExamTask = (text: string | null | undefined) => !!text && EXAM_REMOVED_TASKS.test(text);

export const rubricItemSchema = z.object({ id: z.string().min(1).max(40), label: z.string().trim().min(1).max(300), points: z.number().min(0).max(100) });
export type RubricItem = z.infer<typeof rubricItemSchema>;
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
  /** Thema (z. B. „Verkehrskontrolle“, „Festnahme“, „Rechtsgrundlagen“) – für Zufallsauswahl und Wiederholung schwacher Themen */
  topic: z.string().trim().max(60).nullable().default(null),
  difficulty: z.enum(EXAM_DIFFICULTIES).default('MEDIUM'),
  /** Fallbeispiel-Art (nur CASE) */
  caseKind: z.enum(EXAM_CASE_KINDS).nullable().default(null),
  /** Kriterienkatalog für die manuelle Bewertung (Freitext ohne Stichworte und Fallbeispiele) */
  rubric: z.array(rubricItemSchema).max(20).default([]),
});
export type Question = z.infer<typeof questionSchema>;

/** Zufällige Zusammenstellung: je Regel `count` Fragen mit passendem Thema/Schwierigkeit (leer = beliebig). */
export const drawRuleSchema = z.object({ topic: z.string().trim().max(60).nullable().default(null), difficulty: z.enum(EXAM_DIFFICULTIES).nullable().default(null), count: z.number().int().min(1).max(200) });
export type DrawRule = z.infer<typeof drawRuleSchema>;

/**
 * Fragen nach Regeln ziehen. Bevorzugt Fragen aus `prefer` (schwache Themen der Person), sonst zufällig (`rand(n)` → 0..n-1).
 * Keine Frage wird doppelt gezogen. Reichen die Fragen für eine Regel nicht, wird genommen, was da ist (`missing` zählt den Rest).
 */
export function drawQuestions(all: Question[], rules: DrawRule[], prefer: readonly string[], rand: (n: number) => number) {
  const used = new Set<string>();
  const shuffle = <T>(a: T[]) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = rand(i + 1); [r[i], r[j]] = [r[j]!, r[i]!]; } return r; };
  const weak = new Set(prefer.map((t) => t.toLowerCase()));
  let missing = 0;
  for (const rule of rules) {
    const fits = all.filter((q) => !used.has(q.id) && (!rule.topic || (q.topic ?? '').toLowerCase() === rule.topic.toLowerCase()) && (!rule.difficulty || q.difficulty === rule.difficulty));
    const mixed = shuffle(fits);
    const ordered = [...mixed.filter((q) => weak.has((q.topic ?? '').toLowerCase())), ...mixed.filter((q) => !weak.has((q.topic ?? '').toLowerCase()))];
    const take = ordered.slice(0, rule.count);
    take.forEach((q) => used.add(q.id));
    missing += rule.count - take.length;
  }
  return { questions: all.filter((q) => used.has(q.id)), missing };
}

/**
 * Schwache Themen eines bewerteten Versuchs: Themen, in denen weniger als `passPercent` der Punkte erreicht wurden.
 * Fragen ohne Thema zählen nicht.
 */
export function weakTopicsOf(questions: Question[], scores: Record<string, number>, passPercent: number): string[] {
  const by = new Map<string, { got: number; max: number }>();
  for (const q of questions) {
    if (!q.topic || q.points <= 0) continue;
    const e = by.get(q.topic) ?? { got: 0, max: 0 };
    e.got += scores[q.id] ?? 0; e.max += q.points;
    by.set(q.topic, e);
  }
  return [...by].filter(([, v]) => v.max > 0 && (v.got / v.max) * 100 < passPercent).map(([t]) => t).sort((a, b) => a.localeCompare(b, 'de'));
}

/** Punkte aus dem Kriterienkatalog: Summe der vergebenen Kriterien, höchstens die Punkte der Frage. */
export function rubricScore(q: Pick<Question, 'points' | 'rubric'>, awarded: Record<string, number>): number {
  const sum = q.rubric.reduce((n, r) => n + Math.max(0, Math.min(r.points, awarded[r.id] ?? 0)), 0);
  return Math.round(Math.min(q.points, sum) * 100) / 100;
}

/** Fiktive Fallbeispiele als Vorlage (nur erlaubte Aufgaben: Verkehrskontrolle, Festnahme, Führungsaufgabe). */
export const EXAM_CASE_TEMPLATES: { caseKind: Exclude<ExamCaseKind, 'OTHER'>; topic: string; text: string; points: number; rubric: { label: string; points: number }[] }[] = [
  { caseKind: 'TRAFFIC_STOP', topic: 'Verkehrskontrolle', points: 10,
    text: 'Fiktiver Fall: Du hältst nachts auf der Hauptstraße einen Pkw an, der ohne Licht fährt. Der Fahrer wirkt nervös und greift wiederholt ins Handschuhfach. Beschreibe dein Vorgehen von der Anhaltung bis zum Abschluss der Kontrolle.',
    rubric: [{ label: 'Sichere Anhaltung (Position, Licht, Funkmeldung an die Leitstelle)', points: 2 }, { label: 'Eigensicherung bei verdächtigen Bewegungen', points: 3 }, { label: 'Korrekte Kontrolle der Papiere und Abfrage im MDT', points: 2 }, { label: 'Angemessene Maßnahme (Verwarnung/Bußgeld) mit Begründung', points: 2 }, { label: 'Dokumentation im Bericht', points: 1 }] },
  { caseKind: 'ARREST', topic: 'Festnahme', points: 10,
    text: 'Fiktiver Fall: Bei einer Fahndung triffst du die gesuchte Person vor einem Geschäft an. Sie leistet passiven Widerstand. Beschreibe Festnahme, Belehrung und die anschließenden Schritte.',
    rubric: [{ label: 'Identität und Fahndungstreffer sicher bestätigt', points: 2 }, { label: 'Verhältnismäßige Zwangsmittel und Eigensicherung', points: 3 }, { label: 'Vollständige Belehrung', points: 2 }, { label: 'Durchsuchung und Transport korrekt', points: 2 }, { label: 'Fahndung erledigt und Bericht verknüpft', points: 1 }] },
  { caseKind: 'LEADERSHIP', topic: 'Führungsaufgabe', points: 10,
    text: 'Fiktiver Fall: Als Schichtleitung hast du drei Einheiten im Dienst, zwei parallele Einsätze mit hoher Priorität und einen neuen Notruf. Beschreibe, wie du priorisierst, Einheiten verteilst und die Kommunikation führst.',
    rubric: [{ label: 'Nachvollziehbare Priorisierung nach Gefahr und Dringlichkeit', points: 3 }, { label: 'Sinnvolle Verteilung der Einheiten, Nachforderung bei Bedarf', points: 3 }, { label: 'Klare Funkkommunikation und Lagemeldungen', points: 2 }, { label: 'Dokumentation und Übergabe', points: 2 }] },
];

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
    case 'CASE':
      return null;
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
  if (q.type === 'CASE') {
    if (!q.rubric.length) out.push(`${label}: Fallbeispiel braucht einen Kriterienkatalog`);
    else if (q.rubric.reduce((n, r) => n + r.points, 0) < q.points) out.push(`${label}: die Kriterien ergeben weniger Punkte als die Frage hat`);
  }
  if (isRemovedExamTask(q.topic)) out.push(`${label}: das Thema „${q.topic}“ wurde entfernt und darf nicht wieder verwendet werden`);
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
  questionCount: z.number().int().min(0).max(200).default(0),
  /** Zufällige Zusammenstellung nach Thema/Schwierigkeit (leer = `questionCount` bzw. alle Fragen) */
  drawRules: z.array(drawRuleSchema).max(30).default([]),
  passPercent: z.number().int().min(1).max(100).default(70), timeLimitMin: z.number().int().min(1).max(600).nullable().default(null),
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
export function examProblems(e: Pick<ExamInput, 'title' | 'questions' | 'questionCount'> & { category?: string | null; drawRules?: DrawRule[] }): string[] {
  const out: string[] = [];
  if (!e.title.trim()) out.push('Titel fehlt');
  if (isRemovedExamTask(e.title) || isRemovedExamTask(e.category)) out.push('Verkehrsunfall und Leitstellenübung wurden entfernt und dürfen nicht wieder eingeführt werden');
  for (const r of e.drawRules ?? []) {
    if (isRemovedExamTask(r.topic)) out.push(`Ziehregel: das Thema „${r.topic}“ wurde entfernt`);
    const n = e.questions.filter((q) => (!r.topic || (q.topic ?? '').toLowerCase() === r.topic.toLowerCase()) && (!r.difficulty || q.difficulty === r.difficulty)).length;
    if (n < r.count) out.push(`Ziehregel ${r.topic ?? 'alle Themen'}/${r.difficulty ? EXAM_DIFFICULTY_LABEL[r.difficulty] : 'jede Schwierigkeit'}: nur ${n} passende Fragen für ${r.count} gewünschte`);
  }
  const ids = e.questions.map((q) => q.id);
  if (new Set(ids).size !== ids.length) out.push('Fragen-IDs müssen eindeutig sein');
  e.questions.forEach((q, i) => out.push(...questionProblems(q, `Frage ${i + 1}`)));
  if (e.questions.length && e.questions.reduce((n, q) => n + q.points, 0) <= 0) out.push('Die Fragen haben zusammen 0 Punkte');
  return out;
}

/** Austauschformat für Import/Export einer Prüfung als JSON-Datei. */
export const EXAM_EXPORT_FORMAT = 'enrp.exam';
export const examExportSchema = z.object({ format: z.literal(EXAM_EXPORT_FORMAT), version: z.literal(1), exam: z.record(z.unknown()) });
