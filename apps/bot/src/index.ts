import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, GatewayIntentBits, MessageFlags, ModalBuilder, OverwriteType,
  PermissionFlagsBits, SlashCommandBuilder, TextInputBuilder, TextInputStyle,
  type ButtonInteraction, type ChatInputCommandInteraction, type Interaction, type ModalSubmitInteraction,
} from 'discord.js';
import { HttpApi } from './api';
import { byName, COMMANDS, mapError } from './commands';
import { interactionFor } from './commands/features';
import type { CommandDef, Ctx } from './commands/types';
import { guildIds, loadConfig, loadDotEnv } from './config';
import type { ButtonSpec, EmbedData, ModalSpec, Reply } from './format';
import { createLive } from './live';
import { startOutboxLoop } from './outbox';
import type { DiscordConfig, Platform } from './platform';
import { robloxLookup } from './roblox';

loadDotEnv();
const cfg = loadConfig();
const api = new HttpApi(cfg.API_URL, cfg.BOT_API_TOKEN);
// Nur Guilds-Intent: Slash-Commands, Buttons, Channels und Rollen brauchen weder Message-Content noch Member-Intents (keine „privileged intents“).
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const toEmbed = (e: EmbedData) => {
  const b = new EmbedBuilder().setTitle(e.title);
  if (e.description) b.setDescription(e.description);
  if (e.color !== undefined) b.setColor(e.color);
  if (e.fields?.length) b.addFields(e.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline ?? false })));
  if (e.footer) b.setFooter({ text: e.footer });
  return b;
};
const STYLE = { primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger } as const;
/** Buttons in Reihen zu je max. 5 (Discord-Limit). */
const toRows = (buttons: ButtonSpec[] = []) => {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length && rows.length < 5; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5).map((b) => {
      const x = new ButtonBuilder().setCustomId(b.id).setLabel(b.label).setStyle(STYLE[b.style]);
      if (b.emoji) x.setEmoji(b.emoji);
      return x;
    })));
  }
  return rows;
};
const toModal = (m: ModalSpec) => new ModalBuilder().setCustomId(m.id).setTitle(m.title.slice(0, 45)).addComponents(m.fields.map((f) => {
  const input = new TextInputBuilder().setCustomId(f.id).setLabel(f.label.slice(0, 45)).setStyle(f.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(!!f.required);
  if (f.maxLength) input.setMaxLength(f.maxLength);
  if (f.placeholder) input.setPlaceholder(f.placeholder.slice(0, 100));
  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}));
const replyPayload = (r: Reply) => ({ content: r.content ?? '', embeds: (r.embeds ?? []).map(toEmbed), components: toRows(r.buttons), allowedMentions: { parse: [] as never[] } });

const TICKET_PREFIX = 'ticket-';
const ticketName = (userName: string, userId: string) => `${TICKET_PREFIX}${userName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || userId}`;

/** Echte Discord-Umsetzung der Plattform-Aktionen (in Tests ein Fake). */
const platform: Platform = {
  async setRole(guildId, userId, roleId, on) {
    const member = await (await client.guilds.fetch(guildId)).members.fetch(userId);
    if (on) await member.roles.add(roleId, 'EN Polizei: Funk-Freigabe'); else await member.roles.remove(roleId, 'EN Polizei: Funk-Freigabe entzogen');
  },
  async createTicketChannel({ guildId, userId, userName, categoryId, staffRoleId }) {
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
  async postPanel({ channelId, embed, buttons }) {
    const ch = await client.channels.fetch(channelId);
    if (!ch?.isSendable()) throw new Error(`channel ${channelId} is not a text channel the bot can post in`);
    await ch.send({ embeds: [toEmbed(embed)], components: toRows(buttons), allowedMentions: { parse: [] } });
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

/** Gemeinsamer Kontext für Befehle, Buttons und Formulare. */
function baseCtx(i: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction): Omit<Ctx, 'opts'> {
  const perms = i.memberPermissions;
  return {
    discordId: i.user.id, api, platform, userName: i.user.username,
    guildId: i.guildId ?? undefined, channelId: i.channelId ?? undefined,
    isGuildAdmin: !!perms && (perms.has(PermissionFlagsBits.ManageGuild) || perms.has(PermissionFlagsBits.Administrator)),
    config: () => api.service<DiscordConfig>('GET', '/bot/config'),
    refreshLive: (kind, o) => live.refresh(kind, o),
    robloxLookup: (name) => robloxLookup(name),
  };
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

async function handleComponent(i: ButtonInteraction | ModalSubmitInteraction) {
  const hit = interactionFor(i.customId);
  if (!hit) return;
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const fields = i.isModalSubmit() ? Object.fromEntries(i.fields.fields.map((f, id) => [id, 'value' in f ? String(f.value) : ''])) : undefined;
  const reply = await safeRun(`interaction ${i.customId}`, () => hit.def.run({ ...baseCtx(i), opts: {}, args: hit.args, fields }));
  await i.editReply(replyPayload(reply));
}

client.on('interactionCreate', (i: Interaction) => {
  const task = i.isChatInputCommand() ? handleCommand(i) : i.isButton() || i.isModalSubmit() ? handleComponent(i) : undefined;
  void task?.catch((e) => console.error('interaction failed:', e instanceof Error ? e.message : e));
});

/** Beim Start prüfen, ob das System erreichbar ist (nur Hinweis – der Bot läuft auch ohne API weiter). */
async function checkApi() {
  try {
    const res = await fetch(`${cfg.API_URL}/health`, { signal: AbortSignal.timeout(8000) });
    console.log(res.ok ? `API reachable at ${cfg.API_URL}` : `API answered HTTP ${res.status} at ${cfg.API_URL}/health — commands will fail until the system is running (502 = app behind the proxy is not running)`);
  } catch {
    console.log(`API NOT reachable at ${cfg.API_URL} — the bot runs, but commands will say "system not reachable" until the system is up`);
  }
}

client.once('clientReady', async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  void checkApi();
  const json = COMMANDS.map(toBuilder);
  const guilds = guildIds(cfg);
  if (guilds.length) {
    for (const g of guilds) {
      try { await c.application.commands.set(json, g); console.log(`${json.length} slash commands registered for guild ${g}`); }
      catch (e) { console.error(`could not register commands for guild ${g} (is the bot invited there with the applications.commands scope?): ${e instanceof Error ? e.message : e}`); }
    }
  } else {
    await c.application.commands.set(json);
    console.log(`${json.length} slash commands registered globally (can take up to an hour to appear)`);
  }
  startOutboxLoop(api, async (channelId, embed) => {
    const ch = await client.channels.fetch(channelId);
    if (!ch?.isSendable()) throw new Error(`channel ${channelId} is not a text channel the bot can post in`);
    await ch.send({ embeds: [toEmbed(embed)], allowedMentions: { parse: [] } }); // niemals @everyone/@here/Rollen pingen
  }, cfg.OUTBOX_POLL_SECONDS, console.log, (userId, text) => platform.sendDirectMessage(userId, text));
  live.start(cfg.LIVE_REFRESH_SECONDS);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { void client.destroy().finally(() => process.exit(0)); });
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e instanceof Error ? e.message : e));
void client.login(cfg.DISCORD_TOKEN);
