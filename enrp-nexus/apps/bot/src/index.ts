import { Client, EmbedBuilder, GatewayIntentBits, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { HttpApi } from './api';
import { byName, COMMANDS, mapError } from './commands';
import type { CommandDef } from './commands/types';
import { loadConfig } from './config';
import type { EmbedData, Reply } from './format';
import { startOutboxLoop } from './outbox';

const cfg = loadConfig();
const api = new HttpApi(cfg.API_URL, cfg.BOT_API_TOKEN);
// Nur Guilds-Intent: Slash-Commands brauchen weder Message-Content noch Member-Intents (keine „privileged intents“).
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const toEmbed = (e: EmbedData) => {
  const b = new EmbedBuilder().setTitle(e.title);
  if (e.description) b.setDescription(e.description);
  if (e.color !== undefined) b.setColor(e.color);
  if (e.fields?.length) b.addFields(e.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline ?? false })));
  if (e.footer) b.setFooter({ text: e.footer });
  return b;
};

function toBuilder(def: CommandDef) {
  const b = new SlashCommandBuilder().setName(def.name).setDescription(def.description);
  for (const o of def.options ?? []) {
    const common = (x: { setName(n: string): unknown; setDescription(d: string): unknown; setRequired(r: boolean): unknown }) => { x.setName(o.name); x.setDescription(o.description); x.setRequired(!!o.required); };
    if (o.type === 'string') b.addStringOption((x) => { common(x); if (o.maxLength) x.setMaxLength(o.maxLength); if (o.choices) x.addChoices(...o.choices); return x; });
    else if (o.type === 'integer') b.addIntegerOption((x) => { common(x); if (o.min !== undefined) x.setMinValue(o.min); if (o.max !== undefined) x.setMaxValue(o.max); return x; });
    else b.addNumberOption((x) => { common(x); if (o.min !== undefined) x.setMinValue(o.min); if (o.max !== undefined) x.setMaxValue(o.max); return x; });
  }
  return b.toJSON();
}

async function handle(i: ChatInputCommandInteraction) {
  const def = byName(i.commandName);
  if (!def) return;
  // Antworten sind immer nur für den Aufrufer sichtbar (Daten gehören nicht in öffentliche Channels).
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  let reply: Reply;
  try {
    const opts: Record<string, string | number | boolean | undefined> = {};
    for (const o of def.options ?? []) { const v = i.options.get(o.name)?.value; opts[o.name] = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : undefined; }
    reply = await def.run({ discordId: i.user.id, opts, api });
  } catch (e) {
    console.error(`command ${def.name} failed:`, e instanceof Error ? e.message : e);
    reply = mapError(e);
  }
  await i.editReply({ content: reply.content ?? '', embeds: (reply.embeds ?? []).map(toEmbed), allowedMentions: { parse: [] } });
}

client.on('interactionCreate', (i) => { if (i.isChatInputCommand()) void handle(i).catch((e) => console.error('interaction failed:', e instanceof Error ? e.message : e)); });

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
  if (cfg.DISCORD_GUILD_ID) await c.application.commands.set(json, cfg.DISCORD_GUILD_ID);
  else await c.application.commands.set(json);
  console.log(`${json.length} slash commands registered ${cfg.DISCORD_GUILD_ID ? `for guild ${cfg.DISCORD_GUILD_ID}` : 'globally (can take up to an hour to appear)'}`);
  startOutboxLoop(api, async (channelId, embed) => {
    const ch = await client.channels.fetch(channelId);
    if (!ch?.isSendable()) throw new Error(`channel ${channelId} is not a text channel the bot can post in`);
    await ch.send({ embeds: [toEmbed(embed)], allowedMentions: { parse: [] } }); // niemals @everyone/@here/Rollen pingen
  }, cfg.OUTBOX_POLL_SECONDS);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { void client.destroy().finally(() => process.exit(0)); });
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e instanceof Error ? e.message : e));
void client.login(cfg.DISCORD_TOKEN);
