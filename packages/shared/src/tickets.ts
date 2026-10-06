/**
 * Ticket-System: gemeinsame Kataloge (Aktionen, Fragetypen, Platzhalter) und Hilfsfunktionen.
 * Kategorien, Status, Prioritäten, Texte, Rollen usw. liegen ausschließlich in der Datenbank (Dashboard).
 */

/** Alle Ticket-Aktionen mit Standard-Button und benötigtem Recht. `state`: wann der Button am Ticket erscheint. */
export const TICKET_ACTIONS = {
  close: { label: 'Schließen', emoji: '🔒', style: 'danger', state: 'open', permission: 'ticket.close' },
  /** Team fragt den Ersteller, ob das Ticket geschlossen werden kann (wie GalaxyBot „Close-Request“). */
  close_request: { label: 'Schließen anfragen', emoji: '❓', style: 'secondary', state: 'open', permission: 'ticket.close' },
  reopen: { label: 'Wieder öffnen', emoji: '🔓', style: 'success', state: 'closed', permission: 'ticket.reopen' },
  claim: { label: 'Übernehmen', emoji: '👤', style: 'primary', state: 'open', permission: 'ticket.claim' },
  unclaim: { label: 'Freigeben', emoji: '↩️', style: 'secondary', state: 'open', permission: 'ticket.claim' },
  add_user: { label: 'Hinzufügen', emoji: '➕', style: 'secondary', state: 'open', permission: 'ticket.add_user' },
  remove_user: { label: 'Entfernen', emoji: '➖', style: 'secondary', state: 'open', permission: 'ticket.remove_user' },
  priority: { label: 'Priorität', emoji: '🔔', style: 'secondary', state: 'open', permission: 'ticket.change_priority' },
  status: { label: 'Status', emoji: '🏷️', style: 'secondary', state: 'open', permission: 'ticket.change_status' },
  category: { label: 'Kategorie', emoji: '🗂️', style: 'secondary', state: 'open', permission: 'ticket.change_category' },
  rename: { label: 'Umbenennen', emoji: '✏️', style: 'secondary', state: 'open', permission: 'ticket.rename' },
  move: { label: 'Verschieben', emoji: '📁', style: 'secondary', state: 'both', permission: 'ticket.move' },
  transcript: { label: 'Transcript', emoji: '📋', style: 'secondary', state: 'both', permission: 'ticket.transcript' },
  lock: { label: 'Sperren', emoji: '⛔', style: 'secondary', state: 'open', permission: 'ticket.lock' },
  unlock: { label: 'Entsperren', emoji: '✅', style: 'secondary', state: 'open', permission: 'ticket.lock' },
  escalate: { label: 'Eskalieren', emoji: '🟠', style: 'danger', state: 'open', permission: 'ticket.escalate' },
  note: { label: 'Notiz', emoji: '🗒️', style: 'secondary', state: 'both', permission: 'ticket.internal_notes' },
  rating: { label: 'Bewertung', emoji: '⭐', style: 'secondary', state: 'closed', permission: 'ticket.rate' },
  delete: { label: 'Löschen', emoji: '🗑️', style: 'danger', state: 'closed', permission: 'ticket.delete' },
} as const;
export type TicketAction = keyof typeof TICKET_ACTIONS;
export const TICKET_ACTION_KEYS = Object.keys(TICKET_ACTIONS) as TicketAction[];
export type ButtonStyleName = 'primary' | 'secondary' | 'success' | 'danger';

/** Konfiguration eines Buttons am Ticket (pro Kategorie im Dashboard). */
export interface TicketButtonConfig { action: TicketAction; label: string; emoji?: string; style: ButtonStyleName; enabled: boolean }
export const defaultTicketButtons = (): TicketButtonConfig[] =>
  (['close', 'close_request', 'claim', 'unclaim', 'add_user', 'remove_user', 'priority', 'transcript', 'escalate', 'note', 'reopen', 'delete'] as TicketAction[])
    .map((action) => ({ action, label: TICKET_ACTIONS[action].label, emoji: TICKET_ACTIONS[action].emoji, style: TICKET_ACTIONS[action].style as ButtonStyleName, enabled: true }));

export const QUESTION_TYPES = { SHORT: 'Kurze Antwort', LONG: 'Lange Antwort', YESNO: 'Ja/Nein', SELECT: 'Auswahl', MULTI: 'Mehrere Optionen' } as const;
export type QuestionType = keyof typeof QUESTION_TYPES;
export interface TicketQuestion {
  id: string; label: string; type: QuestionType; required: boolean; options: string[]; placeholder?: string;
  /** Beschreibung unter der Frage; Zeichenlimit für Text-Antworten (wie GalaxyBot). */
  description?: string; minLength?: number; maxLength?: number;
}

