/**
 * Ticket-System – Erweiterungen (Panels mit eigenen Limits/Automatik, Auslastung, Automatisierungen je Ticket,
 * Bewertungsskala, Statistik-Hilfen). Reine Funktionen: gleiche Regeln in API, Bot und Dashboard.
 */

// ---------------- Auslastung ----------------
export type LoadLevel = 'none' | 'normal' | 'warn' | 'full';
/** Warnanzeige ab diesem Anteil der Auslastungsgrenze, „voll“ ab 100 %. */
export const LOAD_WARN_RATIO = 0.8;
/** Auslastung einer Kategorie: ohne Grenze `none`, unter 80 % `normal`, ab 80 % `warn`, ab 100 % `full`. */
export function loadLevel(open: number, capacity: number): LoadLevel {
  if (!capacity || capacity <= 0) return 'none';
  if (open >= capacity) return 'full';
  if (open >= capacity * LOAD_WARN_RATIO) return 'warn';
  return 'normal';
}
export const LOAD_DOT: Record<LoadLevel, string> = { none: '🔵', normal: '🟢', warn: '🟡', full: '🔴' };
export const LOAD_LABEL: Record<LoadLevel, string> = { none: 'ohne Grenze', normal: 'normal', warn: 'stark ausgelastet', full: 'voll ausgelastet' };
/** Verhalten bei voller Auslastung: neue Tickets verhindern oder trotzdem öffnen (mit Hinweis an Ersteller und Team). */
export const CAPACITY_ACTIONS = { BLOCK: 'Neue Tickets verhindern', WARN: 'Trotzdem öffnen, mit Hinweis' } as const;
export type CapacityAction = keyof typeof CAPACITY_ACTIONS;

// ---------------- Automatisierungen ----------------
/**
 * Alle Automatisierungen eines Tickets. Minuten-Werte: 0 = aus.
 * Panels legen Standardwerte fest; eine Kategorie übernimmt sie (`automationSource = PANEL`) oder nutzt eigene Werte (`CATEGORY`).
 */
export interface TicketAutomation {
  /** automatisch schließen nach so vielen Minuten ohne Aktivität */
  autoCloseMinutes: number;
  /** Warnung so viele Minuten vor dem automatischen Schließen */
  autoCloseWarnMinutes: number;
  /** Ersteller erinnern, wenn er so lange nicht auf das Team geantwortet hat */
  creatorReminderMinutes: number;
  /** Team erinnern, wenn ein Ticket so lange ohne Antwort des Teams ist (nicht übernommene Tickets) */
  teamReminderMinutes: number;
  /** Bearbeiter markieren, wenn ein übernommenes Ticket so lange ruht; nach derselben Zeit freigeben */
  staffAlertMinutes: number;
  /** Übernahme freigeben nach so vielen Minuten ohne Aktivität */
  autoUnclaimMinutes: number;
  /** erstes Teammitglied, das schreibt, übernimmt das Ticket */
  autoClaimOnMessage: boolean;
  /** nach bestätigter Schließungsanfrage automatisch schließen */
  closeRequestCloses: boolean;
  /** Schließungsanfrage ohne Reaktion nach so vielen Minuten: Ticket schließen */
  closeRequestTimeoutMinutes: number;
  /** automatische Antwort an den Ersteller, wenn das Team so lange nicht reagiert hat */
  noResponseMinutes: number;
}
export const AUTOMATION_KEYS = ['autoCloseMinutes', 'autoCloseWarnMinutes', 'creatorReminderMinutes', 'teamReminderMinutes', 'staffAlertMinutes', 'autoUnclaimMinutes', 'autoClaimOnMessage', 'closeRequestCloses', 'closeRequestTimeoutMinutes', 'noResponseMinutes'] as const satisfies readonly (keyof TicketAutomation)[];
export const AUTOMATION_LABELS: Record<keyof TicketAutomation, string> = {
  autoCloseMinutes: 'Automatisch schließen nach Inaktivität', autoCloseWarnMinutes: 'Warnung vor dem automatischen Schließen', creatorReminderMinutes: 'Erinnerung an den Ersteller',
  teamReminderMinutes: 'Team-Erinnerung (nicht übernommen)', staffAlertMinutes: 'Bearbeiter-Erinnerung, danach Freigabe', autoUnclaimMinutes: 'Übernahme automatisch freigeben',
  autoClaimOnMessage: 'Automatisch übernehmen bei erster Teamantwort', closeRequestCloses: 'Schließen nach bestätigter Schließungsanfrage',
  closeRequestTimeoutMinutes: 'Schließungsanfrage ohne Reaktion → schließen', noResponseMinutes: 'Automatische Antwort, wenn das Team nicht reagiert',
};
export const DEFAULT_AUTOMATION: TicketAutomation = {
  autoCloseMinutes: 0, autoCloseWarnMinutes: 0, creatorReminderMinutes: 0, teamReminderMinutes: 0, staffAlertMinutes: 0, autoUnclaimMinutes: 0,
  autoClaimOnMessage: false, closeRequestCloses: true, closeRequestTimeoutMinutes: 0, noResponseMinutes: 0,
};
export const AUTOMATION_SOURCES = { CATEGORY: 'Eigene Werte der Kategorie', PANEL: 'Standardwerte des Panels übernehmen' } as const;
export type AutomationSource = keyof typeof AUTOMATION_SOURCES;

