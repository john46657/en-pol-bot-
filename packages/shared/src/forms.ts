/**
 * Bewerbungsfragen (Polizei-Bewerbung und Qualifikationen) – wie bei Appy:
 * Text, Auswahl (Multiple choice) oder Rollen-Auswahl, jeweils mit Prüf-Einstellungen.
 */
export const FORM_QUESTION_TYPES = { TEXT: 'Text', CHOICE: 'Multiple choice', ROLE: 'Role select' } as const;
export type FormQuestionType = keyof typeof FORM_QUESTION_TYPES;

/** Auswahl-Option; bei Rollen-Auswahl mit der Discord-Rolle, die bei Annahme vergeben wird. */
export interface FormOption { label: string; roleId?: string }
export interface FormField {
  key: string; label: string; required: boolean; maxLength: number;
  type?: FormQuestionType; minLength?: number; options?: FormOption[];
  /** Auswahl: mehrere Optionen erlaubt (sonst genau eine). */
  multiple?: boolean;
}
/** Vollständig ausgefüllt (alte Formulare kennen nur Text). */
export type Field = Required<Omit<FormField, 'options'>> & { options: FormOption[] };

export const MAX_FORM_QUESTIONS = 50;
export const MAX_FORM_OPTIONS = 25;

export function normalizeField(f: FormField): Field {
  const type = f.type ?? 'TEXT';
  return {
    key: f.key, label: f.label, required: f.required, type,
    minLength: type === 'TEXT' ? Math.max(0, f.minLength ?? 0) : 0,
    maxLength: f.maxLength,
    options: type === 'TEXT' ? [] : (f.options ?? []).slice(0, MAX_FORM_OPTIONS),
    multiple: type !== 'TEXT' && !!f.multiple,
  };
}

/** Freie Schlüssel `frage1`, `frage2` … (Antworten bleiben über Änderungen hinweg zugeordnet). */
export function freeFieldKey(used: Iterable<string>): string {
  const set = new Set(used);
  for (let n = 1; ; n++) if (!set.has(`frage${n}`)) return `frage${n}`;
}

export type AnswerCheck = { ok: true; text: string; roleIds: string[] } | { ok: false; error: string };
/**
 * Prüft eine Antwort gegen die Frage. Text: ein String; Auswahl/Rollen: die gewählten Beschriftungen.
 * Liefert den Anzeigetext (Auswahl mit „, “ verbunden) und die Rollen, die bei Annahme vergeben werden.
 */
export function checkAnswer(field: FormField, value: string | string[] | null | undefined): AnswerCheck {
  const f = normalizeField(field);
  if (f.type === 'TEXT') {
    const v = (Array.isArray(value) ? value.join('\n') : value ?? '').trim();
    if (!v) return f.required ? { ok: false, error: `„${f.label}“ ist eine Pflichtfrage.` } : { ok: true, text: '', roleIds: [] };
    if (v.length < f.minLength) return { ok: false, error: `Die Antwort auf „${f.label}“ ist zu kurz (mindestens ${f.minLength} Zeichen).` };
    if (v.length > f.maxLength) return { ok: false, error: `Die Antwort auf „${f.label}“ ist zu lang (höchstens ${f.maxLength} Zeichen).` };
    return { ok: true, text: v, roleIds: [] };
  }
  const picked = [...new Set((Array.isArray(value) ? value : value ? [value] : []).map((x) => x.trim()).filter(Boolean))];
  if (!picked.length) return f.required ? { ok: false, error: `Bitte bei „${f.label}“ etwas auswählen.` } : { ok: true, text: '', roleIds: [] };
  if (!f.multiple && picked.length > 1) return { ok: false, error: `Bei „${f.label}“ ist nur eine Auswahl erlaubt.` };
  const opts = picked.map((p) => f.options.find((o) => o.label === p));
  if (opts.some((o) => !o)) return { ok: false, error: `Ungültige Auswahl bei „${f.label}“.` };
  return { ok: true, text: picked.join(', '), roleIds: f.type === 'ROLE' ? opts.map((o) => o!.roleId).filter((r): r is string => !!r && /^\d{15,25}$/.test(r)) : [] };
}

// ---- Bewerbungs-Einstellungen wie bei Appy: Texte mit Variablen ----
export const APPLICATION_VARIABLES = {
  '{applicationName}': 'Name der Bewerbung (z. B. Polizeianwärter, Flugstaffel)',
  '{user}': 'Wer entschieden hat (Erwähnung)',
  '{applicant}': 'Der Bewerber (Erwähnung)',
  '{number}': 'Bewerbungsnummer',
  '{reason}': 'Grund (falls angegeben)',
  '{questionCount}': 'Anzahl der Fragen',
  '{timeLimit}': 'Zeitlimit, z. B. 3 Stunden',
} as const;
export type ApplicationVars = Partial<Record<keyof typeof APPLICATION_VARIABLES, string>>;
export const DEFAULT_APPLICATION_MESSAGES = {
  accepted: '🎉 Deine Bewerbung als `{applicationName}` ({number}) wurde von {user} **angenommen**!',
  denied: 'Deine Bewerbung als `{applicationName}` ({number}) wurde von {user} leider **abgelehnt**. Du kannst dich später gerne erneut bewerben.',
  confirmation: 'Bist du sicher, dass du dich bewerben möchtest?\n\nSobald du startest, schicke ich dir nacheinander **{questionCount} Fragen**. Du hast **{timeLimit}** Zeit, die Bewerbung abzuschließen – sonst musst du neu starten. Abbrechen kannst du jederzeit über den Button.',
  completion: '✅ Deine Bewerbung **{number}** ist eingegangen! Das Team prüft sie – die Entscheidung bekommst du hier per Direktnachricht.',
} as const;
/** Ersetzt bekannte Variablen; ein Grund wird angehängt, wenn der Text `{reason}` nicht selbst enthält. */
export function renderApplicationText(text: string, vars: ApplicationVars, appendReason = false): string {
  const out = text.replace(/\{[a-zA-Z]+\}/g, (m) => (m in vars ? vars[m as keyof ApplicationVars] ?? '' : m));
  return appendReason && vars['{reason}'] && !text.includes('{reason}') ? `${out}\n\n**Grund:** ${vars['{reason}']}` : out;
}
export const formatMinutes = (min: number) => {
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return [d ? `${d} ${d === 1 ? 'Tag' : 'Tage'}` : '', h ? `${h} ${h === 1 ? 'Stunde' : 'Stunden'}` : '', m ? `${m} ${m === 1 ? 'Minute' : 'Minuten'}` : ''].filter(Boolean).join(' ') || '0 Minuten';
};
/** Rollen-Voraussetzung: „alle“ oder „mindestens eine“ der Rollen. */
export const rolesMatch = (have: string[], ids: string[], mode: 'ALL' | 'ANY') => (mode === 'ALL' ? ids.every((r) => have.includes(r)) : ids.some((r) => have.includes(r)));
