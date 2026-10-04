import type { PanelAction, PanelButtonStyle, PanelConfig } from '@nexus/types';
import type { DiscordButton, DiscordComponents, DiscordEmbed, MessagePayload } from './types.js';

/** Custom-IDs der Panel-Komponenten: `nexus:panel:btn:<panelId>:<componentId>` und `nexus:panel:sel:<panelId>`. */
export const PANEL_BUTTON_ACTION = 'panel:btn';
export const PANEL_SELECT_ACTION = 'panel:sel';
export const panelButtonId = (panelId: string, componentId: string): string =>
  `nexus:${PANEL_BUTTON_ACTION}:${panelId}:${componentId}`;
export const panelSelectId = (panelId: string): string => `nexus:${PANEL_SELECT_ACTION}:${panelId}`;

const STYLE: Record<PanelButtonStyle, DiscordButton['style']> = {
  primary: 1,
  secondary: 2,
  success: 3,
  danger: 4,
  link: 5,
};

/** `<:name:id>` / `<a:name:id>` → Objekt, sonst Unicode-Emoji als Name. */
export function parseEmoji(value: string): { id?: string; name: string; animated?: boolean } {
  const m = /^<(a?):(\w+):(\d+)>$/.exec(value);
  return m ? { id: m[3]!, name: m[2]!, ...(m[1] ? { animated: true } : {}) } : { name: value };
}

/** Wandelt eine Panel-Konfiguration in eine sendefertige Discord-Nachricht um (reine Funktion). */
export function renderPanelMessage(panelId: string, config: PanelConfig): MessagePayload {
  const e = config.embed;
  const embed: DiscordEmbed = {};
  if (e.title) embed.title = e.title;
  if (e.description) embed.description = e.description;
  if (e.color) embed.color = parseInt(e.color.slice(1), 16);
  if (e.thumbnailUrl) embed.thumbnail = { url: e.thumbnailUrl };
  if (e.imageUrl) embed.image = { url: e.imageUrl };
  if (e.footer) embed.footer = { text: e.footer };
  if (e.fields?.length) {
    embed.fields = e.fields.map((f) => ({
      name: f.name,
      value: f.value,
      inline: f.inline ?? false,
    }));
  }

  const rows: DiscordComponents[] = [];
  for (let i = 0; i < config.buttons.length; i += 5) {
    rows.push({
      type: 1,
      components: config.buttons.slice(i, i + 5).map((b): DiscordButton => ({
        type: 2,
        style: STYLE[b.style],
        label: b.label,
        ...(b.emoji ? { emoji: parseEmoji(b.emoji) } : {}),
        ...(b.style === 'link' ? { url: b.url! } : { custom_id: panelButtonId(panelId, b.id) }),
      })),
    });
  }
  if (config.select) {
    rows.push({
      type: 1,
      components: [
        {
          type: 3,
          custom_id: panelSelectId(panelId),
          ...(config.select.placeholder ? { placeholder: config.select.placeholder } : {}),
          options: config.select.options.map((o) => ({
            label: o.label,
            value: o.id,
            ...(o.description ? { description: o.description } : {}),
            ...(o.emoji ? { emoji: parseEmoji(o.emoji) } : {}),
          })),
        },
      ],
    });
  }

  const hasEmbed = Object.keys(embed).length > 0;
  return {
    ...(config.content ? { content: config.content } : {}),
    embeds: hasEmbed ? [embed] : [],
    components: rows,
  };
}

/** Aktion eines Buttons/Select-Eintrags anhand der Komponenten-ID. */
export function findPanelAction(config: PanelConfig, componentId: string): PanelAction | undefined {
  return (
    config.buttons.find((b) => b.id === componentId)?.action ??
    config.select?.options.find((o) => o.id === componentId)?.action
  );
}
