import { AttachmentBuilder, type Client, type Message } from 'discord.js';
import type { EmbedSpec, MessageSpec } from '@enrp/shared';
import type { Api } from './api';
import { payloadOf } from './discord-tickets';

const IMAGE_KEYS = ['image', 'thumbnail', 'authorIcon', 'footerIcon'] as const;
const MEDIA = /^media:([0-9a-f-]{36})$/;

/** Hochgeladene Bilder (`media:<id>`) aus dem System laden und als Anhang (`attachment://…`) einsetzen. */
export async function resolveAssets(api: Api, m: MessageSpec): Promise<{ message: MessageSpec; files: AttachmentBuilder[] }> {
  const files = new Map<string, AttachmentBuilder>();
  const load = async (ref: string | undefined) => {
    const id = ref ? MEDIA.exec(ref)?.[1] : undefined;
    if (!id) return ref;
    if (!files.has(id)) {
      const f = await api.service<{ name: string; data: string }>('GET', `/bot/embeds/asset/${id}`);
      const name = f.name.replace(/[^\w.-]/g, '') || `bild-${id.slice(0, 8)}.png`;
      files.set(id, new AttachmentBuilder(Buffer.from(f.data, 'base64'), { name }));
    }
    return `attachment://${files.get(id)!.name}`;
  };
  const embeds: EmbedSpec[] = [];
  for (const e of m.embeds ?? []) {
    const out: EmbedSpec = { ...e };
    for (const k of IMAGE_KEYS) {
      // Bild nicht ladbar (gelöscht) → weglassen statt die ganze Nachricht scheitern zu lassen
      out[k] = await load(e[k]).catch(() => undefined);
    }
    embeds.push(out);
  }
  return { message: { ...m, embeds }, files: [...files.values()] };
}

/** Reaktionen setzen, die noch fehlen (Reihenfolge wie eingestellt). */
async function react(msg: Message, emojis: string[] = []) {
  for (const e of emojis) {
    if (msg.reactions.cache.some((r) => r.me && (r.emoji.toString() === e || r.emoji.name === e))) continue;
    await msg.react(e).catch(() => undefined); // unbekanntes Emoji / keine Rechte → überspringen
  }
}

/**
 * Nachricht senden oder – falls `messageId` (bzw. die unter `stateKey` gemerkte Nachricht) noch im Kanal steht – bearbeiten.
 * Liefert Kanal und Nachricht; mit `stateKey` merkt sich das System den Ort (überlebt Neustarts).
 */
export async function postOrUpdate(client: Client, api: Api, o: { channelId: string; message: MessageSpec; messageId?: string | null; stateKey?: string; forceNew?: boolean }) {
  const ch = await client.channels.fetch(o.channelId);
  if (!ch?.isSendable() || !('messages' in ch)) throw new Error(`channel ${o.channelId} is not a text channel the bot can post in`);
  let messageId = o.messageId ?? null;
  if (o.stateKey && !messageId && !o.forceNew) {
    const prev = await api.service<{ value: unknown }>('GET', `/bot/state/${o.stateKey}`).then((r) => r.value as { channelId?: string; messageId?: string } | null, () => null);
    if (prev?.channelId === o.channelId && prev.messageId) messageId = prev.messageId;
  }
  const { message, files } = await resolveAssets(api, o.message);
  const payload = { ...payloadOf(message, false), ...(files.length ? { files } : {}) };
  const old = messageId && !o.forceNew ? await ch.messages.fetch(messageId).catch(() => null) : null;
  const msg = old ? await old.edit({ ...payload, content: payload.content ?? '', attachments: [] }) : await ch.send(payload);
  await react(msg, message.reactions);
  if (!old && message.thread && 'startThread' in msg) await msg.startThread({ name: message.thread.slice(0, 100), autoArchiveDuration: 10080 }).catch((e: unknown) => console.error('Thread konnte nicht gestartet werden:', e instanceof Error ? e.message : e));
  if (o.stateKey) await api.service('PUT', `/bot/state/${o.stateKey}`, { value: { channelId: o.channelId, messageId: msg.id } }).catch(() => undefined);
  return { channelId: o.channelId, messageId: msg.id };
}

/** Als Person posten (Name + Profilbild über einen Webhook des Bots im Kanal). Ohne Webhook-Recht: normal als Bot. */
export async function postAsUser(client: Client, api: Api, channelId: string, m: MessageSpec, as: { username: string; avatarURL?: string }) {
  const ch = await client.channels.fetch(channelId);
  if (!ch?.isSendable() || !('messages' in ch)) throw new Error(`Kanal ${channelId} ist kein Textkanal, in dem der Bot schreiben darf`);
  const { message, files } = await resolveAssets(api, m);
  const payload = { ...payloadOf(message, false), ...(files.length ? { files } : {}) };
  let msg: Message | null = null;
  if ('fetchWebhooks' in ch && 'createWebhook' in ch) {
    try {
      const hooks = await ch.fetchWebhooks();
      const hook = hooks.find((h) => h.owner?.id === client.user?.id && h.name === 'EN Polizei Panels') ?? await ch.createWebhook({ name: 'EN Polizei Panels' });
      // Webhooks ohne App dürfen keine Buttons senden
      msg = await hook.send({ ...payload, components: [], username: as.username.slice(0, 80), ...(as.avatarURL ? { avatarURL: as.avatarURL } : {}) }) as Message;
    } catch { msg = null; } // keine Rechte „Webhooks verwalten“ → als Bot
  }
  if (!msg) msg = await ch.send(payload);
  // Webhook-Nachrichten: Reaktionen über den Kanal setzen
  const real = await ch.messages.fetch(msg.id).catch(() => msg);
  await react(real!, message.reactions);
  return { channelId, messageId: msg.id };
}

export async function deleteMessage(client: Client, channelId: string, messageId: string) {
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch?.isTextBased() || !('messages' in ch)) return;
  await ch.messages.delete(messageId).catch(() => undefined);
}
