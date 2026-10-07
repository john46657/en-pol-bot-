import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, OverwriteType, PermissionFlagsBits, RoleSelectMenuBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder,
  type Client, type Message, type MessageActionRowComponentBuilder, type TextChannel,
} from 'discord.js';
import type { ComponentButton, ComponentSelect, EmbedSpec, MessageSpec, TicketEffect } from '@enrp/shared';
import type { Api } from './api';

const STYLE = { primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger } as const;
const VIEW = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory];
const TALK = [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];
const https = (u?: string | null) => (u && /^https:\/\//.test(u) ? u : undefined);

export function embedOf(e: EmbedSpec) {
  const b = new EmbedBuilder();
  if (e.title) b.setTitle(e.title.slice(0, 256));
  if (e.description) b.setDescription(e.description.slice(0, 4096));
  if (e.color !== undefined) b.setColor(e.color);
  if (https(e.thumbnail)) b.setThumbnail(e.thumbnail!);
  if (https(e.image)) b.setImage(e.image!);
  if (e.author) b.setAuthor({ name: e.author.slice(0, 256), ...(https(e.authorIcon) ? { iconURL: e.authorIcon } : {}) });
  if (e.footer) b.setFooter({ text: e.footer.slice(0, 2048), ...(https(e.footerIcon) ? { iconURL: e.footerIcon } : {}) });
  if (e.fields?.length) b.addFields(e.fields.slice(0, 25).map((f) => ({ name: f.name.slice(0, 256) || '​', value: f.value.slice(0, 1024) || '​', inline: f.inline ?? false })));
  if (e.timestamp) b.setTimestamp(new Date(e.timestamp));
  if (!e.title && !e.description && !e.fields?.length) b.setDescription('​');
  return b;
}

/** Menü + Buttons zu Discord-Reihen (max. 5 Reihen, 5 Buttons je Reihe). */
export function componentsOf(buttons: ComponentButton[] = [], selects: ComponentSelect[] = []) {
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  for (const s of selects.slice(0, 5)) {
    let menu: StringSelectMenuBuilder | UserSelectMenuBuilder | RoleSelectMenuBuilder;
    if (s.kind === 'user') menu = new UserSelectMenuBuilder();
    else if (s.kind === 'role') menu = new RoleSelectMenuBuilder();
    else {
      const sm = new StringSelectMenuBuilder();
      sm.addOptions((s.options ?? []).slice(0, 25).map((o) => ({ label: o.label.slice(0, 100), value: o.value.slice(0, 100), ...(o.description ? { description: o.description.slice(0, 100) } : {}), ...(o.emoji ? { emoji: o.emoji } : {}) })));
      menu = sm;
    }
    menu.setCustomId(s.id).setPlaceholder(s.placeholder.slice(0, 150));
    const max = Math.max(1, Math.min(s.max ?? 1, s.kind === 'user' || s.kind === 'role' ? 25 : (s.options?.length ?? 1)));
    menu.setMinValues(Math.min(s.min ?? 1, max)).setMaxValues(max);
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu));
  }
  for (let i = 0; i < buttons.length && rows.length < 5; i += 5) {
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buttons.slice(i, i + 5).map((b) => {
      const x = b.url ? new ButtonBuilder().setURL(b.url).setStyle(ButtonStyle.Link) : new ButtonBuilder().setCustomId(b.id).setStyle(STYLE[b.style] ?? ButtonStyle.Secondary);
      x.setLabel(b.label.slice(0, 80));
      if (b.emoji) x.setEmoji(b.emoji);
      if (b.disabled) x.setDisabled(true);
      return x;
    })));
  }
  return rows;
}

export function payloadOf(m: MessageSpec) {
  return {
    ...(m.content ? { content: m.content.slice(0, 2000) } : {}),
    embeds: (m.embeds ?? []).slice(0, 10).map(embedOf),
    components: componentsOf(m.buttons, m.select ? [m.select] : []),
    // Nur ausdrücklich gewünschte Erwähnungen pingen – niemals @everyone/@here
    allowedMentions: { parse: [] as never[], users: m.mentionUsers ?? [], roles: m.mentionRoles ?? [] },
  };
}

/**
 * Führt Ticket-Effekte in Discord aus und schneidet Nachrichten in Ticket-Channels mit.
 * Das System (API) entscheidet alles; hier passiert nur die Discord-Seite.
 */
