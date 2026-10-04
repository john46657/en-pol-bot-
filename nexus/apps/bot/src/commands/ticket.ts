import { MessageFlags, SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction, type GuildMember, type TextChannel } from 'discord.js';
import { permissionDeniedMessage } from '@nexus/permissions';
import { getSettings, postPanel, PRIORITIES, PRIORITY_LABEL, TicketError, claim, closeTicket, formatNumber, getByChannel, getByNumber, listCategories, listTickets, openTicket, release, renderTranscript, setParticipant, setPriority, stats } from '@nexus/tickets';
import type { Permission } from '@nexus/types';
import { embeds } from '../core/embed-builder.js';
import { memberCan } from '../discord/permissions.js';
import { actorOf, ticketDiscord } from '../tickets/ticket-core.js';
import '../tickets/ticket-handlers.js';
import { defineCommand } from './registry.js';

/**
 * `/ticket neu|liste|info|uebernehmen|freigeben|prioritaet|hinzufuegen|entfernen|schliessen|transkript|archiv|panel|statistik`.
 * Im Ticket-Kanal gilt „dieses Ticket“; sonst wird die Nummer angegeben.
 */
const reply = (i: ChatInputCommandInteraction, content: string) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const nr = (s: string) => Number(s.replace(/^#/, ''));
const ST = { OPEN: '🟢 offen', CLAIMED: '🔵 in Bearbeitung', CLOSED: '🔒 geschlossen' } as const;
type T = Awaited<ReturnType<typeof getByNumber>>;
const line = (t: T) => `**${formatNumber(t.number)}** ${t.category.emoji ?? ''} ${t.subject} · <@${t.userId}> · ${ST[t.status]}${t.claimedBy ? ` (<@${t.claimedBy}>)` : ''} · ${PRIORITY_LABEL[t.priority as keyof typeof PRIORITY_LABEL] ?? t.priority}`;

export async function runTicket(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await reply(interaction, 'Das geht nur auf einem Server.'));
  const sub = interaction.options.getSubcommand();
  const o = interaction.options;
  const need: Permission = sub === 'neu' ? 'tickets.create' : sub === 'panel' ? 'tickets.manage' : sub === 'liste' || sub === 'archiv' || sub === 'statistik' || sub === 'transkript' ? 'tickets.view' : 'tickets.create';
  const staffView = await memberCan(member, 'tickets.view');
  const actor = await actorOf(member);
  // eigene Tickets sehen/schließen darf jeder mit tickets.create; Verwaltung benötigt das jeweilige Recht
  if (!(await memberCan(member, need)) && !(need === 'tickets.view' && (actor.handle || actor.manage)) && !(need === 'tickets.create' && (actor.handle || actor.manage))) return void (await reply(interaction, `❌ ${permissionDeniedMessage([need])}`));
  const discord = ticketDiscord();
  try {
    if (sub === 'neu') {
      const cat = (await listCategories(guild.id, true)).find((c) => c.id === o.getString('kategorie', true) || c.name.toLowerCase() === o.getString('kategorie', true).toLowerCase());
      if (!cat) return void (await reply(interaction, '❌ Diese Kategorie gibt es nicht.'));
      const t = await openTicket({ guildId: guild.id, userId: member.id, username: member.displayName, categoryId: cat.id, subject: o.getString('betreff', true), description: o.getString('beschreibung') ?? undefined }, discord);
      return void (await reply(interaction, `✅ Ticket ${formatNumber(t.number)} eröffnet: <#${t.channelId}>`));
    }
    if (sub === 'panel') {
      const cats = await listCategories(guild.id, true);
      if (cats.length === 0) return void (await reply(interaction, '❌ Lege zuerst im Dashboard Ticket-Kategorien an.'));
      const settings = await getSettings(guild.id);
      const channel = (o.getChannel('kanal') ?? (settings.panelChannelId ? await guild.channels.fetch(settings.panelChannelId).catch(() => null) : null) ?? interaction.channel) as TextChannel | null;
      if (!channel || !('send' in channel)) return void (await reply(interaction, '❌ Bitte einen Textkanal wählen.'));
      await postPanel(guild.id, channel.id, discord);
      return void (await reply(interaction, `✅ Ticket-Panel in <#${channel.id}> gepostet. Die Auslastung aktualisiert sich automatisch. Texte, Farben und Kategorien änderst du im Dashboard.`));
    }
    if (sub === 'liste' || sub === 'archiv') {
      const { items } = await listTickets({ guildId: guild.id, open: sub === 'liste', closed: sub === 'archiv', query: o.getString('suche') ?? undefined, limit: 15 });
      return void (await interaction.reply({ embeds: [embeds.info({ title: sub === 'liste' ? '🎫 Offene Tickets' : '🗄️ Ticket-Archiv', description: items.map(line).join('\n') || 'Keine Tickets.' })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    if (sub === 'statistik') {
      const s = await stats(guild.id);
      return void (await reply(interaction, `🎫 Offen: **${s.byStatus['OPEN'] ?? 0}** · In Bearbeitung: **${s.byStatus['CLAIMED'] ?? 0}** · Geschlossen: **${s.byStatus['CLOSED'] ?? 0}**`));
    }
    // Tickets mit Nummer oder (im Kanal) „dieses“
    const given = o.getString('nummer');
    const t = given ? await getByNumber(guild.id, nr(given)) : await getByChannel(guild.id, interaction.channelId);
    if (!t) return void (await reply(interaction, '❌ Gib die Ticketnummer an oder nutze den Befehl im Ticket-Kanal.'));
    const mine = t.userId === member.id;
    if (!mine && !staffView && !actor.handle && !actor.manage) return void (await reply(interaction, `❌ ${permissionDeniedMessage(['tickets.view'])}`));
    if (sub === 'info') return void (await interaction.reply({ embeds: [embeds.info({ title: `🎫 ${formatNumber(t.number)} – ${t.subject}`, description: t.description ?? '–', fields: [{ name: 'Kategorie', value: t.category.name, inline: true }, { name: 'Status', value: ST[t.status], inline: true }, { name: 'Ersteller', value: `<@${t.userId}>`, inline: true }, { name: 'Bearbeiter', value: t.claimedBy ? `<@${t.claimedBy}>` : '–', inline: true }, { name: 'Priorität', value: PRIORITY_LABEL[t.priority as keyof typeof PRIORITY_LABEL] ?? t.priority, inline: true }, ...(t.channelId && t.status !== 'CLOSED' ? [{ name: 'Kanal', value: `<#${t.channelId}>`, inline: true }] : [])] })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    if (sub === 'transkript') {
      if (t.status !== 'CLOSED') return void (await reply(interaction, 'ℹ️ Das Transkript entsteht beim Schließen des Tickets.'));
      if (!staffView && !actor.manage) return void (await reply(interaction, `❌ ${permissionDeniedMessage(['tickets.view'])}`));
      const text = renderTranscript(t);
      return void (await reply(interaction, `\`\`\`\n${text.slice(0, 1800)}\n\`\`\`${text.length > 1800 ? '\n…(gekürzt – vollständig im Dashboard unter Tickets → Archiv)' : ''}`));
    }
    if (sub === 'uebernehmen') return void (await reply(interaction, `✅ ${line(await claim(guild.id, t.id, actor, discord))}`));
    if (sub === 'freigeben') return void (await reply(interaction, `✅ ${line(await release(guild.id, t.id, actor, discord))}`));
    if (sub === 'prioritaet') return void (await reply(interaction, `✅ ${line(await setPriority(guild.id, t.id, o.getString('stufe', true), actor))}`));
    if (sub === 'hinzufuegen' || sub === 'entfernen') {
      const user = o.getUser('mitglied', true);
      await setParticipant(guild.id, t.id, user.id, sub === 'hinzufuegen', actor, discord);
      return void (await reply(interaction, `✅ <@${user.id}> ${sub === 'hinzufuegen' ? 'hinzugefügt' : 'entfernt'}.`));
    }
    // schliessen
    const r = await closeTicket(guild.id, t.id, o.getString('grund') ?? undefined, actor, discord);
    await reply(interaction, `✅ ${formatNumber(r.ticket.number)} geschlossen – ${r.transcriptMessages} Nachrichten gesichert${r.logged ? ', Protokoll gepostet' : ''}.${r.contentAvailable ? '' : '\n⚠️ Nachrichteninhalte waren nicht lesbar – Message-Content-Intent aktivieren.'}`);
  } catch (e) {
    if (e instanceof TicketError) return void (await reply(interaction, `❌ ${e.message}`));
    throw e;
  }
}

export async function autocompleteTicket(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guild) return void (await interaction.respond([]));
  const f = interaction.options.getFocused(true);
  const q = f.value.toLowerCase();
  if (f.name === 'kategorie') return void (await interaction.respond((await listCategories(interaction.guild.id, true)).filter((c) => c.name.toLowerCase().includes(q)).slice(0, 25).map((c) => ({ name: c.name, value: c.name }))));
  const { items } = await listTickets({ guildId: interaction.guild.id, open: true, query: f.value || undefined, limit: 25 });
  await interaction.respond(items.map((t) => ({ name: `${formatNumber(t.number)} ${t.subject}`.slice(0, 100), value: formatNumber(t.number) })));
}

const nummer = (s: import('discord.js').SlashCommandSubcommandBuilder) => s.addStringOption((o) => o.setName('nummer').setDescription('Ticketnummer (im Ticket-Kanal optional)').setAutocomplete(true));

export const ticketCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Tickets: eröffnen, bearbeiten, schließen, Archiv')
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('neu').setDescription('Ticket eröffnen').addStringOption((o) => o.setName('kategorie').setDescription('Kategorie').setRequired(true).setAutocomplete(true)).addStringOption((o) => o.setName('betreff').setDescription('Betreff').setRequired(true).setMaxLength(100)).addStringOption((o) => o.setName('beschreibung').setDescription('Beschreibung').setMaxLength(1500)))
    .addSubcommand((s) => s.setName('liste').setDescription('Offene Tickets').addStringOption((o) => o.setName('suche').setDescription('Betreff/Nummer')))
    .addSubcommand((s) => nummer(s.setName('info').setDescription('Ticket anzeigen')))
    .addSubcommand((s) => nummer(s.setName('uebernehmen').setDescription('Ticket übernehmen')))
    .addSubcommand((s) => nummer(s.setName('freigeben').setDescription('Ticket freigeben')))
    .addSubcommand((s) => nummer(s.setName('prioritaet').setDescription('Priorität setzen')).addStringOption((o) => o.setName('stufe').setDescription('Priorität').setRequired(true).addChoices(...PRIORITIES.map((p) => ({ name: PRIORITY_LABEL[p], value: p })))))
    .addSubcommand((s) => nummer(s.setName('hinzufuegen').setDescription('Mitglied zum Ticket hinzufügen')).addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true)))
    .addSubcommand((s) => nummer(s.setName('entfernen').setDescription('Mitglied aus dem Ticket entfernen')).addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true)))
    .addSubcommand((s) => nummer(s.setName('schliessen').setDescription('Ticket schließen (Transkript wird gesichert)')).addStringOption((o) => o.setName('grund').setDescription('Grund').setMaxLength(300)))
    .addSubcommand((s) => nummer(s.setName('transkript').setDescription('Transkript eines geschlossenen Tickets')))
    .addSubcommand((s) => s.setName('archiv').setDescription('Geschlossene Tickets durchsuchen').addStringOption((o) => o.setName('suche').setDescription('Betreff/Nummer')))
    .addSubcommand((s) => s.setName('panel').setDescription('Ticket-Panel in einen Kanal posten').addChannelOption((o) => o.setName('kanal').setDescription('Zielkanal (Standard: aktueller)')).addStringOption((o) => o.setName('text').setDescription('Panel-Text').setMaxLength(1000)))
    .addSubcommand((s) => s.setName('statistik').setDescription('Ticket-Zahlen'))
    .toJSON(),
  execute: runTicket,
  autocomplete: autocompleteTicket,
});
