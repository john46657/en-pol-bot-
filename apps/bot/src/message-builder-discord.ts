import { ChannelType, PermissionFlagsBits, type Client, type GuildBasedChannel } from 'discord.js';
import type { MbDiscord, MbFetchDiscord, MbPayload, MbTarget } from './message-builder';

/** Embed Builder: Discord-Seite (discord.js) für Versand, Forum-Beiträge, Bearbeiten und Laden von Nachrichten. */

const isForum = (c: { type: ChannelType }) => c.type === ChannelType.GuildForum || c.type === ChannelType.GuildMedia;
const body = (x: MbPayload, edit = false) => ({
  // Beim Bearbeiten leert ein fehlender Text den bisherigen Text (sonst bliebe er stehen)
  ...(x.content || edit ? { content: x.content ?? '' } : {}),
  embeds: x.embeds as never, components: x.components as never, allowedMentions: { parse: x.allowed_mentions.parse },
});

async function guildChannel(client: Client, guildId: string | null, channelId: string): Promise<GuildBasedChannel> {
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch || ch.isDMBased() || !('guildId' in ch)) throw new Error('Den Kanal gibt es nicht (mehr) oder der Bot sieht ihn nicht.');
  if (!guildId || ch.guildId !== guildId) throw new Error('Der Kanal gehört nicht zu dem Discord-Server, für den die Nachricht gebaut wurde.');
  return ch as GuildBasedChannel;
}

export function mbDiscord(client: Client): MbDiscord {
  return {
    async missingPerms(guildId, channelId, payloads, target: MbTarget = {}) {
      const ch = await guildChannel(client, guildId, channelId);
      if (!('permissionsFor' in ch)) throw new Error('In diesen Kanaltyp kann nicht gesendet werden.');
      const embeds = payloads.some((x) => x.embeds.length);
      const everyone = payloads.some((x) => x.allowed_mentions.parse.includes('everyone') && /@(everyone|here)/.test(x.content ?? ''));
      let perms = ch.permissionsFor(client.user!);
      const need: [bigint, string, boolean][] = [[PermissionFlagsBits.ViewChannel, 'Kanal ansehen', true]];
      if (target.edit) {
        need.push([PermissionFlagsBits.ReadMessageHistory, 'Nachrichtenverlauf lesen', true]);
      } else if (target.threadId) {
        const t = await client.channels.fetch(target.threadId).catch(() => null);
        if (!t?.isThread()) throw new Error('Den gewählten Thread bzw. Forum-Beitrag gibt es nicht (mehr).');
        if (t.parentId !== ch.id) throw new Error('Der gewählte Thread gehört nicht zu diesem Kanal.');
        if (t.archived && t.locked) throw new Error('Der Thread ist archiviert und gesperrt – erst in Discord wieder öffnen.');
        perms = t.permissionsFor(client.user!);
        need.push([PermissionFlagsBits.SendMessagesInThreads, 'Nachrichten in Threads senden', true]);
      } else if (isForum(ch)) {
        if (!target.threadName) throw new Error('Forum-Kanal: Bitte einen bestehenden Beitrag wählen oder einen Titel für einen neuen Beitrag angeben.');
        need.push([PermissionFlagsBits.SendMessages, 'Beiträge erstellen (Nachrichten senden)', true]);
      } else {
        if (!ch.isSendable()) throw new Error('Der Kanal existiert nicht oder ist kein Textkanal, in den der Bot senden kann.');
        need.push([PermissionFlagsBits.SendMessages, 'Nachrichten senden', true]);
      }
      need.push([PermissionFlagsBits.EmbedLinks, 'Links einbetten', embeds], [PermissionFlagsBits.MentionEveryone, '@everyone, @here und alle Rollen erwähnen', everyone]);
      return need.filter(([flag, , used]) => used && !perms?.has(flag)).map(([, name]) => name);
    },
    async send(channelId, x) {
      const ch = await client.channels.fetch(channelId);
      if (!ch?.isSendable()) throw new Error('Der Kanal ist nicht beschreibbar.');
      return ch.send(body(x));
    },
    async createPost(forumId, name, x) {
      const ch = await client.channels.fetch(forumId);
      if (!ch || !isForum(ch) || !('threads' in ch)) throw new Error('Der Kanal ist kein Forum.');
      const thread = await (ch.threads as { create(o: unknown): Promise<{ id: string; fetchStarterMessage(): Promise<{ id: string } | null> }> }).create({ name: name.slice(0, 100), message: body(x) });
      const starter = await thread.fetchStarterMessage().catch(() => null);
      return { id: starter?.id ?? thread.id, channelId: thread.id };
    },
    async edit(channelId, messageId, x) {
      const ch = await client.channels.fetch(channelId);
      if (!ch?.isTextBased() || !('messages' in ch)) throw new Error('Den Kanal gibt es nicht (mehr) oder der Bot sieht ihn nicht.');
      const msg = await ch.messages.fetch(messageId);
      if (msg.author.id !== client.user!.id) throw new Error('Diese Nachricht stammt nicht vom Bot – nur eigene Nachrichten können bearbeitet werden.');
      return msg.edit(body(x, true));
    },
  };
}

export function mbFetchDiscord(client: Client): MbFetchDiscord {
  return {
    async fetch(guildId, channelId, messageId) {
      const ch = await guildChannel(client, guildId, channelId);
      if (!ch.isTextBased() || !('messages' in ch)) throw new Error('In diesem Kanal gibt es keine Nachrichten.');
      const msg = await ch.messages.fetch(messageId);
      const author = msg.author.id === client.user!.id ? 'bot' : msg.webhookId ? 'webhook' : 'other';
      return {
        author, ...(author === 'webhook' && msg.webhookId ? { webhookId: msg.webhookId } : {}),
        channelId: ch.id, parentId: ch.isThread() ? ch.parentId : null, channelName: 'name' in ch ? ch.name : undefined,
        message: { content: msg.content, embeds: msg.embeds.map((e) => e.toJSON()), components: msg.components.map((c) => c.toJSON()) },
      };
    },
  };
}
