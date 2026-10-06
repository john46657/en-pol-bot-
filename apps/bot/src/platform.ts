import type { ButtonSpec, EmbedData, SelectSpec } from './format';

/** Aktionen direkt in Discord (Rollen, Channels, DMs, Nachrichten). Echte Umsetzung in index.ts, in Tests ein Fake. */
export interface Platform {
  setRole(guildId: string, userId: string, roleId: string, on: boolean): Promise<void>;
  /** Legt einen privaten Ticket-Channel an (oder liefert den vorhandenen). */
  createTicketChannel(a: { guildId: string; userId: string; userName: string; categoryId?: string; staffRoleId?: string; extraUserIds?: string[] }): Promise<{ channelId: string; existing: boolean }>;
  deleteChannel(channelId: string, delayMs?: number): Promise<void>;
  sendDirectMessage(userId: string, text: string): Promise<void>;
  /** Direktnachricht mit Embed (+ Buttons); liefert DM-Channel und Nachricht (für „Zur Bewerbung“-Links). */
  sendDm(userId: string, m: { embed: EmbedData; buttons?: ButtonSpec[] }): Promise<{ channelId: string; messageId: string }>;
  /** Sendet oder bearbeitet eine Nachricht; liefert deren ID (bei fehlender/gelöschter Alt-Nachricht wird neu gesendet). */
  postOrEdit(a: { channelId: string; messageId?: string; embed: EmbedData; buttons?: ButtonSpec[] }): Promise<string>;
  /** Postet ein Panel (Embed + Buttons und/oder Auswahlmenü) in einen Channel. */
  postPanel(a: { channelId: string; embed: EmbedData; buttons?: ButtonSpec[]; select?: SelectSpec }): Promise<void>;
}

export interface DiscordConfig { guildId?: string; dispatch?: string; wanted?: string; announcements?: string; applications?: string; danger?: string; sek?: string; qualifications?: string; duty?: string; teamlist?: string; tickets?: string; staffRole?: string; radioRole?: string; sekRole?: string; dutyRole?: string; breakRole?: string; trainingRole?: string; adminDutyRole?: string }
