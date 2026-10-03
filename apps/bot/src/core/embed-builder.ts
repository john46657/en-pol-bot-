import { EmbedBuilder } from 'discord.js';

export const EMBED_COLORS = {
  info: 0x5865f2,
  success: 0x57f287,
  warning: 0xfee75c,
  error: 0xed4245,
} as const;

export type EmbedKind = keyof typeof EMBED_COLORS;

export interface EmbedOptions {
  title?: string;
  description?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: string;
  thumbnailUrl?: string | undefined;
  /** Eigene Farbe (überschreibt `kind`), z. B. aus der Panel-Konfiguration. */
  color?: number;
  timestamp?: boolean;
}

const LIMITS = {
  title: 256,
  description: 4096,
  fieldName: 256,
  fieldValue: 1024,
  footer: 2048,
  fields: 25,
};
const cut = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** Einheitlicher Embed-Builder; kürzt Texte auf die Discord-Limits, damit Senden nie an der Länge scheitert. */
export function buildEmbed(kind: EmbedKind, o: EmbedOptions): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(o.color ?? EMBED_COLORS[kind]);
  if (o.title) embed.setTitle(cut(o.title, LIMITS.title));
  if (o.description) embed.setDescription(cut(o.description, LIMITS.description));
  for (const f of (o.fields ?? []).slice(0, LIMITS.fields)) {
    embed.addFields({
      name: cut(f.name, LIMITS.fieldName) || '​',
      value: cut(f.value, LIMITS.fieldValue) || '​',
      inline: f.inline ?? false,
    });
  }
  if (o.footer) embed.setFooter({ text: cut(o.footer, LIMITS.footer) });
  if (o.thumbnailUrl) embed.setThumbnail(o.thumbnailUrl);
  if (o.timestamp) embed.setTimestamp();
  return embed;
}

export const embeds = {
  info: (o: EmbedOptions) => buildEmbed('info', o),
  success: (o: EmbedOptions) => buildEmbed('success', o),
  warning: (o: EmbedOptions) => buildEmbed('warning', o),
  error: (o: EmbedOptions) => buildEmbed('error', o),
};
