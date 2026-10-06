import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, ComponentType, EmbedBuilder, GatewayIntentBits, MessageFlags, ModalBuilder, OverwriteType, Partials,
  PermissionFlagsBits, SlashCommandBuilder, TextInputBuilder, TextInputStyle,
  type AnySelectMenuInteraction, type ButtonComponent, type ButtonInteraction, type ChatInputCommandInteraction, type Interaction, type Message, type ModalSubmitInteraction,
} from 'discord.js';
import { componentsOf, createTicketRuntime } from './discord-tickets';
import { startGuildDirectory } from './guilds';
import { HttpApi } from './api';
import { byName, COMMANDS, mapError } from './commands';
import { interactionFor } from './commands/features';
import { handleDirectMessage, sweepSessions } from './commands/qualifications';
import type { CommandDef, Ctx } from './commands/types';
import { guildIds, loadConfig, loadDotEnv } from './config';
import type { ButtonSpec, EmbedData, ModalSpec, Reply, SelectSpec } from './format';
import { createLive } from './live';
import { startOutboxLoop } from './outbox';
import type { DiscordConfig, Platform } from './platform';
import { robloxLookup } from './roblox';

loadDotEnv();
const cfg = loadConfig();
const api = new HttpApi(cfg.API_URL, cfg.BOT_API_TOKEN);
/**
 * Guilds: Slash-Commands, Buttons, Channels, Rollen. DirectMessages: Antworten auf Bewerbungsfragen per DM.
 * GuildMessages + MessageContent: Verlauf/Transcript der Support-Tickets. „Message Content“ ist ein privilegiertes Recht
 * (Developer Portal → Bot → Message Content Intent). Ist es dort aus, startet der Bot ohne – Tickets laufen dann ohne Nachrichtentexte.
 */
const makeClient = (withContent: boolean) => new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessages, ...(withContent ? [GatewayIntentBits.MessageContent] : [])],
  partials: [Partials.Channel],
});
let client = makeClient(true);
const tickets = createTicketRuntime(() => client, api);

