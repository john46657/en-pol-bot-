import { QuestionType } from '@nexus/types';
import type { Question, AnswerValue } from '@nexus/types';

/**
 * Antwort-Validierung (§10–§12, §18 Schritt 3).
 *
 * Eingangs ein roher Wert (DM-Nachricht, Formular-Feld). Ausgang: entweder
 * ein normalisierter, gespeicherter Wert ODER verständliche Fehlermeldungen,
 * die dem Bewerber gezeigt werden. Niemals Antworten verlieren (§18): bei
 * Fehlern wird die Frage erneut gestellt, die Antwort NICHT gespeichert.
 */

export interface AnswerValidationResult {
  ok: boolean;
  /** Normalisierter Wert zum Speichern. */
  value: AnswerValue;
  /** Fehlermeldungen für den Bewerber. */
  errors: string[];
}

const SNOWFLAKE_PATTERN = /^\d{17,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_FORMATS = [/^(\d{4})-(\d{2})-(\d{2})$/, /^(\d{2})\.(\d{2})\.(\d{4})$/];

export function validateAnswer(question: Question, raw: AnswerValue): AnswerValidationResult {
  const errors: string[] = [];

  // Display-only Fragen speichern keine Antwort.
  if (
    question.type === QuestionType.PARAGRAPH ||
    question.type === QuestionType.INFO ||
    question.type === QuestionType.SEPARATOR
  ) {
    return { ok: true, value: null, errors: [] };
  }

  const rawString = Array.isArray(raw)
    ? raw
        .map((v) => String(v).trim())
        .filter(Boolean)
        .join(', ')
    : typeof raw === 'string'
      ? raw
      : raw === null || raw === undefined
        ? ''
        : String(raw);

  // Normalisierung
  let text = rawString;
  if (question.validation?.trim !== false) text = text.trim();
  if (question.validation?.autoCase) {
    text =
      question.validation.autoCase === 'upper'
        ? text.toUpperCase()
        : question.validation.autoCase === 'lower'
          ? text.toLowerCase()
          : text.charAt(0).toUpperCase() + text.slice(1);
  }

  // Nicht erforderlich + leer ⇒ kein Wert
  if (text.length === 0) {
    if (question.required) {
      errors.push('Diese Frage ist verpflichtend. Bitte antworte auf sie.');
      return { ok: false, value: null, errors };
    }
    return { ok: true, value: null, errors: [] };
  }

  const v = question.validation ?? {};
  const type = question.type;

  // --- Text-artige Fragen -------------------------------------------------
  if (type === QuestionType.TEXT || type === QuestionType.USERNAME) {
    if (v.minLength && text.length < v.minLength) {
      errors.push(`Mindestens ${v.minLength} Zeichen (du hast ${text.length}).`);
    }
    if (v.maxLength && text.length > v.maxLength) {
      errors.push(`Maximal ${v.maxLength} Zeichen.`);
    }
    if (v.pattern) {
      try {
        const regex = new RegExp(v.pattern, v.caseSensitive === false ? '' : 'i');
        if (!regex.test(text)) errors.push('Das Format deiner Antwort ist ungültig.');
      } catch {
        errors.push('Diese Frage hat eine ungültige Validierung (bitte Staff informieren).');
      }
    }
    if (v.allowedCharacters) {
      const allowed = new Set([...v.allowedCharacters]);
      const invalid = [...new Set([...text])].filter((c) => !allowed.has(c));
      if (invalid.length > 0) errors.push(`Ungültige Zeichen: ${invalid.join(', ')}`);
    }
    if (type === QuestionType.USERNAME && (text.length < 2 || text.length > 32)) {
      errors.push('Ein Discord-Username hat 2–32 Zeichen.');
    }
  } else if (type === QuestionType.LONG_TEXT) {
    const min = v.minLength ?? 0;
    const max = v.maxLength ?? 4000;
    const words = text.split(/\s+/).filter(Boolean).length;
    if (text.length < min) errors.push(`Mindestens ${min} Zeichen.`);
    if (text.length > max) errors.push(`Maximal ${max} Zeichen.`);
    if (words === 0) errors.push('Bitte gib einen Text ein.');
  } else if (type === QuestionType.NUMBER || type === QuestionType.DECIMAL) {
    const parsed = parseNumber(text);
    if (parsed === null) {
      errors.push('Bitte gib eine gültige Zahl ein.');
    } else {
      if (v.min !== undefined && parsed < v.min) errors.push(`Mindestens ${formatNumber(v.min)}.`);
      if (v.max !== undefined && parsed > v.max) errors.push(`Maximal ${formatNumber(v.max)}.`);
      if (type === QuestionType.NUMBER && !Number.isInteger(parsed)) {
        errors.push('Bitte gib eine ganze Zahl ein.');
      }
      if (errors.length === 0) return { ok: true, value: parsed, errors };
    }
  } else if (type === QuestionType.DATE) {
    const iso = parseDate(text);
    if (iso === null) {
      errors.push('Ungültiges Datum. Bitte TT.MM.JJJJ verwenden (z. B. 24.09.2026).');
    } else {
      return { ok: true, value: iso, errors };
    }
  } else if (type === QuestionType.TIME) {
    const normalized = text.replace(/[.:,]/g, ':');
    if (!TIME_PATTERN.test(normalized)) {
      errors.push('Ungültige Uhrzeit. Bitte HH:mm verwenden (z. B. 18:30).');
    } else {
      return { ok: true, value: normalized, errors };
    }
  } else if (type === QuestionType.DATETIME) {
    const parts = text.trim().split(/[\sT]+/);
    if (parts.length < 2) {
      errors.push('Bitte Datum und Uhrzeit angeben (z. B. 24.09.2026 18:30).');
    } else {
      const iso = parseDate(parts[0] as string);
      const time = (parts[1] as string).replace(/[.:,]/g, ':');
      if (iso === null || !TIME_PATTERN.test(time)) {
        errors.push('Ungültiges Datum/Uhrzeit (Format: TT.MM.JJJJ HH:mm).');
      } else {
        return { ok: true, value: `${iso}T${time}:00`, errors };
      }
    }
  } else if (
    type === QuestionType.YES_NO ||
    type === QuestionType.CONFIRMATION ||
    type === QuestionType.CHECKBOX
  ) {
    const parsed = parseBoolean(text);
    if (parsed === null) {
      errors.push('Bitte antworte mit Ja oder Nein.');
    } else {
      return { ok: true, value: parsed, errors };
    }
  } else if (type === QuestionType.SINGLE_SELECT) {
    const match = findOption(question, text);
    if (!match) {
      errors.push('Bitte wähle eine der vorgegebenen Optionen.');
    } else {
      return { ok: true, value: match.value, errors };
    }
  } else if (type === QuestionType.MULTI_SELECT || type === QuestionType.MULTI_CHECKBOX) {
    const tokens = text
      .split(/[,;\n]|\s{2,}/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tokens.length === 0) {
      errors.push('Bitte wähle mindestens eine Option.');
    } else {
      const matched = tokens.map((t) => findOption(question, t)).filter((o) => o !== null);
      if (matched.length !== tokens.length) {
        errors.push('Eine deiner Angaben ist keine gültige Option.');
      } else {
        const minSel = v.minSelections ?? 1;
        if (matched.length < minSel) errors.push(`Mindestens ${minSel} Option(en).`);
        if (v.maxSelections && matched.length > v.maxSelections) {
          errors.push(`Maximal ${v.maxSelections} Option(en).`);
        }
        if (errors.length === 0) {
          return { ok: true, value: matched.map((o) => o!.value), errors };
        }
      }
    }
  } else if (type === QuestionType.RATING || type === QuestionType.SLIDER) {
    const parsed = parseNumber(text);
    if (parsed === null) {
      errors.push('Bitte gib eine Zahl ein.');
    } else {
      const min = v.min ?? 1;
      const max = v.max ?? (type === QuestionType.RATING ? 5 : 10);
      if (parsed < min || parsed > max) errors.push(`Bitte eine Zahl zwischen ${min} und ${max}.`);
      if (errors.length === 0) return { ok: true, value: parsed, errors };
    }
  } else if (type === QuestionType.URL) {
    try {
      const url = new URL(text);
      if (!['http:', 'https:'].includes(url.protocol)) {
        errors.push('Bitte einen http/https-Link angeben.');
      } else {
        return { ok: true, value: url.toString(), errors };
      }
    } catch {
      errors.push('Bitte einen gültigen Link angeben.');
    }
  } else if (type === QuestionType.EMAIL) {
    if (!EMAIL_PATTERN.test(text)) errors.push('Bitte eine gültige E-Mail-Adresse angeben.');
    else return { ok: true, value: text.toLowerCase(), errors };
  } else if (type === QuestionType.PHONE) {
    const digits = text.replace(/[^\d+]/g, '');
    if (digits.replace(/\D/g, '').length < 6 || digits.length > 20) {
      errors.push('Bitte eine gültige Telefonnummer angeben.');
    } else {
      return { ok: true, value: digits, errors };
    }
  } else if (
    type === QuestionType.DISCORD_USER ||
    type === QuestionType.DISCORD_ROLE ||
    type === QuestionType.DISCORD_CHANNEL
  ) {
    const id = text.replace(/[<@#!&>]/g, '');
    if (!SNOWFLAKE_PATTERN.test(id)) {
      errors.push('Ungültige Discord-ID. Bitte per Rechtsklink kopieren (ID kopieren).');
    } else {
      return { ok: true, value: id, errors };
    }
  } else if (
    type === QuestionType.FILE ||
    type === QuestionType.IMAGE ||
    type === QuestionType.ATTACHMENT
  ) {
    // Attachments werden über den Attachment-Pipeline geprüft (MIME, Größe, §50).
    // Hier kommt die Discord-Attachment-URL an.
    try {
      const url = new URL(text);
      if (!['http:', 'https:'].includes(url.protocol)) {
        errors.push('Anhang konnte nicht zugeordnet werden.');
      } else {
        return { ok: true, value: url.toString(), errors };
      }
    } catch {
      errors.push('Bitte lade einen Anhang hoch.');
    }
  }

  if (errors.length > 0) return { ok: false, value: null, errors };
  return { ok: true, value: text, errors };
}

// --- Helfer ---------------------------------------------------------------

function parseNumber(input: string): number | null {
  const cleaned = input.replace(/,/g, '.').trim();
  if (cleaned.length === 0) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function parseBoolean(input: string): boolean | null {
  const lower = input.trim().toLowerCase();
  if (['ja', 'yes', 'y', 'true', '1', 'stimmt', 'zufrieden'].includes(lower)) return true;
  if (['nein', 'no', 'n', 'false', '0', 'ne'].includes(lower)) return false;
  return null;
}

function parseDate(input: string): string | null {
  const trimmed = input.trim();
  for (const fmt of DATE_FORMATS) {
    const match = trimmed.match(fmt);
    if (!match) continue;
    const [, a, b, c] = match;
    if (!a || !b || !c) continue;
    // YYYY-MM-DD vs DD.MM.YYYY
    const [year, month, day] = a.length === 4 ? [a, b, c] : [c, b, a];
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      date.getUTCFullYear() === Number(year) &&
      date.getUTCMonth() === Number(month) - 1 &&
      date.getUTCDate() === Number(day)
    ) {
      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

/** Option per Wert, Beschriftung oder – als Komfort in der DM – 1-basierter Nummer aus der angezeigten Liste. */
function findOption(question: Question, text: string): { value: string } | null {
  const options = (question.options ?? []).filter((o) => o.enabled);
  const lower = text.trim().toLowerCase();
  const exact =
    options.find((o) => o.value.toLowerCase() === lower) ??
    options.find((o) => o.label.toLowerCase() === lower);
  if (exact) return exact;
  if (/^\d{1,3}$/.test(lower)) return options[Number(lower) - 1] ?? null;
  return null;
}
