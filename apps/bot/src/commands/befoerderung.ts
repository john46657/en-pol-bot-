import { MessageFlags, SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import { restDiscordPort } from '@nexus/automation';
import { permissionDeniedMessage } from '@nexus/permissions';
import { getRecordByUser, listRanks } from '@nexus/personnel';
import { PromotionError, approve, checkFor, eligibleCandidates, formatNumber, getByNumber, historyOf, listRequests, reject, requestPromotion, withdraw } from '@nexus/promotions';
import type { Permission } from '@nexus/types';
import { config } from '../config.js';
import { embeds } from '../core/embed-builder.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

/**
 * `/befoerderung antrag|liste|info|genehmigen|ablehnen|zurueckziehen|pruefen|kandidaten|historie` –
 * Beförderungssystem. Genehmigt wird auf Dienstgrad **mit Rollenwechsel**; Antragsteller/Beförderte dürfen nicht
 * selbst genehmigen (außer `promotions.manage`).
 */
const reply = (i: ChatInputCommandInteraction, content: string) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const nr = (s: string) => Number(s.replace(/^B-?/i, ''));
const ST = { PENDING: '🕓 offen', APPROVED: '✅ genehmigt', REJECTED: '❌ abgelehnt', WITHDRAWN: '↩️ zurückgezogen' } as const;
type Req = Awaited<ReturnType<typeof getByNumber>>;
const line = (r: Req) => `**${formatNumber(r.number)}** <@${r.userId}>: ${r.fromRankName ?? '–'} → **${r.toRankName}** · ${ST[r.status]}${r.override ? ' · Ausnahme' : ''}`;

export async function runBefoerderung(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await reply(interaction, 'Das geht nur auf einem Server.'));
  const sub = interaction.options.getSubcommand();
  const o = interaction.options;
  const can = (k: Permission) => permissionService.can(member, k);
  const manage = await can('promotions.manage');
  const target = o.getUser('mitglied') ?? interaction.user;
  const own = target.id === member.id;
  const need: Permission = sub === 'antrag' ? 'promotions.create' : sub === 'genehmigen' ? 'promotions.approve' : sub === 'ablehnen' ? 'promotions.reject' : (sub === 'historie' || sub === 'pruefen') && own ? 'own.profile.view' : sub === 'zurueckziehen' ? 'promotions.create' : 'promotions.view';
  const allowed = manage || (await can(need)) || (need === 'own.profile.view' && (await can('promotions.view')));
  if (!allowed) return void (await reply(interaction, `❌ ${permissionDeniedMessage([need])}`));
  try {
    const rankByName = async (name: string) => {
      const rank = (await listRanks(guild.id)).find((x) => x.id === name || x.name.toLowerCase() === name.toLowerCase());
      if (!rank) throw new PromotionError('not-found', 'Diesen Dienstgrad gibt es nicht.');
      return rank;
    };
    if (sub === 'antrag') {
      const rank = await rankByName(o.getString('dienstgrad', true));
      const r = await requestPromotion({ guildId: guild.id, userId: target.id, toRankId: rank.id, requestedBy: member.id, reason: o.getString('grund') ?? undefined, override: o.getBoolean('ausnahme') ?? undefined });
      return void (await reply(interaction, `✅ Antrag ${line(r)} gestellt.`));
    }
    if (sub === 'liste') {
      const { items } = await listRequests({ guildId: guild.id, status: o.getString('status') ?? 'PENDING', limit: 15 });
      return void (await interaction.reply({ embeds: [embeds.info({ title: '📈 Beförderungsanträge', description: items.map(line).join('\n') || 'Keine Anträge.' })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    if (sub === 'kandidaten') {
      const c = await eligibleCandidates(guild.id);
      return void (await interaction.reply({ embeds: [embeds.info({ title: '📈 Voraussetzungen erfüllt', description: c.map((x) => `<@${x.userId}> ${x.rpName}: ${x.fromRank ?? '–'} → **${x.toRank}**${x.hasOpenRequest ? ' (Antrag offen)' : ''}`).join('\n') || 'Niemand erfüllt aktuell die Voraussetzungen des nächsten Dienstgrads.' })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    if (sub === 'pruefen') {
      const record = await getRecordByUser(guild.id, target.id);
      if (!record) return void (await reply(interaction, 'ℹ️ Keine Personalakte vorhanden.'));
      const ranks = await listRanks(guild.id);
      const rank = o.getString('dienstgrad') ? await rankByName(o.getString('dienstgrad', true)) : ranks.filter((k) => k.active).sort((a, b) => a.order - b.order).find((k) => k.order > (record.rank?.order ?? -Infinity));
      if (!rank) return void (await reply(interaction, 'ℹ️ Es gibt keinen höheren Dienstgrad.'));
      const e = await checkFor(guild.id, target.id, rank.id);
      return void (await interaction.reply({ embeds: [embeds.info({ title: `📈 ${record.rpName} → ${rank.name}: ${e.eligible ? 'Voraussetzungen erfüllt' : 'noch nicht erfüllt'}`, description: e.checks.map((c) => `${c.met ? '✅' : '❌'} ${c.label} – ${c.detail}`).join('\n') || 'Keine Voraussetzungen – nur Genehmigung nötig.' })], flags: MessageFlags.Ephemeral }));
    }
    if (sub === 'historie') {
      const h = await historyOf(guild.id, target.id);
      return void (await interaction.reply({ embeds: [embeds.info({ title: '📈 Beförderungen', description: h.map((x) => `<t:${Math.floor((x.decidedAt ?? x.createdAt).getTime() / 1000)}:d> ${x.fromRankName ?? '–'} → **${x.toRankName}** (${formatNumber(x.number)})`).join('\n') || 'Noch keine Beförderungen.', fields: [{ name: 'Mitglied', value: `<@${target.id}>` }] })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    const req = await getByNumber(guild.id, nr(o.getString('nummer', true)));
    if (sub === 'info') {
      const checks = ((req.checks as { label: string; met: boolean; detail: string }[] | null) ?? []).map((c) => `${c.met ? '✅' : '❌'} ${c.label} – ${c.detail}`).join('\n');
      return void (await interaction.reply({ embeds: [embeds.info({ title: `📈 ${formatNumber(req.number)}`, description: `${line(req)}\n${req.reason ? `Begründung: ${req.reason}\n` : ''}${req.decisionReason ? `Entscheidung: ${req.decisionReason}\n` : ''}\n${checks}` })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    if (sub === 'zurueckziehen') return void (await reply(interaction, `✅ ${line(await withdraw(guild.id, req.id, member.id, manage))}`));
    const input = { guildId: guild.id, requestId: req.id, actorId: member.id, manage, reason: o.getString('grund') ?? undefined };
    if (sub === 'genehmigen') {
      const r = await approve({ ...input, port: restDiscordPort(config.discord.token) });
      const role = r.roleChange ? (r.roleChange.status === 'success' ? '\n🎖️ Rollen angepasst.' : `\n⚠️ ${r.roleChange.message}`) : '';
      return void (await reply(interaction, `✅ ${line(r.request)}${role}`));
    }
    // ablehnen
    const r = await reject(input);
    await reply(interaction, `✅ ${line(r)}`);
  } catch (e) {
    if (e instanceof PromotionError) return void (await reply(interaction, `❌ ${e.message}`));
    throw e;
  }
}

export async function autocompleteBefoerderung(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guild) return void (await interaction.respond([]));
  const f = interaction.options.getFocused(true);
  const q = f.value.toLowerCase();
  if (f.name === 'dienstgrad') {
    const ranks = (await listRanks(interaction.guild.id)).filter((r) => r.active && r.name.toLowerCase().includes(q));
    return void (await interaction.respond(ranks.slice(0, 25).map((r) => ({ name: r.name, value: r.name }))));
  }
  const { items } = await listRequests({ guildId: interaction.guild.id, status: 'PENDING', limit: 25 });
  await interaction.respond(items.map((r) => ({ name: `${formatNumber(r.number)} → ${r.toRankName}`, value: formatNumber(r.number) })));
}

const nummer = (s: import('discord.js').SlashCommandSubcommandBuilder) => s.addStringOption((o) => o.setName('nummer').setDescription('Antragsnummer').setRequired(true).setAutocomplete(true));
const grade = (s: import('discord.js').SlashCommandSubcommandBuilder) => s.addStringOption((o) => o.setName('dienstgrad').setDescription('Ziel-Dienstgrad').setAutocomplete(true));

export const befoerderungCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('befoerderung')
    .setDescription('Beförderungen: Anträge, Prüfung, Genehmigung')
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('antrag').setDescription('Beförderung beantragen').addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true)).addStringOption((o) => o.setName('dienstgrad').setDescription('Ziel-Dienstgrad').setRequired(true).setAutocomplete(true)).addStringOption((o) => o.setName('grund').setDescription('Begründung').setMaxLength(500)).addBooleanOption((o) => o.setName('ausnahme').setDescription('Voraussetzungen übergehen (Begründung nötig)')))
    .addSubcommand((s) => s.setName('liste').setDescription('Anträge anzeigen').addStringOption((o) => o.setName('status').setDescription('Standard: offene').addChoices({ name: 'Offen', value: 'PENDING' }, { name: 'Genehmigt', value: 'APPROVED' }, { name: 'Abgelehnt', value: 'REJECTED' }, { name: 'Zurückgezogen', value: 'WITHDRAWN' })))
    .addSubcommand((s) => nummer(s.setName('info').setDescription('Antrag anzeigen')))
    .addSubcommand((s) => nummer(s.setName('genehmigen').setDescription('Antrag genehmigen (Dienstgrad + Rollen)')).addStringOption((o) => o.setName('grund').setDescription('Anmerkung').setMaxLength(300)))
    .addSubcommand((s) => nummer(s.setName('ablehnen').setDescription('Antrag ablehnen')).addStringOption((o) => o.setName('grund').setDescription('Ablehnungsgrund').setRequired(true).setMaxLength(300)))
    .addSubcommand((s) => nummer(s.setName('zurueckziehen').setDescription('Eigenen Antrag zurückziehen')))
    .addSubcommand((s) => grade(s.setName('pruefen').setDescription('Voraussetzungen prüfen (Standard: nächster Dienstgrad)')).addUserOption((o) => o.setName('mitglied').setDescription('Mitglied (Standard: du)')))
    .addSubcommand((s) => s.setName('kandidaten').setDescription('Wer erfüllt die Voraussetzungen des nächsten Dienstgrads?'))
    .addSubcommand((s) => s.setName('historie').setDescription('Beförderungshistorie').addUserOption((o) => o.setName('mitglied').setDescription('Mitglied (Standard: du)')))
    .toJSON(),
  execute: runBefoerderung,
  autocomplete: autocompleteBefoerderung,
});
