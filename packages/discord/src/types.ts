/**
 * Discord-Rohdaten (wie von der Discord REST API geliefert).
 * Reduziert auf das, was NEXUS braucht.
 */

export interface DiscordGuildSummary {
  id: string;
  name: string;
  icon: string | null;
  /** Besitzer-ID der Guild. */
  ownerId: string;
  /** Permissions des Tokens in dieser Guild (Bitmask als String). */
  permissions: string;
}

export interface DiscordChannelSummary {
  id: string;
  name: string;
  /** Discord Channel Type (0=text, 2=voice, 4=category, 5=announcement, 15=forum). */
  type: number;
  parentId: string | null;
}

export interface DiscordRoleSummary {
  id: string;
  name: string;
  color: number;
  position: number;
  permissions: string;
  mentionable: boolean;
}

export interface DiscordMemberSummary {
  userId: string;
  username: string;
  globalName: string | null;
  roles: string[];
  /** Spitzname auf diesem Server (falls gesetzt). */
  nick?: string | null | undefined;
  /** Avatar-Hash des Kontos (für die Avatar-Adresse). */
  avatar?: string | null | undefined;
}

/** Discord-Nachrichten-Payload (Embeds + Components). */
export interface MessagePayload {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: DiscordComponents[];
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  url?: string;
  timestamp?: string;
  footer?: { text: string; icon_url?: string };
  thumbnail?: { url: string };
  image?: { url: string };
  author?: { name: string; icon_url?: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

export type DiscordComponents = {
  type: 1;
  components: Array<DiscordButton | DiscordSelectMenu>;
};

export interface DiscordButton {
  type: 2;
  style: 1 | 2 | 3 | 4 | 5;
  label?: string;
  emoji?: { id?: string; name?: string; animated?: boolean };
  custom_id?: string;
  url?: string;
  disabled?: boolean;
}

export interface DiscordSelectMenu {
  type: 3;
  custom_id: string;
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  options: Array<{
    label: string;
    value: string;
    description?: string;
    emoji?: { id?: string; name?: string; animated?: boolean };
  }>;
}
