/**
 * Ticket-System (Erweiterung): dauerhafte Ticket-IDs, Formular-Prüfung (Discord-Formular und Dashboard-Vorschau nutzen
 * dieselbe Funktion), Aufteilung in Discord-Formulare, Statusübergänge und SLA-Berechnung. Keine Abhängigkeiten zu Discord/DB.
 */
import type { QuestionType, TicketQuestion } from './tickets';

// ---------------- Ticket-IDs ----------------
export const DEFAULT_TICKET_REF_PREFIX = 'EMD';
/** Dauerhafte, lesbare Ticket-ID aus der fortlaufenden Nummer, z. B. `EMD-000123` (Nummern werden nie wiederverwendet). */
export const ticketRef = (n: number, prefix = DEFAULT_TICKET_REF_PREFIX, digits = 6) => `${prefix}-${String(n).padStart(digits, '0')}`;
/** `EMD-000123`, `#123` oder `123` → 123; alles andere → null. */
export function parseTicketRef(s: string): number | null {
  const m = s.trim().match(/^(?:[A-Za-z]{2,8}-|#)?0*(\d{1,9})$/);
  const n = m ? Number(m[1]) : 0;
  return n > 0 ? n : null;
}

// ---------------- Formulare ----------------
/** Rohwert aus Discord-Formular oder Dashboard-Vorschau. */
export type FormRawValue = string | string[] | boolean | null | undefined;
export interface FormFile { name: string; size: number; contentType?: string | null; url: string }
/** Gespeicherte Antwort – Bezeichnung und Typ werden mitgespeichert, damit spätere Formularänderungen alte Tickets nicht verändern. */
export interface FormAnswer { questionId: string; label: string; type: QuestionType; value: string; files?: FormFile[] }
export interface FormOptions { maxFileBytes?: number; allowedFileTypes?: readonly string[] }

export const FORM_FILE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'] as const;
export const FORM_MAX_FILE_BYTES = 8 * 1024 * 1024;
export const YES_NO = ['Ja', 'Nein'] as const;
/** Text-Obergrenze, wenn im Feld nichts eingestellt ist (Discord-Formular: 4000). */
const TEXT_MAX = 4000;
const asText = (v: FormRawValue) => (Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Ja' : '') : (v ?? '')).trim();
const asList = (v: FormRawValue) => [...new Set((Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []).map((x) => x.trim()).filter(Boolean))];

export const activeFields = (fields: TicketQuestion[]) => fields.filter((f) => f.enabled !== false);
/** Auswahloptionen eines Felds (Ja/Nein und Kontrollkästchen haben feste Werte). */
export const fieldOptions = (q: TicketQuestion): string[] => (q.type === 'YESNO' ? [...YES_NO] : q.type === 'CHECKBOX' ? ['Ja'] : q.options);

/** Datum `TT.MM.JJJJ` oder `JJJJ-MM-TT` → `TT.MM.JJJJ`, sonst null (auch ungültige Tage wie 31.02.). */
export function parseFormDate(s: string): string | null {
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/), iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!de && !iso) return null;
  const [d, mo, y] = de ? [Number(de[1]), Number(de[2]), Number(de[3])] : [Number(iso![3]), Number(iso![2]), Number(iso![1])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || y < 1900 || y > 2200) return null;
  return `${String(d).padStart(2, '0')}.${String(mo).padStart(2, '0')}.${y}`;
}

/** Prüft ein einzelnes Feld. `value`: Anzeige-/Speicherwert; `skipped`: optional und leer. */
export function validateField(q: TicketQuestion, raw: FormRawValue, files: FormFile[] = [], o: FormOptions = {}): { error?: string; value?: string; skipped?: boolean; files?: FormFile[] } {
  const req = (empty: boolean) => (empty ? (q.required ? { error: 'Pflichtfeld – bitte ausfüllen.' } : { skipped: true, value: '—' }) : null);
  switch (q.type) {
    case 'SHORT': case 'LONG': {
      const v = asText(raw);
      const r = req(!v); if (r) return r;
      if (q.minLength && v.length < q.minLength) return { error: `Die Antwort ist zu kurz (mindestens ${q.minLength} Zeichen, aktuell ${v.length}).` };
      const max = q.maxLength ?? TEXT_MAX;
      if (v.length > max) return { error: `Die Antwort ist zu lang (höchstens ${max} Zeichen, aktuell ${v.length}).` };
      return { value: v };
    }
    case 'SELECT': case 'YESNO': {
      const vs = asList(raw);
      const r = req(!vs.length); if (r) return r;
      if (vs.length > 1 || !fieldOptions(q).includes(vs[0]!)) return { error: 'Ungültige Auswahl.' };
      return { value: vs[0]! };
    }
    case 'MULTI': {
      const vs = asList(raw);
      const r = req(!vs.length); if (r) return r;
      if (vs.some((v) => !q.options.includes(v))) return { error: 'Ungültige Auswahl.' };
      return { value: vs.join(', ') };
    }
    case 'CHECKBOX': {
      const on = raw === true || asList(raw).some((v) => ['ja', 'true', '1', 'on'].includes(v.toLowerCase()));
      if (!on && q.required) return { error: 'Bitte bestätigen.' };
      return { value: on ? 'Ja' : 'Nein' };
    }
    case 'NUMBER': {
      const v = asText(raw);
      const r = req(!v); if (r) return r;
      if (!/^-?\d{1,12}([.,]\d{1,6})?$/.test(v)) return { error: 'Bitte eine Zahl eingeben (z. B. 12 oder 3,5).' };
      const n = Number(v.replace(',', '.'));
      if (q.min !== undefined && n < q.min) return { error: `Mindestens ${q.min}.` };
      if (q.max !== undefined && n > q.max) return { error: `Höchstens ${q.max}.` };
      return { value: String(n).replace('.', ',') };
    }
    case 'DATE': {
      const v = asText(raw);
      const r = req(!v); if (r) return r;
      const d = parseFormDate(v);
      return d ? { value: d } : { error: 'Bitte ein gültiges Datum im Format TT.MM.JJJJ eingeben.' };
    }
    case 'FILE': {
      const r = req(!files.length); if (r) return r;
      const max = Math.min(10, q.max ?? 1);
      if (files.length > max) return { error: `Höchstens ${max} Datei(en).` };
      const limit = o.maxFileBytes ?? FORM_MAX_FILE_BYTES, types = o.allowedFileTypes ?? FORM_FILE_TYPES;
      for (const f of files) {
        if (f.size > limit) return { error: `„${f.name}“ ist zu groß (höchstens ${Math.floor(limit / 1048576)} MB).` };
        if (!f.contentType || !types.includes(f.contentType.split(';')[0]!.trim())) return { error: `„${f.name}“: Dateityp nicht erlaubt (erlaubt: Bilder, PDF, Text).` };
      }
      return { value: files.map((f) => f.name).join(', '), files };
    }
  }
  return { error: 'Unbekannter Feldtyp.' };
}

/**
 * Prüft ein Formular (oder einen Schritt davon, `only`). Unbekannte Werte werden ignoriert, deaktivierte Felder nicht abgefragt.
 * Ergebnis in Formular-Reihenfolge – genau das wird am Ticket gespeichert.
 */
export function validateForm(fields: TicketQuestion[], raw: Record<string, FormRawValue>, files: Record<string, FormFile[]> = {}, o: FormOptions & { only?: string[] } = {}) {
  const errors: Record<string, string> = {};
  const answers: FormAnswer[] = [];
  for (const q of activeFields(fields)) {
    if (o.only && !o.only.includes(q.id)) continue;
    const r = validateField(q, raw[q.id], files[q.id] ?? [], o);
    if (r.error) errors[q.id] = r.error;
    else answers.push({ questionId: q.id, label: q.label, type: q.type, value: r.value ?? '—', ...(r.files?.length ? { files: r.files } : {}) });
  }
  return { ok: !Object.keys(errors).length, errors, answers };
}

/** Discord erlaubt höchstens 5 Eingaben je Formular → Felder in Schritte zu je 5 aufteilen (Reihenfolge bleibt). */
export const FORM_FIELDS_PER_MODAL = 5;
export function planFormSteps(fields: TicketQuestion[], perStep = FORM_FIELDS_PER_MODAL): string[][] {
  const ids = activeFields(fields).map((f) => f.id);
  const steps: string[][] = [];
  for (let i = 0; i < ids.length; i += perStep) steps.push(ids.slice(i, i + perStep));
  return steps;
}

/** Ein Feld im Discord-Formular (der Bot baut daraus die Komponenten). */
export interface FormModalField {
  id: string; label: string; description?: string; kind: 'text' | 'paragraph' | 'select' | 'file'; required: boolean;
  placeholder?: string; minLength?: number; maxLength?: number; value?: string;
  options?: { label: string; value: string; default?: boolean }[]; minValues?: number; maxValues?: number;
}
export interface FormModalSpec { id: string; title: string; fields: FormModalField[] }
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Discord-Formular für einen Schritt; `prefill`: zuletzt eingegebene Werte (nach einem Prüffehler erneut anzeigen). */
export function formModal(customId: string, title: string, fields: TicketQuestion[], prefill: Record<string, FormRawValue> = {}): FormModalSpec {
  return { id: customId, title: clip(title, 45), fields: fields.slice(0, FORM_FIELDS_PER_MODAL).map((q): FormModalField => {
    const base = { id: q.id, label: clip(q.label, 45), required: q.required, ...(q.description ? { description: clip(q.description, 100) } : {}) };
    const pre = prefill[q.id];
    switch (q.type) {
      case 'SHORT': case 'LONG': case 'NUMBER': case 'DATE': {
        const placeholder = q.placeholder ?? (q.type === 'NUMBER' ? 'Zahl, z. B. 12' : q.type === 'DATE' ? 'TT.MM.JJJJ' : undefined);
        return { ...base, kind: q.type === 'LONG' ? 'paragraph' : 'text', ...(placeholder ? { placeholder: clip(placeholder, 100) } : {}),
          ...(q.type === 'DATE' ? { maxLength: 10 } : q.type === 'NUMBER' ? { maxLength: 20 } : { maxLength: Math.min(TEXT_MAX, q.maxLength ?? TEXT_MAX), ...(q.minLength ? { minLength: q.minLength } : {}) }),
          ...(typeof pre === 'string' && pre ? { value: pre } : {}) };
      }
      case 'FILE': return { ...base, kind: 'file', minValues: q.required ? 1 : 0, maxValues: Math.min(10, q.max ?? 1) };
      default: {
        // Auswahl, Ja/Nein, Mehrfachauswahl, Bestätigung: Auswahlmenü im Formular
        const chosen = new Set(Array.isArray(pre) ? pre : typeof pre === 'string' ? [pre] : pre === true ? ['Ja'] : []);
        const options = fieldOptions(q).slice(0, 25).map((v) => ({ label: clip(v, 100), value: clip(v, 100), ...(chosen.has(v) ? { default: true } : {}) }));
        return { ...base, kind: 'select', options, minValues: q.required ? 1 : 0, maxValues: q.type === 'MULTI' ? options.length : 1, ...(q.placeholder ? { placeholder: clip(q.placeholder, 100) } : {}) };
      }
    }
  }) };
}

// ---------------- Status-Lebenszyklus ----------------
/** Feste Bedeutung eines Status (unabhängig vom änderbaren Namen). */
export const TICKET_STATUS_KEYS = {
  OPEN: 'Offen', CLAIMED: 'Übernommen', IN_PROGRESS: 'In Bearbeitung', WAITING_USER: 'Wartet auf Nutzer', WAITING_INTERNAL: 'Wartet auf interne Rückmeldung',
  RESOLVED: 'Gelöst', ESCALATED: 'Eskaliert', CLOSED: 'Geschlossen', ARCHIVED: 'Archiviert',
} as const;
export type TicketStatusKey = keyof typeof TICKET_STATUS_KEYS;
export interface StatusRef { kind: string; key?: string | null }
export type StatusChangeVia = 'status' | 'close' | 'reopen' | 'archive';

/** Zentrale Prüfung eines Statuswechsels; liefert den Grund, warum er nicht erlaubt ist (oder null). Rechte prüft der Aufrufer (`statusPermission`). */
export function checkStatusChange(from: StatusRef, to: StatusRef, via: StatusChangeVia): string | null {
  const f = from.kind, t = to.kind;
  switch (via) {
    case 'close': return f === 'OPEN' ? null : 'Das Ticket ist bereits geschlossen.';
    case 'reopen': return f !== 'OPEN' ? (t === 'OPEN' ? null : 'Wieder öffnen braucht einen offenen Status.') : 'Das Ticket ist bereits offen.';
    case 'archive': return f === 'ARCHIVED' ? 'Das Ticket ist bereits archiviert.' : f !== 'CLOSED' ? 'Nur geschlossene Tickets können archiviert werden.' : t === 'ARCHIVED' ? null : 'Kein Archiv-Status eingerichtet.';
    case 'status':
      if (f === 'OPEN') return t === 'OPEN' ? null : t === 'CLOSED' ? 'Zum Schließen bitte „Schließen“ benutzen (Grund, Transkript, Benachrichtigungen).' : 'Nur geschlossene Tickets können archiviert werden.';
      if (f === 'CLOSED') return t === 'OPEN' ? 'Geschlossene Tickets bitte über „Wieder öffnen“ öffnen.' : null;
      return 'Archivierte Tickets können nur über „Wieder öffnen“ (mit Archiv-Recht) geändert werden.';
  }
}
/** Recht, das ein Wechsel auf diesen Status braucht. */
export const statusPermission = (to: StatusRef) => (to.kind === 'ARCHIVED' ? 'ticket.archive' : 'ticket.change_status');

// ---------------- SLA ----------------
export interface SlaInput {
  createdAt: Date; firstResponseAt: Date | null; closedAt: Date | null; waitingSince: Date | null; waitingSeconds: number;
  firstResponseMinutes: number | null; resolutionMinutes: number | null;
}
/**
 * SLA nur mit eingestellten Zielzeiten (keine erfundenen Fristen). Die Lösungszeit ruht, solange auf den Nutzer gewartet wird.
 */
export function slaState(t: SlaInput, now = new Date()) {
  const firstDueAt = t.firstResponseMinutes ? new Date(t.createdAt.getTime() + t.firstResponseMinutes * 60_000) : null;
  const resolveDueAt = t.resolutionMinutes ? new Date(t.createdAt.getTime() + t.resolutionMinutes * 60_000 + t.waitingSeconds * 1000) : null;
  const paused = !!t.waitingSince;
  const open = !t.closedAt;
  return {
    firstDueAt, resolveDueAt, paused,
    firstOverdue: !!firstDueAt && open && !t.firstResponseAt && now > firstDueAt,
    resolveOverdue: !!resolveDueAt && open && !paused && now > resolveDueAt,
  };
}
