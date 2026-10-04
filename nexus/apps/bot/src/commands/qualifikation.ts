import { MessageFlags, SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import { restDiscordPort } from '@nexus/automation';
import { permissionDeniedMessage } from '@nexus/permissions';
import { QualificationError, activeAwards, award, checkEligibility, holders, listQualifications, revoke } from '@nexus/qualifications';
import type { Permission } from '@nexus/types';
import { config } from '../config.js';
import { embeds } from '../core/embed-builder.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

/** `/qualifikation liste|info|meine|pruefen|vergeben|entziehen` – Qualifikationen auf Basis der Ausbildungen. */
const reply = (i: ChatInputCommandInteraction, content: string) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const d = (x: Date) => `<t:${Math.floor(x.getTime() / 1000)}:d>`;

export async function runQualifikation(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await reply(interaction, 'Das geht nur auf einem Server.'));
  const sub = interaction.options.getSubcommand();
  const o = interaction.options;
  const can = (k: Permission) => permissionService.can(member, k);
  const deny = (k: Permission) => reply(interaction, `❌ ${permissionDeniedMessage([k])}`);
  const target = o.getUser('mitglied') ?? interaction.user;
  const own = target.id === member.id;
  // Eigene Daten: own.training.view; Fremde und Verwaltung: qualification.view / qualification.manage
  const need: Permission = sub === 'vergeben' || sub === 'entziehen' ? 'qualification.manage' : (sub === 'meine' || (sub === 'pruefen' && own)) ? 'own.training.view' : 'qualification.view';
  if (!(await can(need)) && !(need === 'own.training.view' && (await can('qualification.view')))) return void (await deny(need));
  try {
    const find = async () => {
      const name = o.getString('qualifikation', true).toLowerCase();
      const q = (await listQualifications(guild.id)).find((x) => x.id === name || x.name.toLowerCase() === name);
      if (!q) throw new QualificationError('not-found', 'Diese Qualifikation gibt es nicht.');
      return q;
    };
    if (sub === 'liste') {
      const list = await listQualifications(guild.id, true);
      return void (await interaction.reply({ embeds: [embeds.info({ title: '🏅 Qualifikationen', description: list.map((q) => `**${q.name}**${q.description ? ` – ${q.description}` : ''}${q.autoGrant ? ' · automatisch' : ''}`).join('\n') || 'Keine Qualifikationen.' })], flags: MessageFlags.Ephemeral }));
    }
    if (sub === 'meine') {
      const a = await activeAwards(guild.id, member.id);
      return void (await interaction.reply({ embeds: [embeds.info({ title: '🏅 Meine Qualifikationen', description: a.map((x) => `✅ **${x.qualification.name}** seit ${d(x.awardedAt)}${x.expiresAt ? ` · gültig bis ${d(x.expiresAt)}` : ''}`).join('\n') || 'Noch keine.' })], flags: MessageFlags.Ephemeral }));
    }
    if (sub === 'info' || sub === 'pruefen') {
      const q = await find();
      const e = await checkEligibility(guild.id, target.id, q);
      const lines = e.checks.map((c) => `${c.met ? '✅' : '❌'} ${c.label} – ${c.detail}`).join('\n') || 'Keine Voraussetzungen.';
      return void (await interaction.reply({ embeds: [embeds.info({ title: `🏅 ${q.name}${sub === 'pruefen' ? ` – ${e.eligible ? 'Voraussetzungen erfüllt' : 'noch nicht erfüllt'}` : ''}`, description: `${q.description ?? ''}\n\n${lines}`.trim(), fields: [{ name: 'Für', value: `<@${target.id}>`, inline: true }, { name: 'Inhaber', value: String((await holders(guild.id, q.id)).length), inline: true }] })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    const q = await find();
    const port = restDiscordPort(config.discord.token);
    if (sub === 'vergeben') {
      const r = await award({ guildId: guild.id, qualificationId: q.id, userId: target.id, actorId: member.id, override: o.getBoolean('ausnahme') ?? undefined, reason: o.getString('grund') ?? undefined, port });
      const role = r.award.roleResult?.endsWith('failed') ? '\n⚠️ Die Rolle konnte nicht vergeben werden – Bot-Rechte prüfen.' : '';
      return void (await reply(interaction, `✅ <@${target.id}> hat jetzt **${q.name}**${r.award.override ? ' (Ausnahme protokolliert)' : ''}.${role}`));
    }
    const a = (await activeAwards(guild.id, target.id)).find((x) => x.qualificationId === q.id);
    if (!a) return void (await reply(interaction, `ℹ️ <@${target.id}> besitzt **${q.name}** nicht.`));
    await revoke(guild.id, a.id, o.getString('grund', true), member.id, port);
    await reply(interaction, `✅ **${q.name}** von <@${target.id}> entzogen.`);
  } catch (e) {
    if (e instanceof QualificationError) return void (await reply(interaction, `❌ ${e.message}`));
    throw e;
  }
}

export async function autocompleteQualifikation(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guild) return void (await interaction.respond([]));
  const q = interaction.options.getFocused().toLowerCase();
  const list = await listQualifications(interaction.guild.id, true);
  await interaction.respond(list.filter((x) => x.name.toLowerCase().includes(q)).slice(0, 25).map((x) => ({ name: x.name, value: x.name })));
}

const qual = (s: import('discord.js').SlashCommandSubcommandBuilder) => s.addStringOption((o) => o.setName('qualifikation').setDescription('Qualifikation').setRequired(true).setAutocomplete(true));

export const qualifikationCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('qualifikation')
    .setDescription('Qualifikationen: ansehen, prüfen, vergeben, entziehen')
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('liste').setDescription('Alle Qualifikationen'))
    .addSubcommand((s) => s.setName('meine').setDescription('Meine Qualifikationen'))
    .addSubcommand((s) => qual(s.setName('info').setDescription('Voraussetzungen anzeigen')).addUserOption((o) => o.setName('mitglied').setDescription('Für dieses Mitglied prüfen')))
    .addSubcommand((s) => qual(s.setName('pruefen').setDescription('Voraussetzungen prüfen (Standard: du)')).addUserOption((o) => o.setName('mitglied').setDescription('Mitglied')))
    .addSubcommand((s) => qual(s.setName('vergeben').setDescription('Qualifikation vergeben')).addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true)).addBooleanOption((o) => o.setName('ausnahme').setDescription('Voraussetzungen übergehen (Grund nötig)')).addStringOption((o) => o.setName('grund').setDescription('Begründung der Ausnahme').setMaxLength(300)))
    .addSubcommand((s) => qual(s.setName('entziehen').setDescription('Qualifikation entziehen')).addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true)).addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(true).setMaxLength(300)))
    .toJSON(),
  execute: runQualifikation,
  autocomplete: autocompleteQualifikation,
});
