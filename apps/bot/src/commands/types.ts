import type { Api } from '../api';
import type { Reply } from '../format';
import type { LiveKind } from '../live';
import type { DiscordConfig, Platform } from '../platform';
import type { TicketEffect } from '@enrp/shared';
import type { VoiceSupportRuntime } from '../voice-support';

export type Opts = Record<string, string | number | boolean | undefined>;
export interface Ctx {
  discordId: string; opts: Opts; api: Api;
  platform?: Platform;
  /** Server, auf dem der Befehl ausgeführt wurde (undefiniert in Direktnachrichten). */
  guildId?: string;
  /** Hat der Aufrufer in Discord Administrator-Rechte? (für Panels, die Discord-Rechte brauchen) */
  isGuildAdmin?: boolean;
  /** Channel, in dem der Befehl/Button ausgelöst wurde. */
  channelId?: string;
  /** Konfigurierte Channel-/Rollen-IDs aus dem System (/bot/config). */
  config?: () => Promise<DiscordConfig>;
  /** Anzeigename des Aufrufers in Discord (z. B. für Ticket-Channel-Namen). */
  userName?: string;
  /** Profilbild des Aufrufers (Kopfzeile wie bei Trident). */
  userAvatar?: string;
  /** Selbst aktualisierende Nachrichten sofort neu zeichnen; mit `channelId` dorthin (um)ziehen. */
  refreshLive?: (kind: LiveKind, o?: { channelId?: string; force?: boolean }) => Promise<{ channelId: string; messageId?: string } | null>;
  /** Discord-Rollen des Aufrufers auf diesem Server (Ticket-Voraussetzungen). */
  memberRoleIds?: string[];
  /** Ticket-Effekte sofort in Discord ausführen (Channel anlegen, Rechte, Nachrichten …). */
  applyEffects?: (effects: TicketEffect[]) => Promise<{ channelId?: string }>;
  /** Discord-Kategorien eines Servers (Ticket verschieben). */
  listCategories?: (guildId: string) => Promise<{ id: string; name: string }[]>;
  /** Beitritt des Aufrufers zum Server (ISO), falls aus einem Server ausgelöst. */
  memberJoinedAt?: string;
  /** Discord-Benutzername zu einer ID (z. B. Ticket für ein anderes Mitglied). */
  userNameOf?: (userId: string) => Promise<string | null>;
  /** Roblox-Namenssuche (öffentliche Roblox-API; in Tests ersetzbar). */
  robloxLookup?: (username: string) => Promise<{ id: number; name: string; displayName: string } | null>;
  /** Roblox-Verifizierung: Rollen/Nickname eines Mitglieds auf einem Server setzen; liefert Hinweise, was nicht ging. */
  verifyApply?: (guildId: string, userId: string, a: { add: string[]; remove: string[]; nickname: string | null }) => Promise<string[]>;
  /** Sprach-Support (Buttons „Übernehmen“, „Ablehnen“, „Nachricht“ …). */
  voiceSupport?: VoiceSupportRuntime;
}
export interface OptionDef { name: string; description: string; type: 'string' | 'integer' | 'number' | 'boolean' | 'user'; required?: boolean; choices?: { name: string; value: string }[]; maxLength?: number; min?: number; max?: number }
/** Unterbefehl (`/leave manage`): Name landet in `opts._sub`, seine Optionen wie gewohnt in `opts`. */
export interface SubcommandDef { name: string; description: string; options?: OptionDef[] }
export interface CommandDef {
  name: string; description: string; options?: OptionDef[]; subcommands?: SubcommandDef[];
  /** true: Der Befehl öffnet ein Formular (Modal) – darf vorher NICHT mit deferReply beantwortet werden. */
  opensModal?: boolean;
  run(ctx: Ctx): Promise<Reply>;
}
/** Buttons/Formulare/Auswahlmenüs: customId = `prefix:arg:arg`. `fields` nur bei Formular-Absendungen, `values` nur bei Auswahlmenüs. */
export interface InteractionDef { prefix: string; /** true: Antwort ist ein Formular (kein deferReply vorher). */ opensModal?: (args: string[]) => boolean; run(ctx: Ctx & { args: string[]; fields?: Record<string, string>; values?: string[] }): Promise<Reply> }
