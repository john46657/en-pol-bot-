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
