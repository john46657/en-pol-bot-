import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, ComponentType, EmbedBuilder, FileUploadBuilder, LabelBuilder, ModalBuilder, OverwriteType, PermissionFlagsBits, RoleSelectMenuBuilder,
  StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder,
  type Client, type Message, type MessageActionRowComponentBuilder, type ModalSubmitInteraction, type TextChannel,
} from 'discord.js';
import type { ComponentButton, ComponentSelect, EmbedSpec, FormFile, MessageSpec, TicketEffect } from '@enrp/shared';
import type { ModalSpec } from './format';
import type { Api } from './api';

const STYLE = { primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger } as const;
const VIEW = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory];
const TALK = [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];
const https = (u?: string | null) => (u && /^(https:\/\/|attachment:\/\/)/.test(u) ? u : undefined);

/** `stamp`: ohne eigenen Zeitstempel Datum/Uhrzeit des Sendens unten anzeigen (nicht beim Embed-Baukasten – dort entscheidet der Schalter). */
export function embedOf(e: EmbedSpec, stamp = true) {
  const b = new EmbedBuilder();
  if (e.title) b.setTitle(e.title.slice(0, 256));
  if (e.description) b.setDescription(e.description.slice(0, 4096));
  if (e.color !== undefined) b.setColor(e.color);
  if (https(e.thumbnail)) b.setThumbnail(e.thumbnail!);
  if (https(e.image)) b.setImage(e.image!);
  if (e.url && /^https?:\/\//.test(e.url)) b.setURL(e.url); // Titel als Link
  if (e.author) b.setAuthor({ name: e.author.slice(0, 256), ...(https(e.authorIcon) ? { iconURL: e.authorIcon } : {}) });
  if (e.footer) b.setFooter({ text: e.footer.slice(0, 2048), ...(https(e.footerIcon) ? { iconURL: e.footerIcon } : {}) });
  if (e.fields?.length) b.addFields(e.fields.slice(0, 25).map((f) => ({ name: f.name.slice(0, 256) || '​', value: f.value.slice(0, 1024) || '​', inline: f.inline ?? false })));
  if (e.timestamp) b.setTimestamp(new Date(e.timestamp));
  else if (stamp) b.setTimestamp(new Date());
  if (!e.title && !e.description && !e.fields?.length && !https(e.image)) b.setDescription('​');
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

export function payloadOf(m: MessageSpec, stamp = true) {
  return {
    ...(m.content ? { content: m.content.slice(0, 2000) } : {}),
    embeds: (m.embeds ?? []).slice(0, 10).map((e) => embedOf(e, stamp)),
    components: componentsOf(m.buttons, [...(m.select ? [m.select] : []), ...(m.selects ?? [])]),
    // Nur ausdrücklich gewünschte Erwähnungen pingen – niemals @everyone/@here
    allowedMentions: { parse: [] as never[], users: m.mentionUsers ?? [], roles: m.mentionRoles ?? [] },
  };
}

/**
 * Discord-Formular. Reine Textformulare wie bisher (Textfelder in Reihen); sobald ein Feld eine Auswahl, einen Datei-Upload oder
 * eine Beschreibung hat, mit Beschriftungen (Label-Komponenten) – so unterstützt Discord Auswahlmenüs und Uploads in Formularen.
 */
export function modalOf(m: ModalSpec) {
  const modal = new ModalBuilder().setCustomId(m.id).setTitle(m.title.slice(0, 45));
  const text = (f: ModalSpec['fields'][number], withLabel: boolean) => {
    const input = new TextInputBuilder().setCustomId(f.id).setStyle(f.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(!!f.required);
    if (withLabel) input.setLabel(f.label.slice(0, 45));
    if (f.maxLength) input.setMaxLength(f.maxLength);
    if (f.minLength) input.setMinLength(Math.min(f.minLength, f.maxLength ?? 4000));
    if (f.placeholder) input.setPlaceholder(f.placeholder.slice(0, 100));
    if (f.value) input.setValue(f.value.slice(0, f.maxLength ?? 4000));
    return input;
  };
  const fields = m.fields.slice(0, 5);
  if (!fields.some((f) => (f.kind && f.kind !== 'text') || f.description)) return modal.addComponents(fields.map((f) => new ActionRowBuilder<TextInputBuilder>().addComponents(text(f, true))));
  return modal.addLabelComponents(fields.map((f) => {
    const label = new LabelBuilder().setLabel(f.label.slice(0, 45));
    if (f.description) label.setDescription(f.description.slice(0, 100));
    if (f.kind === 'select') {
      const opts = (f.options ?? []).slice(0, 25);
      const max = Math.max(1, Math.min(f.maxValues ?? 1, opts.length));
      const sel = new StringSelectMenuBuilder().setCustomId(f.id).setRequired(!!f.required).setMinValues(Math.min(f.minValues ?? (f.required ? 1 : 0), max)).setMaxValues(max)
        .addOptions(opts.map((o) => ({ label: o.label.slice(0, 100), value: o.value.slice(0, 100), ...(o.default ? { default: true } : {}) })));
      if (f.placeholder) sel.setPlaceholder(f.placeholder.slice(0, 150));
      return label.setStringSelectMenuComponent(sel);
    }
    if (f.kind === 'file') {
      const max = Math.max(1, Math.min(f.maxValues ?? 1, 10));
      return label.setFileUploadComponent(new FileUploadBuilder().setCustomId(f.id).setRequired(!!f.required).setMinValues(Math.min(f.minValues ?? 0, max)).setMaxValues(max));
    }
    return label.setTextInputComponent(text(f, false));
  }));
}

/** Alle Eingaben eines abgeschickten Formulars: Text, Auswahl (Liste), Kontrollkästchen und hochgeladene Dateien (Discord-CDN). */
export function modalValuesOf(i: Pick<ModalSubmitInteraction, 'fields'>) {
  const values: Record<string, string | string[] | boolean> = {};
  const files: Record<string, FormFile[]> = {};
  for (const [id, f] of i.fields.fields) {
    switch (f.type) {
      case ComponentType.TextInput: values[id] = f.value; break;
      case ComponentType.StringSelect: values[id] = [...(f.values ?? [])]; break;
      case ComponentType.Checkbox: values[id] = f.value; break;
      case ComponentType.CheckboxGroup: values[id] = [...f.values]; break;
      case ComponentType.RadioGroup: if (f.value) values[id] = f.value; break;
      case ComponentType.FileUpload: files[id] = [...f.attachments.values()].slice(0, 10).map((a) => ({ name: a.name.slice(0, 200), url: a.url, size: a.size, contentType: a.contentType ?? null })); break;
      default: break;
    }
  }
  return { values, files };
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
        try {
          const ch = await text(e.channelId);
          if (!ch) throw new Error('Der Kanal wurde nicht gefunden oder ist kein Textkanal (Kanal gelöscht oder Bot sieht ihn nicht).');
          const old = e.messageId ? await ch.messages.fetch(e.messageId).catch(() => null) : null;
          const p = payloadOf(e.message);
          const msg = old ? await old.edit(p) : await ch.send(p);
          await api.service('POST', `/bot/support-tickets/panels/${e.panelId}/posted`, { channelId: ch.id, messageId: msg.id });
        } catch (err) {
          // Fehler im Dashboard anzeigen (fehlende Rechte, gelöschter Kanal …) – ohne Geheimnisse, nur die Discord-Meldung
          const raw = err instanceof Error ? err.message : String(err);
          const why = /Missing Permissions/i.test(raw) ? 'Dem Bot fehlen im Kanal Rechte (Nachrichten senden, Links einbetten).' : /Missing Access/i.test(raw) ? 'Der Bot hat keinen Zugriff auf den Kanal.' : /Unknown Channel/i.test(raw) ? 'Den Kanal gibt es nicht mehr.' : raw;
          await api.service('POST', `/bot/support-tickets/panels/${e.panelId}/failed`, { error: why.slice(0, 500) }).catch(() => undefined);
          throw err;
        }
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
