import type { Api } from '../api';
import type { Reply } from '../format';
import type { DiscordConfig, Platform } from '../platform';

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
  /** Nachrichten sofort neu zeichnen (z. B. Gefahrenstatus-Panel). */
  refreshLive?: (kind: 'danger' | 'teamlist') => Promise<void>;
  /** Roblox-Namenssuche (öffentliche Roblox-API; in Tests ersetzbar). */
  robloxLookup?: (username: string) => Promise<{ id: number; name: string; displayName: string } | null>;
}
export interface OptionDef { name: string; description: string; type: 'string' | 'integer' | 'number' | 'boolean' | 'user'; required?: boolean; choices?: { name: string; value: string }[]; maxLength?: number; min?: number; max?: number }
export interface CommandDef {
  name: string; description: string; options?: OptionDef[];
  /** true: Der Befehl öffnet ein Formular (Modal) – darf vorher NICHT mit deferReply beantwortet werden. */
  opensModal?: boolean;
  run(ctx: Ctx): Promise<Reply>;
}
/** Buttons/Formulare: customId = `prefix:arg:arg`. `fields` nur bei Formular-Absendungen. */
export interface InteractionDef { prefix: string; run(ctx: Ctx & { args: string[]; fields?: Record<string, string> }): Promise<Reply> }
