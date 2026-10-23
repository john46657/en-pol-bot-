import type { Api } from '../api';
import type { Reply } from '../format';
import type { LiveKind } from '../live';
import type { DiscordConfig, Platform } from '../platform';
import type { TicketEffect } from '@enrp/shared';
import type { VoiceSupportRuntime } from '../voice-support';
import type { AccessDeps } from '../access';
import type { BotBackupService } from '../bot-backup';
import type { GuildSnapshot, RuntimeStatus } from '../diagnostics';
import type { GuildConfigStore } from '../guild-config';
import type { BotProfileActions, ImageFile } from './bot-profile';

/** Laufzeit für Einrichtung (/setup), Diagnose (/system), Sicherungen (/backup) und Stufen-Rechte. Echte Umsetzung in index.ts, in Tests ein Fake. */
export interface BotRuntime {
  guildConfig: GuildConfigStore;
  backups: BotBackupService;
  /** Rollen/Rechte des Aufrufers frisch von Discord + Serverkonfiguration */
  access: AccessDeps;
  status(): RuntimeStatus;
  /** Rechte des Bots, Kanäle und Rollen eines Servers (Diagnose, Wiederherstellungsplan) */
  snapshot(guildId: string): Promise<GuildSnapshot | null>;
  /** Erreichbarkeit der System-API (`/health`) und ob der Bot-Zugang angenommen wird – ohne Geheimnisse */
  apiHealth(): Promise<{ reachable: boolean; status: number; ms: number; authOk: boolean | null }>;
  /** Öffentliche Roblox-API (dokumentierte Namenssuche) erreichbar? */
  robloxReachable(): Promise<boolean>;
  /** Spitzname des Bots auf dem Server setzen (`null` = zurücksetzen); liefert einen Hinweis, falls es nicht ging */
  setNickname(guildId: string, nick: string | null): Promise<string | null>;
  /** Slash-Befehle des Servers neu registrieren (nach Moduländerungen) */
  reregister(guildId: string): Promise<void>;
  /** Hinweis, falls der Sicherungsordner im Produktionsordner liegt */
  backupDirWarning: string | null;
}

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
  /** Name und Icon des Servers (Kopfzeile wie bei Trident, z. B. `/shift leaderboard`). */
  guildName?: string; guildIcon?: string;
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
  /** Anzeigename auf dem Server (Nickname), falls bekannt. */
  userDisplayName?: string;
  /** Nachrichten posten/löschen und Rollen geben (Formular-Panels, Berichte). */
  discord?: {
    post(channelId: string, message: import('@enrp/shared').MessageSpec, asUser?: { username: string; avatarURL?: string }): Promise<{ channelId: string; messageId: string }>;
    deleteMessage(channelId: string, messageId: string): Promise<void>;
    addRoles(guildId: string, userId: string, roleIds: string[]): Promise<void>;
    /** Eine Rolle geben/nehmen/umschalten (Message-Builder-Buttons); liefert, was passiert ist. */
    setRole?(guildId: string, userId: string, roleId: string, mode: 'toggle' | 'add' | 'remove'): Promise<'added' | 'removed' | 'unchanged'>;
  };
  /** ID der Discord-Interaktion (Idempotenz: dieselbe Interaktion erzeugt nie zwei Tickets). */
  interactionId?: string;
  /** Sprach-Support (Buttons „Übernehmen“, „Ablehnen“, „Nachricht“ …). */
  voiceSupport?: VoiceSupportRuntime;
  /** Einrichtung, Diagnose, Sicherungen, Stufen-Rechte */
  runtime?: BotRuntime;
  /** Angehängte Dateien eines Slash-Befehls (Option vom Typ `attachment`), nach Optionsname. */
  attachments?: Record<string, ImageFile>;
  /** Name, Profilbild und Status des Bots ändern (/botprofil). */
  botProfile?: BotProfileActions;
}
export interface OptionDef { name: string; description: string; type: 'string' | 'integer' | 'number' | 'boolean' | 'user' | 'attachment'; required?: boolean; choices?: { name: string; value: string }[]; maxLength?: number; min?: number; max?: number; /** Vorschläge beim Tippen über `CommandDef.complete` (nur Text-Optionen). */ autocomplete?: boolean }
/** Unterbefehl (`/leave manage`): Name landet in `opts._sub`, seine Optionen wie gewohnt in `opts`. */
export interface SubcommandDef { name: string; description: string; options?: OptionDef[] }
export interface CommandDef {
  name: string; description: string; options?: OptionDef[]; subcommands?: SubcommandDef[];
  /** true: Der Befehl öffnet ein Formular (Modal) – darf vorher NICHT mit deferReply beantwortet werden. */
  opensModal?: boolean;
  /** true: Antwort ist für alle im Channel sichtbar (z. B. `/shift manage`); Antworten mit `ephemeral` bleiben trotzdem privat. */
  publicReply?: (opts: Record<string, unknown>) => boolean;
  /** Vorschläge für Optionen mit `autocomplete` (höchstens 25). */
  complete?(ctx: Ctx, option: string, value: string): Promise<{ name: string; value: string }[]>;
  run(ctx: Ctx): Promise<Reply>;
}
/** Buttons/Formulare/Auswahlmenüs: customId = `prefix:arg:arg`. `fields` nur bei Formular-Absendungen, `values` nur bei Auswahlmenüs. */
export interface InteractionDef { prefix: string; /** true: Antwort ist ein Formular (kein deferReply vorher); `values`: Auswahl bei Menüs. */ opensModal?: (args: string[], values?: string[]) => boolean;
  /** true: Antwort ersetzt die Nachricht mit dem Button (z. B. Panel von `/shift manage`) statt einer neuen Antwort. */ updatesMessage?: (args: string[]) => boolean;
  /** true: Button, Auswahlmenü oder Formular (aus einer Nachricht) bearbeitet die Nachricht an Ort und Stelle, wenn die Antwort `panel` setzt (sonst eigene private Antwort). */ panel?: (args: string[]) => boolean; run(ctx: Ctx & { args: string[]; fields?: Record<string, string>; values?: string[]; /** alle Formular-Eingaben (Auswahl, Dateien) */ modal?: { values: Record<string, string | string[] | boolean>; files: Record<string, import('@enrp/shared').FormFile[]> } }): Promise<Reply> }