export const CLAIM_MODES = { SINGLE: 'Nur ein Bearbeiter', MULTI: 'Mehrere Bearbeiter', PRIMARY: 'Hauptbearbeiter + Helfer' } as const;
export type ClaimMode = keyof typeof CLAIM_MODES;
export const CLOSE_REASON_MODES = { NONE: 'Kein Grund', OPTIONAL: 'Grund optional', REQUIRED: 'Grund erforderlich' } as const;
export type CloseReasonMode = keyof typeof CLOSE_REASON_MODES;
export const CLOSE_REASON_SOURCES = { PRESET: 'Feste Gründe', CUSTOM: 'Eigener Grund', BOTH: 'Beides' } as const;
export type CloseReasonSource = keyof typeof CLOSE_REASON_SOURCES;
export const STATUS_KINDS = { OPEN: 'Offen (aktiv)', CLOSED: 'Geschlossen', ARCHIVED: 'Archiviert' } as const;
export type StatusKind = keyof typeof STATUS_KINDS;

/** Platzhalter für alle Ticket-Texte (Dashboard zeigt diese Liste). */
export const TICKET_PLACEHOLDERS = {
  '{user}': 'Erwähnung des Ticket-Erstellers (@User)',
  '{username}': 'Discord-Name des Erstellers',
  '{user_id}': 'Discord-ID des Erstellers',
  '{ticket_id}': 'Ticket-Nummer, z. B. 0042',
  '{category}': 'Name der Ticket-Kategorie',
  '{staff}': 'Bearbeiter (Erwähnungen) bzw. „niemand“',
  '{status}': 'Aktueller Status',
  '{priority}': 'Aktuelle Priorität',
  '{reason}': 'Schließungsgrund',
  '{closed_by}': 'Wer geschlossen hat',
  '{created_at}': 'Erstellt am (Datum + Uhrzeit)',
  '{closed_at}': 'Geschlossen am (Datum + Uhrzeit)',
  '{channel}': 'Ticket-Channel (#…)',
  '{actor}': 'Wer die Aktion ausgelöst hat (@…)',
} as const;

export type TicketVars = Partial<Record<keyof typeof TICKET_PLACEHOLDERS, string>>;
/** Ersetzt bekannte Platzhalter; unbekannte bleiben stehen (Tippfehler fallen so auf). */
export function renderTicketText(text: string, vars: TicketVars): string {
  return text.replace(/\{[a-z_]+\}/g, (m) => (m in vars ? vars[m as keyof TicketVars] ?? '' : m));
}

/** Channel-Name aus dem Format der Kategorie (Discord: klein, a-z 0-9 - _, max. 100 Zeichen). */
export function ticketChannelName(format: string, vars: TicketVars): string {
  const raw = renderTicketText(format || 'ticket-{ticket_id}', vars).toLowerCase();
  const clean = raw.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
  return (clean || `ticket-${vars['{ticket_id}'] ?? ''}`).slice(0, 100);
}

export const ticketNumber = (n: number) => String(n).padStart(4, '0');

// ---- Effekte: Discord-Änderungen, die der Bot ausführt (das System entscheidet, der Bot führt aus) ----
export interface EmbedSpec {
  title?: string; description?: string; color?: number; url?: string;
  thumbnail?: string; image?: string; footer?: string; footerIcon?: string; author?: string; authorIcon?: string;
  fields?: { name: string; value: string; inline?: boolean }[]; timestamp?: string;
}
export interface ComponentButton { id: string; label: string; emoji?: string; style: ButtonStyleName; url?: string; disabled?: boolean }
export interface ComponentSelect { id: string; placeholder: string; kind?: 'string' | 'user' | 'role'; min?: number; max?: number; options?: { label: string; value: string; description?: string; emoji?: string }[] }
export interface MessageSpec { content?: string; embeds?: EmbedSpec[]; buttons?: ComponentButton[]; select?: ComponentSelect; mentionUsers?: string[]; mentionRoles?: string[] }

export type TicketEffect =
  | { type: 'create'; ticketId: string; guildId: string; name: string; parentId?: string | null; viewers: { id: string; kind: 'user' | 'role'; send: boolean }[]; topic: string; messages: MessageSpec[]; control: MessageSpec }
  | { type: 'access'; channelId: string; targetId: string; kind: 'user' | 'role'; view: boolean | null; send?: boolean }
  | { type: 'rename'; channelId: string; name: string }
  | { type: 'move'; channelId: string; parentId: string | null }
  | { type: 'post'; channelId: string; message: MessageSpec }
  | { type: 'control'; ticketId: string; channelId: string; messageId: string | null; message: MessageSpec }
  | { type: 'dm'; userId: string; message: MessageSpec }
  | { type: 'transcript'; transcriptId: string; channelIds: string[]; userId?: string | null; filename: string; message?: MessageSpec }
  | { type: 'delete'; channelId: string; delayMs: number }
  | { type: 'panel'; panelId: string; channelId: string; messageId: string | null; message: MessageSpec };