/** Gespeicherte (evtl. unvollständige/alte) Panel-Werte sicher lesen. */
export function parseAutomation(raw: unknown): TicketAutomation {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_AUTOMATION };
  for (const k of AUTOMATION_KEYS) {
    const v = o[k];
    if (typeof DEFAULT_AUTOMATION[k] === 'boolean') { if (typeof v === 'boolean') (out as Record<string, unknown>)[k] = v; }
    else if (typeof v === 'number' && Number.isFinite(v) && v >= 0) (out as Record<string, unknown>)[k] = Math.floor(v);
  }
  return out;
}

/** Wirksame Automatik eines Tickets: Kategorie-Werte oder (bei `PANEL`) die Standardwerte des Panels, aus dem das Ticket stammt. */
export function effectiveAutomation(cat: Partial<TicketAutomation> & { automationSource?: string | null }, panelAutomation?: unknown): TicketAutomation {
  if (cat.automationSource === 'PANEL' && panelAutomation !== undefined && panelAutomation !== null) return parseAutomation(panelAutomation);
  return parseAutomation(cat);
}

/** Läuft die Automatik für dieses Ticket? (dauerhaft aus oder bis zu einem Zeitpunkt pausiert) – gespeichert, übersteht Neustarts. */
export function automationActive(t: { automationDisabled?: boolean | null; automationPausedUntil?: Date | string | null }, now = new Date()): boolean {
  if (t.automationDisabled) return false;
  if (t.automationPausedUntil && new Date(t.automationPausedUntil).getTime() > now.getTime()) return false;
  return true;
}

// ---------------- Schließungsanfrage ----------------
/** Wer eine Schließungsanfrage bestätigen muss. */
export const CLOSE_REQUEST_APPROVERS = { CREATOR: 'Ersteller', STAFF: 'Zuständiger Mitarbeiter', BOTH: 'Ersteller und zuständiger Mitarbeiter', ANY: 'Ersteller oder zuständiger Mitarbeiter' } as const;
export type CloseRequestApprovers = keyof typeof CLOSE_REQUEST_APPROVERS;
/** Sind alle erforderlichen Bestätigungen da? `creator`/`staff`: hat der Ersteller bzw. ein zuständiger Mitarbeiter bestätigt. */
export function closeRequestComplete(mode: string, a: { creator: boolean; staff: boolean }): boolean {
  switch (mode) {
    case 'STAFF': return a.staff;
    case 'BOTH': return a.creator && a.staff;
    case 'ANY': return a.creator || a.staff;
    default: return a.creator;
  }
}

// ---------------- Bewertungen ----------------
export const RATING_SCALE_MIN = 2;
export const RATING_SCALE_MAX = 10;
/** Beschriftung eines Bewertungs-Buttons: 1–5 als Sterne, größere Skalen als Zahl. */
export const ratingLabel = (n: number, scale: number) => (scale <= 5 ? '⭐'.repeat(n) : `${n}/${scale}`);
/** Bewertung auf eine andere Skala umrechnen (z. B. 8/10 → 4/5), auf zwei Stellen gerundet. */
export const normalizeRating = (stars: number, scale: number, to = 5) => Math.round((stars / Math.max(1, scale)) * to * 100) / 100;
/** positiv/negativ unabhängig von der Skala (oberes bzw. unteres Drittel). */
export const ratingTone = (stars: number, scale: number): 'positive' | 'neutral' | 'negative' => { const r = stars / Math.max(1, scale); return r >= 0.7 ? 'positive' : r <= 0.4 ? 'negative' : 'neutral'; };

// ---------------- Statistik ----------------
export function median(xs: number[]): number | null { return percentile(xs, 50); }
/** Perzentil (lineare Interpolation, wie Excel PERZENTIL.INKL); leere Liste → null. */
export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (Math.min(100, Math.max(0, p)) / 100) * (s.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}
/** Wochentag (0 = Montag … 6 = Sonntag) und Stunde einer Zeit in einer Zeitzone (für die Aktivitäts-Heatmap). */
export function weekdayHour(d: Date, timeZone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  return { weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(wd), hour };
}
/** Kalendertag (JJJJ-MM-TT) in einer Zeitzone. */
export const ticketDayKey = (d: Date, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
/** Montag der Woche (JJJJ-MM-TT) in einer Zeitzone. */
export function ticketWeekKey(d: Date, timeZone: string): string {
  const day = ticketDayKey(d, timeZone);
  const { weekday } = weekdayHour(d, timeZone);
  const base = new Date(`${day}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() - weekday);
  return base.toISOString().slice(0, 10);
}