const toEmbed = (e: EmbedData) => {
  const b = new EmbedBuilder().setTitle(e.title);
  if (e.description) b.setDescription(e.description);
  if (e.color !== undefined) b.setColor(e.color);
  if (e.fields?.length) b.addFields(e.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline ?? false })));
  if (e.footer) b.setFooter({ text: e.footer });
  if (e.thumbnail && /^https:\/\//.test(e.thumbnail)) b.setThumbnail(e.thumbnail);
  return b;
};
const STYLE = { primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger } as const;
/** Buttons in Reihen zu je max. 5 (Discord-Limit). */
const toRows = (buttons: ButtonSpec[] = []) => {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length && rows.length < 5; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5).map((b) => {
      const x = b.url ? new ButtonBuilder().setURL(b.url).setLabel(b.label).setStyle(ButtonStyle.Link) : new ButtonBuilder().setCustomId(b.id).setLabel(b.label).setStyle(STYLE[b.style]);
      if (b.emoji) x.setEmoji(b.emoji);
      return x;
    })));
  }
  return rows;
};
/** Auswahlmenüs als eigene Reihen über den Buttons. */
const toComponents = (buttons?: ButtonSpec[], select?: SelectSpec, selects: SelectSpec[] = []) => componentsOf(buttons, [...(select ? [select] : []), ...selects]);
const toModal = (m: ModalSpec) => new ModalBuilder().setCustomId(m.id).setTitle(m.title.slice(0, 45)).addComponents(m.fields.map((f) => {
  const input = new TextInputBuilder().setCustomId(f.id).setLabel(f.label.slice(0, 45)).setStyle(f.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(!!f.required);
  if (f.maxLength) input.setMaxLength(f.maxLength);
  if (f.placeholder) input.setPlaceholder(f.placeholder.slice(0, 100));
  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}));
const replyPayload = (r: Reply) => ({ content: r.content ?? '', embeds: (r.embeds ?? []).map(toEmbed), components: toComponents(r.buttons, r.select, r.selects), allowedMentions: { parse: [] as never[] } });

const TICKET_PREFIX = 'ticket-';
const ticketName = (userName: string, userId: string) => `${TICKET_PREFIX}${userName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || userId}`;

/** Echte Discord-Umsetzung der Plattform-Aktionen (in Tests ein Fake). */
const platform: Platform = {
  async setRole(guildId, userId, roleId, on) {
    const member = await (await client.guilds.fetch(guildId)).members.fetch(userId);
    if (on) await member.roles.add(roleId, 'EN Polizei'); else await member.roles.remove(roleId, 'EN Polizei');
  },
  async createTicketChannel({ guildId, userId, userName, categoryId, staffRoleId, extraUserIds = [] }) {
    const guild = await client.guilds.fetch(guildId);
    const channels = await guild.channels.fetch();
    // Ein offenes Ticket pro Person: erkannt an der Benutzer-ID im Channel-Thema
    const existing = channels.find((c) => c?.type === ChannelType.GuildText && c.name.startsWith(TICKET_PREFIX) && c.topic?.includes(`(${userId})`));
    if (existing) return { channelId: existing.id, existing: true };
    const view = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles];
    const ch = await guild.channels.create({
      name: ticketName(userName, userId), type: ChannelType.GuildText, topic: `Support-Ticket von ${userName} (${userId})`,
      ...(categoryId && channels.get(categoryId)?.type === ChannelType.GuildCategory ? { parent: categoryId } : {}),
      permissionOverwrites: [
        { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
        { id: userId, type: OverwriteType.Member, allow: view },
        { id: client.user!.id, type: OverwriteType.Member, allow: [...view, PermissionFlagsBits.ManageChannels] },
        ...(staffRoleId ? [{ id: staffRoleId, type: OverwriteType.Role, allow: view }] : []),
        ...extraUserIds.filter((id) => id !== userId).map((id) => ({ id, type: OverwriteType.Member, allow: view })),
      ],
    });
    return { channelId: ch.id, existing: false };
  },
  async deleteChannel(channelId, delayMs = 0) {
    const ch = await client.channels.fetch(channelId);
    // Sicherheitsnetz: der Bot löscht ausschließlich eigene Ticket-Channels
    if (!ch || ch.type !== ChannelType.GuildText || !ch.name.startsWith(TICKET_PREFIX)) throw new Error('not a ticket channel');
    setTimeout(() => void ch.delete('Support-Ticket geschlossen').catch((e) => console.error('ticket delete failed:', e instanceof Error ? e.message : e)), delayMs);
  },
  async sendDirectMessage(userId, text) {
    await (await client.users.fetch(userId)).send({ content: text, allowedMentions: { parse: [] } });
  },
  async sendDm(userId, { embed, buttons, select }) {
    const m = await (await client.users.fetch(userId)).send({ embeds: [toEmbed(embed)], components: toComponents(buttons, select), allowedMentions: { parse: [] } });
    return { channelId: m.channelId, messageId: m.id };
  },
  async postOrEdit({ channelId, messageId, embed, buttons }) {
    const ch = await client.channels.fetch(channelId);
    if (!ch?.isSendable() || !('messages' in ch)) throw new Error(`channel ${channelId} is not a text channel the bot can post in`);
    const payload = { embeds: [toEmbed(embed)], components: toRows(buttons), allowedMentions: { parse: [] as never[] } };
    if (messageId) {
      const old = await ch.messages.fetch(messageId).catch(() => null); // gelöscht → neu senden
      if (old) { await old.edit(payload); return old.id; }
    }
    return (await ch.send(payload)).id;
  },
  async postPanel({ channelId, embed, buttons, select }) {
    const ch = await client.channels.fetch(channelId);
    if (!ch?.isSendable()) throw new Error(`channel ${channelId} is not a text channel the bot can post in`);
    await ch.send({ embeds: [toEmbed(embed)], components: toComponents(buttons, select), allowedMentions: { parse: [] } });
  },
};
const live = createLive(api, platform);

function toBuilder(def: CommandDef) {
  const b = new SlashCommandBuilder().setName(def.name).setDescription(def.description);
  for (const o of def.options ?? []) {
    const common = (x: { setName(n: string): unknown; setDescription(d: string): unknown; setRequired(r: boolean): unknown }) => { x.setName(o.name); x.setDescription(o.description); x.setRequired(!!o.required); };
    if (o.type === 'string') b.addStringOption((x) => { common(x); if (o.maxLength) x.setMaxLength(o.maxLength); if (o.choices) x.addChoices(...o.choices); return x; });
    else if (o.type === 'integer') b.addIntegerOption((x) => { common(x); if (o.min !== undefined) x.setMinValue(o.min); if (o.max !== undefined) x.setMaxValue(o.max); return x; });
    else if (o.type === 'boolean') b.addBooleanOption((x) => { common(x); return x; });
    else if (o.type === 'user') b.addUserOption((x) => { common(x); return x; });
    else b.addNumberOption((x) => { common(x); if (o.min !== undefined) x.setMinValue(o.min); if (o.max !== undefined) x.setMaxValue(o.max); return x; });
  }
  return b.toJSON();
}

/** Server-Beitritt des Mitglieds (voller GuildMember oder rohe API-Daten). */
function joinedAtOf(m: unknown): string | undefined {
  const x = m as { joinedTimestamp?: number | null; joined_at?: string } | null;
  const t = x?.joinedTimestamp ?? (x?.joined_at ? Date.parse(x.joined_at) : NaN);
  return typeof t === 'number' && Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

/** Nach einer Entscheidung: Bewerbungs-Nachricht einfärben, Feld „Entscheidung“ anhängen, Entscheidungs-Buttons entfernen. */
async function markDecided(message: Message, d: { text: string; color: number }) {
  const embeds = message.embeds.map((e, i, all) => {
    const b = EmbedBuilder.from(e).setColor(d.color);
    if (i === all.length - 1) b.addFields({ name: 'Entscheidung', value: d.text.slice(0, 1024) });
    return b;
  });
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (const row of message.components) {
    if (!('components' in row)) continue;
    const kept = row.components.filter((c): c is ButtonComponent => c.type === ComponentType.Button && !/^quali:(decide|reason):/.test(c.customId ?? ''));
    if (kept.length) rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(kept.map((c) => ButtonBuilder.from(c))));
  }
  await message.edit({ embeds, components: rows, allowedMentions: { parse: [] } });
}

/** Gemeinsamer Kontext für Befehle, Buttons und Formulare. */
function baseCtx(i: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction): Omit<Ctx, 'opts'> {
  const perms = i.memberPermissions;
  return {
    discordId: i.user.id, api, platform, userName: i.user.username, memberJoinedAt: joinedAtOf(i.member),
    guildId: i.guildId ?? undefined, channelId: i.channelId ?? undefined,
    isGuildAdmin: !!perms && (perms.has(PermissionFlagsBits.ManageGuild) || perms.has(PermissionFlagsBits.Administrator)),
    config: () => api.service<DiscordConfig>('GET', '/bot/config'),
    refreshLive: (kind, o) => live.refresh(kind, o),
    robloxLookup: (name) => robloxLookup(name),
    memberRoleIds: rolesOf(i.member),
    applyEffects: (effects) => tickets.apply(effects),
    listCategories: (guildId) => tickets.listCategories(guildId),
    userNameOf: (id) => client.users.fetch(id).then((u) => u.username, () => null),
  };
}

/** Rollen-IDs des Mitglieds (voller GuildMember oder rohe API-Daten). */
function rolesOf(m: unknown): string[] {
  const x = m as { roles?: string[] | { cache?: Map<string, unknown> } } | null;
  if (!x?.roles) return [];
  return Array.isArray(x.roles) ? x.roles : [...(x.roles.cache?.keys() ?? [])];
}

async function safeRun(label: string, fn: () => Promise<Reply>): Promise<Reply> {
  try { return await fn(); } catch (e) {
    console.error(`${label} failed:`, e instanceof Error ? e.message : e);
    return mapError(e);
  }
}

async function handleCommand(i: ChatInputCommandInteraction) {
  const def = byName(i.commandName);
  if (!def) return;
  const opts: Record<string, string | number | boolean | undefined> = {};
  for (const o of def.options ?? []) { const v = i.options.get(o.name)?.value; opts[o.name] = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : undefined; }
  if (def.opensModal) {
    // Formulare müssen die erste Antwort sein – kein deferReply vorher.
    const reply = await safeRun(`command ${def.name}`, () => def.run({ ...baseCtx(i), opts }));
    if (reply.modal) await i.showModal(toModal(reply.modal));
    else await i.reply({ ...replyPayload(reply), flags: MessageFlags.Ephemeral });
    return;
  }
  // Antworten sind immer nur für den Aufrufer sichtbar (Daten gehören nicht in öffentliche Channels).
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const reply = await safeRun(`command ${def.name}`, () => def.run({ ...baseCtx(i), opts }));
  await i.editReply(replyPayload(reply));
}

async function handleComponent(i: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction) {
  const hit = interactionFor(i.customId);
  if (!hit) return;
  if (i.isButton() && hit.def.opensModal?.(hit.args)) {
    // Formulare müssen die erste Antwort sein – kein deferReply vorher.
    const reply = await safeRun(`interaction ${i.customId}`, () => hit.def.run({ ...baseCtx(i), opts: {}, args: hit.args }));
    if (reply.modal) await i.showModal(toModal(reply.modal));
    else await i.reply({ ...replyPayload(reply), flags: MessageFlags.Ephemeral });
    return;
  }
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const fields = i.isModalSubmit() ? Object.fromEntries(i.fields.fields.map((f, id) => [id, 'value' in f ? String(f.value) : ''])) : undefined;
  const values = i.isAnySelectMenu() ? i.values : undefined;
  const reply = await safeRun(`interaction ${i.customId}`, () => hit.def.run({ ...baseCtx(i), opts: {}, args: hit.args, fields, values }));
  await i.editReply(replyPayload(reply));
  const source = i.isModalSubmit() ? (i.isFromMessage() ? i.message : null) : i.message;
  if (reply.decided && source) await markDecided(source, reply.decided).catch((e) => console.error('could not update the application message:', e instanceof Error ? e.message : e));
  if (reply.update && source) await source.edit({ embeds: (reply.update.embeds ?? []).map(toEmbed), components: toComponents(reply.update.buttons), allowedMentions: { parse: [] } }).catch((e) => console.error('could not update message:', e instanceof Error ? e.message : e));
}

function wire(c: Client) {
  c.on('interactionCreate', (i: Interaction) => {
    const task = i.isChatInputCommand() ? handleCommand(i) : i.isButton() || i.isModalSubmit() || i.isAnySelectMenu() ? handleComponent(i) : undefined;
    void task?.catch((e) => console.error('interaction failed:', e instanceof Error ? e.message : e));
  });

  // Direktnachrichten: Antworten auf Bewerbungsfragen (Bewerbung bei EN Polizei und Qualifikationen)
  c.on('messageCreate', (m: Message) => {
    if (m.inGuild()) { void tickets.onMessage(m); return; } // Verlauf der Support-Tickets
    if (m.author.bot) return;
    void handleDirectMessage({ userId: m.author.id, userName: m.author.username, content: m.content, api, sendDm: (u, msg) => platform.sendDm(u, msg), robloxLookup: (n) => robloxLookup(n) })
      .catch((e) => console.error('direct message handling failed:', e instanceof Error ? e.message : e));
  });
}

setInterval(() => sweepSessions(), 10 * 60_000).unref();

/** Rollen auf allen Servern abgleichen, auf denen es sie gibt (Dienst-Rollen). Nur tatsächlich nötige Änderungen. */
async function syncRolesEverywhere(userId: string, add: string[], remove: string[]) {
  for (const g of client.guilds.cache.values()) {
    const present = [...add, ...remove].filter((r) => g.roles.cache.has(r));
    if (!present.length) continue;
    const member = await g.members.fetch(userId).catch(() => null);
    if (!member) continue;
    const toRemove = remove.filter((r) => g.roles.cache.has(r) && member.roles.cache.has(r));
    const toAdd = add.filter((r) => g.roles.cache.has(r) && !member.roles.cache.has(r));
    if (toRemove.length) await member.roles.remove(toRemove, 'EN Polizei: Dienststatus');
    if (toAdd.length) await member.roles.add(toAdd, 'EN Polizei: Dienststatus');
  }
}

/** Rolle auf allen Servern vergeben, auf denen es sie gibt (angenommene Bewerbung). */
async function grantRoleEverywhere(userId: string, roleId: string) {
  let found = false;
  for (const g of client.guilds.cache.values()) {
    const role = g.roles.cache.get(roleId) ?? await g.roles.fetch(roleId).catch(() => null);
    if (!role) continue;
    found = true;
    const member = await g.members.fetch(userId).catch(() => null);
    if (member) await member.roles.add(roleId, 'EN Polizei: Bewerbung angenommen');
  }
  if (!found) throw new Error('role not found on any server');
}

/** Beim Start prüfen, ob das System erreichbar ist (nur Hinweis – der Bot läuft auch ohne API weiter). */
async function checkApi() {
  try {
    const res = await fetch(`${cfg.API_URL}/health`, { signal: AbortSignal.timeout(8000) });
    console.log(res.ok ? `API reachable at ${cfg.API_URL}` : `API answered HTTP ${res.status} at ${cfg.API_URL}/health — commands will fail until the system is running (502 = app behind the proxy is not running)`);
  } catch {
    console.log(`API NOT reachable at ${cfg.API_URL} — the bot runs, but commands will say "system not reachable" until the system is up`);
  }
}

function wireReady(client0: Client) {
  client0.once('clientReady', async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  // Einladungs-Link (Administrator-Rechte, wie im Dashboard)
  console.log(`Bot einladen: https://discord.com/oauth2/authorize?client_id=${c.user.id}&scope=bot%20applications.commands&permissions=8`);
  console.log(`Server (${c.guilds.cache.size}): ${[...c.guilds.cache.values()].map((g) => g.name).join(', ') || 'keiner – Bot mit dem Link oben einladen'}`);
  void checkApi();
  const json = COMMANDS.map(toBuilder);
  const guilds = guildIds(cfg);
  if (guilds.length) {
    // Frühere globale Registrierung entfernen – sonst erscheinen alle Befehle doppelt (global + Server)
    try { await c.application.commands.set([]); } catch (e) { console.error(`could not clear global commands: ${e instanceof Error ? e.message : e}`); }
    for (const g of guilds) {
      try { await c.application.commands.set(json, g); console.log(`${json.length} slash commands registered for guild ${g}`); }
      catch (e) { console.error(`could not register commands for guild ${g} (is the bot invited there with the applications.commands scope?): ${e instanceof Error ? e.message : e}`); }
    }
  } else {
    await c.application.commands.set(json);
    console.log(`${json.length} slash commands registered globally (can take up to an hour to appear)`);
    // Frühere Server-Registrierungen entfernen – sonst erscheinen alle Befehle doppelt
    for (const g of c.guilds.cache.keys()) {
      try { await c.application.commands.set([], g); } catch { /* Server ohne Befehle/Zugriff: egal */ }
    }
  }
  startOutboxLoop(api, async (channelId, embeds, buttons, opts) => {
    const ch = await client.channels.fetch(channelId);
    if (!ch?.isSendable()) throw new Error(`channel ${channelId} is not a text channel the bot can post in`);
    // Profilbild des Bewerbers rechts (wie bei Appy)
    const avatar = opts?.avatarUserId ? await client.users.fetch(opts.avatarUserId).then((u) => u.displayAvatarURL({ size: 256 }), () => undefined) : undefined;
    const list = avatar && embeds[0] ? [{ ...embeds[0], thumbnail: avatar }, ...embeds.slice(1)] : embeds;
    // Nur die ausdrücklich eingestellten Rollen pingen – niemals @everyone/@here
    const roles = opts?.pingRoleIds ?? [];
    const msg = await ch.send({ ...(roles.length ? { content: roles.map((r) => `<@&${r}>`).join(' ') } : {}), embeds: list.map(toEmbed), components: toRows(buttons), allowedMentions: { parse: [], roles } });
    // Staff-Thread zur Bewerbung (braucht im Channel das Recht „Öffentliche Threads erstellen“)
    if (opts?.thread) await msg.startThread({ name: opts.thread, autoArchiveDuration: 10080 }).catch((e) => console.error('could not create staff thread:', e instanceof Error ? e.message : e));
  }, cfg.OUTBOX_POLL_SECONDS, console.log, (userId, text) => platform.sendDirectMessage(userId, text), grantRoleEverywhere, syncRolesEverywhere, () => void live.refresh('teamlist').catch(() => undefined),
    (effects) => tickets.apply(effects).then(() => undefined, (e) => console.error('ticket effects failed:', e instanceof Error ? e.message : e)));
  live.start(cfg.LIVE_REFRESH_SECONDS);
  void tickets.refresh();
  startGuildDirectory(() => client, api);
  setInterval(() => void tickets.refresh(), 120_000).unref();
  });
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { void client.destroy().finally(() => process.exit(0)); });
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e instanceof Error ? e.message : e));
/** Start; ist „Message Content Intent“ im Developer Portal aus, ohne dieses Recht neu verbinden. */
async function start() {
  wire(client); wireReady(client);
  try { await client.login(cfg.DISCORD_TOKEN); }
  catch (e) {
    if (!/disallowed intents/i.test(e instanceof Error ? e.message : String(e))) throw e;
    console.warn('Discord: "Message Content Intent" is not enabled in the Developer Portal (Bot → Privileged Gateway Intents). Starting without it – ticket transcripts will not contain message texts.');
    await client.destroy().catch(() => undefined);
    client = makeClient(false);
    wire(client); wireReady(client);
    await client.login(cfg.DISCORD_TOKEN);
  }
}
void start().catch((e) => { console.error('Discord login failed:', e instanceof Error ? e.message : e); process.exit(1); });