export function createTicketRuntime(client: () => Client, api: Api, log: (m: string) => void = console.log) {
  const channels = new Set<string>();
  const text = async (id: string) => {
    const ch = await client().channels.fetch(id).catch(() => null);
    return ch && ch.type === ChannelType.GuildText ? (ch as TextChannel) : null;
  };

  async function create(e: Extract<TicketEffect, { type: 'create' }>) {
    const guild = await client().guilds.fetch(e.guildId);
    const me = client().user!.id;
    const overwrites = [
      { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
      { id: me, type: OverwriteType.Member, allow: [...VIEW, ...TALK, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
      ...e.viewers.map((v) => ({ id: v.id, type: v.kind === 'user' ? OverwriteType.Member : OverwriteType.Role, allow: [...VIEW, ...(v.send ? TALK : [])], ...(v.send ? {} : { deny: [PermissionFlagsBits.SendMessages] }) })),
    ];
    const parent = e.parentId ? await guild.channels.fetch(e.parentId).catch(() => null) : null;
    const base = { name: e.name, type: ChannelType.GuildText as const, topic: e.topic.slice(0, 1024), permissionOverwrites: overwrites };
    let ch: TextChannel;
    try {
      ch = await guild.channels.create(parent?.type === ChannelType.GuildCategory ? { ...base, parent: parent.id } : base);
    } catch (err) {
      if (!parent) throw err;
      ch = await guild.channels.create(base); // z. B. Kategorie voll (50 Channels) → ohne Kategorie
    }
    channels.add(ch.id);
    let control: Message | null = null;
    try {
      control = await ch.send(payloadOf(e.control));
      for (const m of e.messages) await ch.send(payloadOf(m));
    } finally {
      await api.service('POST', `/bot/support-tickets/${e.ticketId}/channel`, { channelId: ch.id, controlMessageId: control?.id ?? null });
    }
    return ch.id;
  }

  async function transcript(e: Extract<TicketEffect, { type: 'transcript' }>) {
    const { html } = await api.service<{ html: string }>('GET', `/bot/support-tickets/transcripts/${e.transcriptId}`);
    const file = () => new AttachmentBuilder(Buffer.from(html, 'utf8'), { name: e.filename });
    const extra = e.message ? payloadOf(e.message) : { allowedMentions: { parse: [] as never[] } };
    for (const id of e.channelIds) {
      const ch = await text(id);
      if (ch) await ch.send({ ...extra, files: [file()] }).catch((err) => log(`transcript to ${id} failed: ${err instanceof Error ? err.message : err}`));
    }
    if (e.userId) await (await client().users.fetch(e.userId)).send({ ...extra, files: [file()] }).catch(() => log(`transcript DM to ${e.userId} failed (DMs closed?)`));
  }

  async function applyOne(e: TicketEffect, result: { channelId?: string }) {
    switch (e.type) {
      case 'create': result.channelId = await create(e); return;
      case 'access': {
        const ch = await text(e.channelId); if (!ch) return;
        const type = e.kind === 'user' ? OverwriteType.Member : OverwriteType.Role;
        if (e.view === null) { await ch.permissionOverwrites.delete(e.targetId, 'EN Polizei: Ticket-Zugriff entfernt').catch(() => undefined); return; }
        await ch.permissionOverwrites.edit(e.targetId, { ViewChannel: e.view, ReadMessageHistory: e.view, ...(e.send === undefined ? {} : { SendMessages: e.send, AttachFiles: e.send }) }, { type, reason: 'EN Polizei: Ticket-Zugriff' });
        return;
      }
      case 'rename': { const ch = await text(e.channelId); if (ch) await ch.setName(e.name, 'EN Polizei: Ticket umbenannt'); return; }
      case 'move': { const ch = await text(e.channelId); if (ch) await ch.setParent(e.parentId, { lockPermissions: false }); return; }
      case 'post': { const ch = await text(e.channelId); if (ch) await ch.send(payloadOf(e.message)); return; }
      case 'control': {
        const ch = await text(e.channelId); if (!ch) return;
        const msg = e.messageId ? await ch.messages.fetch(e.messageId).catch(() => null) : null;
        const edit = { ...payloadOf(e.message), content: undefined }; // Erwähnungen nicht erneut senden
        if (msg) await msg.edit(edit);
        else {
          const sent = await ch.send(edit);
          await api.service('POST', `/bot/support-tickets/${e.ticketId}/channel`, { channelId: ch.id, controlMessageId: sent.id }).catch(() => undefined);
        }
        return;
      }
      case 'dm': await (await client().users.fetch(e.userId)).send(payloadOf(e.message)).catch(() => log(`ticket DM to ${e.userId} failed (DMs closed?)`)); return;
      case 'transcript': await transcript(e); return;
      case 'delete': {
        // Sicherheitsnetz: nur bekannte Ticket-Channels löschen
        if (!channels.has(e.channelId)) await refresh();
        if (!channels.has(e.channelId)) { log(`refusing to delete ${e.channelId}: not a ticket channel`); return; }
        const ch = await text(e.channelId); if (!ch) return;
        setTimeout(() => void ch.delete('EN Polizei: Ticket gelöscht').then(() => channels.delete(e.channelId)).catch((err) => log(`ticket delete failed: ${err instanceof Error ? err.message : err}`)), e.delayMs);
        return;
      }
      case 'panel': {
        const ch = await text(e.channelId);
        if (!ch) throw new Error(`panel channel ${e.channelId} not found or not a text channel`);
        const old = e.messageId ? await ch.messages.fetch(e.messageId).catch(() => null) : null;
        const p = payloadOf(e.message);
        const msg = old ? await old.edit(p) : await ch.send(p);
        await api.service('POST', `/bot/support-tickets/panels/${e.panelId}/posted`, { channelId: ch.id, messageId: msg.id });
        return;
      }
    }
  }

  /** Effekte nacheinander ausführen; ein Fehler bei einem Effekt stoppt die übrigen nicht (außer beim Anlegen). */
  async function apply(effects: TicketEffect[]) {
    const result: { channelId?: string } = {};
    for (const e of effects) {
      try { await applyOne(e, result); }
      catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`ticket effect ${e.type} failed: ${msg}`);
        if (e.type === 'create') {
          await api.service('POST', `/bot/support-tickets/${e.ticketId}/abort`, { reason: msg.slice(0, 300) }).catch(() => undefined);
          throw new Error('Der Ticket-Kanal konnte nicht erstellt werden (fehlen dem Bot die Rechte „Kanäle verwalten“ / „Rollen verwalten“?).');
        }
      }
    }
    return result;
  }

  async function refresh() {
    try { const ids = await api.service<string[]>('GET', '/bot/support-tickets/channels'); channels.clear(); ids.forEach((i) => channels.add(i)); } catch { /* API kurz weg – alter Stand bleibt */ }
  }

  /** Nachrichten in Ticket-Channels fürs Dashboard und das Transcript mitschneiden. */
  async function onMessage(m: Message) {
    if (!m.inGuild() || !channels.has(m.channelId)) return;
    await api.service('POST', '/bot/support-tickets/messages', {
      channelId: m.channelId, discordMessageId: m.id, authorId: m.author.id, authorName: (m.member?.displayName ?? m.author.globalName ?? m.author.username).slice(0, 100),
      authorAvatar: m.author.displayAvatarURL({ size: 64 }), isBot: m.author.bot, content: m.content.slice(0, 8000),
      attachments: [...m.attachments.values()].slice(0, 10).map((a) => ({ name: a.name.slice(0, 200), url: a.url, size: a.size, contentType: a.contentType ?? null })),
      embeds: m.embeds.slice(0, 10).map((e) => ({ ...(e.title ? { title: e.title.slice(0, 256) } : {}), ...(e.description ? { description: e.description.slice(0, 4096) } : {}) })),
    }).catch((err) => log(`ticket message not recorded: ${err instanceof Error ? err.message : err}`));
  }

  async function listCategories(guildId: string) {
    const guild = await client().guilds.fetch(guildId);
    return [...(await guild.channels.fetch()).values()].filter((c) => c?.type === ChannelType.GuildCategory).map((c) => ({ id: c!.id, name: c!.name })).sort((a, b) => a.name.localeCompare(b.name));
  }

  return { apply, refresh, onMessage, listCategories, isTicketChannel: (id: string) => channels.has(id) };
}
