import { MessageFlags, SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import { AbsenceError, CATEGORIES, CATEGORY_LABEL, MAX_DAYS, activeAbsence, approve, daysBetween, endEarly, fmtDay, formatNumber, getByNumber, historyOf, listAbsences, listActive, parseDay, reject, requestAbsence, withdraw } from '@nexus/absences';
import { restDiscordPort } from '@nexus/automation';
import { permissionDeniedMessage } from '@nexus/permissions';
import type { Permission } from '@nexus/types';
import { config } from '../config.js';
import { embeds } from '../core/embed-builder.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

/**
 * `/abmeldung neu|meine|zurueckziehen|zurueck|liste|aktiv|genehmigen|ablehnen|historie`.
 * Eigene Abmeldungen: `own.absence.create`; Führung: `absence.view` / `absence.manage`.
 */
const reply = (i: ChatInputCommandInteraction, content: string) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const ST = { PENDING: '🕓 offen', APPROVED: '✅ genehmigt', REJECTED: '❌ abgelehnt', WITHDRAWN: '↩️ zurückgezogen', ENDED: '🏁 vorzeitig beendet' } as const;
const nr = (s: string) => Number(s.replace(/^A-?/i, ''));
type A = Awaited<ReturnType<typeof getByNumber>>;
const line = (a: A) => `**${formatNumber(a.number)}** <@${a.userId}> · ${fmtDay(a.startDate)}–${fmtDay(a.endDate)} (${daysBetween(a.startDate, a.endDate)} T.) · ${CATEGORY_LABEL[a.category as keyof typeof CATEGORY_LABEL] ?? a.category} · ${ST[a.status]}`;

export async function runAbmeldung(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await reply(interaction, 'Das geht nur auf einem Server.'));
  const sub = interaction.options.getSubcommand();
  const o = interaction.options;
  const can = (k: Permission) => permissionService.can(member, k);
  const manage = await can('absence.manage');
  const target = o.getUser('mitglied') ?? interaction.user;
  const own = target.id === member.id;
  const need: Permission = ['neu', 'meine', 'zurueckziehen', 'zurueck'].includes(sub) || (sub === 'historie' && own) ? 'own.absence.create' : sub === 'genehmigen' || sub === 'ablehnen' ? 'absence.manage' : 'absence.view';
  if (!manage && !(await can(need)) && !(need === 'own.absence.create' && (await can('absence.view')))) return void (await reply(interaction, `❌ ${permissionDeniedMessage([need])}`));
  const port = () => restDiscordPort(config.discord.token);
  try {
    if (sub === 'neu') {
      const start = parseDay(o.getString('von', true));
      const end = parseDay(o.getString('bis', true));
      if (!start || !end) return void (await reply(interaction, '❌ Bitte Datum als `TT.MM.JJJJ` angeben, z. B. `15.07.2026`.'));
      const a = await requestAbsence({ guildId: guild.id, userId: member.id, start, end, category: o.getString('kategorie') ?? 'URLAUB', reason: o.getString('grund', true), port: port() });
      return void (await reply(interaction, `✅ Abmeldung beantragt: ${line(a)}\nDie Führung entscheidet; du bekommst eine Nachricht.`));
    }
    if (sub === 'meine' || sub === 'historie') {
      const h = await historyOf(guild.id, target.id);
      const cur = await activeAbsence(guild.id, target.id);
      return void (await interaction.reply({ embeds: [embeds.info({ title: `🏖️ Abmeldungen${own ? '' : ` – ${target.username ?? ''}`}`, description: `${cur ? `**Aktuell abgemeldet bis ${fmtDay(cur.endDate)}**\n\n` : ''}${h.slice(0, 12).map(line).join('\n') || 'Keine Abmeldungen.'}` })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    if (sub === 'liste') {
      const { items } = await listAbsences({ guildId: guild.id, status: o.getString('status') ?? 'PENDING', limit: 15 });
      return void (await interaction.reply({ embeds: [embeds.info({ title: '🏖️ Abmeldungen', description: items.map(line).join('\n') || 'Keine Abmeldungen.' })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    if (sub === 'aktiv') {
      const act = await listActive(guild.id);
      return void (await interaction.reply({ embeds: [embeds.info({ title: '🏖️ Aktuell abgemeldet', description: act.map(line).join('\n') || 'Niemand ist abgemeldet.' })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    if (sub === 'zurueck') {
      const cur = await activeAbsence(guild.id, member.id);
      if (!cur) return void (await reply(interaction, 'ℹ️ Du bist aktuell nicht abgemeldet.'));
      await endEarly(guild.id, cur.id, member.id, false);
      return void (await reply(interaction, '✅ Willkommen zurück! Du kannst jetzt wieder in den Dienst gehen.'));
    }
    const a = await getByNumber(guild.id, nr(o.getString('nummer', true)));
    if (sub === 'zurueckziehen') return void (await reply(interaction, `✅ ${line(await withdraw(guild.id, a.id, member.id, manage))}`));
    if (sub === 'genehmigen') return void (await reply(interaction, `✅ ${line(await approve({ guildId: guild.id, absenceId: a.id, actorId: member.id, reason: o.getString('grund') ?? undefined, port: port() }))}`));
    await reply(interaction, `✅ ${line(await reject({ guildId: guild.id, absenceId: a.id, actorId: member.id, reason: o.getString('grund') ?? undefined, port: port() }))}`);
  } catch (e) {
    if (e instanceof AbsenceError) return void (await reply(interaction, `❌ ${e.message}`));
    throw e;
  }
}

export async function autocompleteAbmeldung(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guild) return void (await interaction.respond([]));
  const member = interaction.member as GuildMember | null;
  const q = interaction.options.getFocused().toLowerCase();
  const manage = member ? await permissionService.can(member, 'absence.manage') : false;
  const { items } = await listAbsences({ guildId: interaction.guild.id, ...(manage ? {} : { userId: interaction.user.id }), status: manage ? 'PENDING' : undefined, limit: 25 });
  await interaction.respond(items.filter((a) => formatNumber(a.number).toLowerCase().includes(q)).map((a) => ({ name: `${formatNumber(a.number)} ${fmtDay(a.startDate)}–${fmtDay(a.endDate)}`, value: formatNumber(a.number) })));
}

const nummer = (s: import('discord.js').SlashCommandSubcommandBuilder) => s.addStringOption((o) => o.setName('nummer').setDescription('Abmeldungsnummer').setRequired(true).setAutocomplete(true));

export const abmeldungCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('abmeldung')
    .setDescription('Abmeldungen: beantragen, entscheiden, Historie')
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('neu').setDescription(`Abmeldung beantragen (max. ${MAX_DAYS} Tage)`).addStringOption((o) => o.setName('von').setDescription('Erster Tag (TT.MM.JJJJ)').setRequired(true)).addStringOption((o) => o.setName('bis').setDescription('Letzter Tag (TT.MM.JJJJ)').setRequired(true)).addStringOption((o) => o.setName('grund').setDescription('Begründung').setRequired(true).setMaxLength(500)).addStringOption((o) => o.setName('kategorie').setDescription('Standard: Urlaub').addChoices(...CATEGORIES.map((c) => ({ name: CATEGORY_LABEL[c], value: c })))))
    .addSubcommand((s) => s.setName('meine').setDescription('Meine Abmeldungen'))
    .addSubcommand((s) => nummer(s.setName('zurueckziehen').setDescription('Abmeldung zurückziehen (vor Beginn)')))
    .addSubcommand((s) => s.setName('zurueck').setDescription('Vorzeitig zurückmelden (laufende Abmeldung beenden)'))
    .addSubcommand((s) => s.setName('liste').setDescription('Abmeldungen anzeigen').addStringOption((o) => o.setName('status').setDescription('Standard: offene').addChoices({ name: 'Offen', value: 'PENDING' }, { name: 'Genehmigt', value: 'APPROVED' }, { name: 'Abgelehnt', value: 'REJECTED' }, { name: 'Zurückgezogen', value: 'WITHDRAWN' }, { name: 'Vorzeitig beendet', value: 'ENDED' })))
    .addSubcommand((s) => s.setName('aktiv').setDescription('Wer ist heute abgemeldet?'))
    .addSubcommand((s) => nummer(s.setName('genehmigen').setDescription('Abmeldung genehmigen')).addStringOption((o) => o.setName('grund').setDescription('Anmerkung').setMaxLength(300)))
    .addSubcommand((s) => nummer(s.setName('ablehnen').setDescription('Abmeldung ablehnen')).addStringOption((o) => o.setName('grund').setDescription('Ablehnungsgrund').setRequired(true).setMaxLength(300)))
    .addSubcommand((s) => s.setName('historie').setDescription('Abmeldungen eines Mitglieds').addUserOption((o) => o.setName('mitglied').setDescription('Mitglied (Standard: du)')))
    .toJSON(),
  execute: runAbmeldung,
  autocomplete: autocompleteAbmeldung,
});
