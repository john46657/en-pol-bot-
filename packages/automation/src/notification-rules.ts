import { renderTemplate } from '@nexus/core';
import type { DiscordEmbed, MessagePayload } from '@nexus/discord';

/**
 * Benachrichtigungen je Ereignis einer Bewerbungsart (Team-Chance, Punkt 18) – reine Funktionen.
 * Je Ereignis optional: DM an den Bewerber (an/aus, eigenes Embed) und Nachricht in einen Kanal (Embed, Erwähnungen,
 * Link-Knöpfe). Ohne Regel bleibt alles wie bisher (Standard-DM, keine Kanalnachricht).
 */
export const NOTIFICATION_EVENTS = ['started', 'submitted', 'accepted', 'denied', 'cancelled', 'expired', 'on_hold', 'assigned'] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];
export const NOTIFICATION_EVENT_LABEL: Record<NotificationEvent, string> = {
  started: 'Neue Bewerbung (gestartet)',
  submitted: 'Bewerbung eingereicht',
  accepted: 'Bewerbung angenommen',
  denied: 'Bewerbung abgelehnt',
  cancelled: 'Bewerbung abgebrochen',
  expired: 'Bewerbung abgelaufen',
  on_hold: 'Bewerbung zurückgestellt',
  assigned: 'Bewerbung übernommen',
};
const EVENT_COLOR: Record<NotificationEvent, number> = { started: 0x5865f2, submitted: 0xfee75c, accepted: 0x57f287, denied: 0xed4245, cancelled: 0x95a5a6, expired: 0x2c2f33, on_hold: 0xe67e22, assigned: 0x5865f2 };

export interface EmbedTemplate {
  title?: string | undefined;
  description?: string | undefined;
  color?: string | undefined;
  thumbnailUrl?: string | undefined;
  imageUrl?: string | undefined;
  footer?: string | undefined;
}
export interface NotificationRule {
  /** false = keine DM (auch keine Standard-DM); true/leer = DM (eigenes Embed, falls gesetzt, sonst Standard). */
  dm?: boolean | undefined;
  dmEmbed?: EmbedTemplate | undefined;
  channelId?: string | undefined;
  channelEmbed?: EmbedTemplate | undefined;
  mentionApplicant?: boolean | undefined;
  mentionRoleIds?: string[] | undefined;
  /** Link-Knöpfe unter der Nachricht (nur https). */
  buttons?: { label: string; url: string }[] | undefined;
}

const URL_OK = /^https:\/\/\S+$/;
const hasContent = (t?: EmbedTemplate) => !!(t?.title?.trim() || t?.description?.trim());

export function notificationRule(config: unknown, event: NotificationEvent): NotificationRule | undefined {
  const raw = (config as { notifications?: Record<string, unknown> } | null)?.notifications?.[event];
  return raw && typeof raw === 'object' ? (raw as NotificationRule) : undefined;
}

export function renderEmbed(t: EmbedTemplate, vars: Record<string, unknown>, fallbackColor: number): DiscordEmbed {
  const r = (s?: string) => (s ? renderTemplate(s, vars) : '');
  return {
    ...(t.title ? { title: r(t.title).slice(0, 256) } : {}),
    ...(t.description ? { description: r(t.description).slice(0, 4000) } : {}),
    color: t.color && /^#[0-9a-fA-F]{6}$/.test(t.color) ? parseInt(t.color.slice(1), 16) : fallbackColor,
    ...(t.thumbnailUrl && URL_OK.test(t.thumbnailUrl) ? { thumbnail: { url: t.thumbnailUrl } } : {}),
    ...(t.imageUrl && URL_OK.test(t.imageUrl) ? { image: { url: t.imageUrl } } : {}),
    ...(t.footer ? { footer: { text: r(t.footer).slice(0, 2048) } } : {}),
  } as DiscordEmbed;
}

const linkRow = (buttons: NotificationRule['buttons']) => {
  const ok = (buttons ?? []).filter((b) => b.label?.trim() && URL_OK.test(b.url)).slice(0, 5);
  return ok.length ? [{ type: 1, components: ok.map((b) => ({ type: 2, style: 5, label: b.label.slice(0, 80), url: b.url })) }] : [];
};

export interface EventMessages {
  /** 'default' = bisherige Standard-DM, 'off' = keine DM, sonst diese Nachricht statt der Standard-DM. */
  dm: 'default' | 'off' | MessagePayload;
  channel?: { channelId: string; payload: MessagePayload } | undefined;
}

/** Was zu einem Ereignis gesendet wird (Platzhalter wie {user}, {applicationName}, {reason} werden ersetzt). */
export function eventMessages(config: unknown, event: NotificationEvent, vars: Record<string, unknown>): EventMessages {
  const rule = notificationRule(config, event);
  if (!rule) return { dm: 'default' };
  const components = linkRow(rule.buttons);
  const dm: EventMessages['dm'] = rule.dm === false ? 'off' : hasContent(rule.dmEmbed) ? ({ embeds: [renderEmbed(rule.dmEmbed!, vars, EVENT_COLOR[event])], ...(components.length ? { components } : {}) } as MessagePayload) : 'default';
  let channel: EventMessages['channel'];
  if (rule.channelId && /^\d{5,25}$/.test(rule.channelId)) {
    const userId = typeof vars['userId'] === 'string' ? (vars['userId'] as string) : undefined;
    const roles = (rule.mentionRoleIds ?? []).filter((r) => /^\d{5,25}$/.test(r));
    const mentions = [...(rule.mentionApplicant && userId ? [`<@${userId}>`] : []), ...roles.map((r) => `<@&${r}>`)];
    const tpl: EmbedTemplate = hasContent(rule.channelEmbed) ? rule.channelEmbed! : { title: NOTIFICATION_EVENT_LABEL[event], description: '{user} · **{applicationName}**' };
    channel = {
      channelId: rule.channelId,
      payload: {
        ...(mentions.length ? { content: mentions.join(' ') } : {}),
        embeds: [renderEmbed(tpl, vars, EVENT_COLOR[event])],
        ...(components.length ? { components } : {}),
        allowed_mentions: { parse: [], users: rule.mentionApplicant && userId ? [userId] : [], roles },
      } as MessagePayload,
    };
  }
  return { dm, ...(channel ? { channel } : {}) };
}
