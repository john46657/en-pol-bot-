import { MessageFlags, SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import { prisma } from '@nexus/database';
import {
  OperationError,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  assignUnit,
  changeStatus,
  createOperation,
  formatNumber,
  getByNumber,
  listOperations,
  setLeader,
  type OpPriority,
  type OpStatus,
} from '@nexus/operations';
import { permissionDeniedMessage } from '@nexus/permissions';
import { dutyOverview } from '@nexus/shifts';
import type { Permission } from '@nexus/types';
import { embeds } from '../core/embed-builder.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

/**
 * `/einsatz neu|liste|info|zuweisen|leiter|status` – Einsatzmanagement. Anlegen: `operations.create`; Ansehen:
 * `operations.view`; Zuweisen/Status: `operations.manage` **oder** Beteiligung (Mitglied einer zugewiesenen bzw. der
 * zuzuweisenden Einheit).
 */
const PRIO_ICON: Record<OpPriority, string> = { LOW: '⚪', NORMAL: '🔵', HIGH: '🟠', URGENT: '🔴' };
const reply = (i: ChatInputCommandInteraction, content: string) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const nr = (s: string) => Number(s.replace(/^E-?/i, ''));

type Op = Awaited<ReturnType<typeof getByNumber>>;
const card = (op: Op) => ({
  title: `${PRIO_ICON[op.priority]} ${formatNumber(op.number)} – ${op.kind}`,
  description: op.description ?? '–',
  fields: [
    { name: 'Status', value: STATUS_LABEL[op.status], inline: true },
    { name: 'Priorität', value: PRIORITY_LABEL[op.priority], inline: true },
    { name: 'Ort', value: op.location, inline: true },
    { name: 'Einsatzleiter', value: op.leaderId ? `<@${op.leaderId}>` : '–', inline: true },
    { name: 'Einheiten', value: op.units.map((u) => u.callsign).join(', ') || '–', inline: true },
    ...(op.report ? [{ name: op.status === 'CANCELLED' ? 'Abbruchgrund' : 'Abschlussbericht', value: op.report.slice(0, 1000) }] : []),
  ],
});

export async function runEinsatz(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await reply(interaction, 'Das geht nur auf einem Server.'));
  const sub = interaction.options.getSubcommand();
  const o = interaction.options;
  const need: Permission = sub === 'neu' ? 'operations.create' : 'operations.view';
  const deny = (k: Permission) => reply(interaction, `❌ ${permissionDeniedMessage([k])}`);
  if (!(await permissionService.can(member, need))) return void (await deny(need));
  const manage = await permissionService.can(member, 'operations.manage');
  try {
    if (sub === 'neu') {
      const op = await createOperation({ guildId: guild.id, actorId: member.id, kind: o.getString('art', true), location: o.getString('ort', true), priority: o.getString('prioritaet') ?? undefined, description: o.getString('beschreibung') ?? undefined });
      return void (await interaction.reply({ embeds: [embeds.success(card(op))], content: `✅ Einsatz **${formatNumber(op.number)}** angefordert.`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    if (sub === 'liste') {
      const { items } = await listOperations({ guildId: guild.id, open: !o.getBoolean('alle'), limit: 15 });
      const body = items.map((x) => `${PRIO_ICON[x.priority]} **${formatNumber(x.number)}** ${x.kind} – ${x.location} · ${STATUS_LABEL[x.status]}${x.units.length ? ` · ${x.units.map((u) => u.callsign).join(', ')}` : ''}`).join('\n');
      return void (await interaction.reply({ embeds: [embeds.info({ title: '🚨 Einsätze', description: body || 'Keine Einsätze.' })], flags: MessageFlags.Ephemeral }));
    }
    const op = await getByNumber(guild.id, nr(o.getString('nummer', true)));
    if (sub === 'info') return void (await interaction.reply({ embeds: [embeds.info(card(op))], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    const participant = op.participants.some((p) => p.userId === member.id);
    if (sub === 'zuweisen') {
      const unitId = o.getString('einheit', true);
      const mine = await prisma.unitMember.count({ where: { guildId: guild.id, userId: member.id, unitId, openKey: 'open' } });
      if (!manage && !mine) return void (await deny('operations.manage'));
      const r = await assignUnit(guild.id, op.id, unitId, member.id);
      return void (await interaction.reply({ embeds: [embeds.success(card(r))], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    if (!manage && !participant) return void (await deny('operations.manage'));
    if (sub === 'leiter') {
      const user = o.getUser('mitglied', true);
      return void (await interaction.reply({ embeds: [embeds.success(card(await setLeader(guild.id, op.id, user.id, member.id)))], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    // status
    const r = await changeStatus({ guildId: guild.id, operationId: op.id, to: o.getString('status', true), actorId: member.id, report: o.getString('bericht') ?? undefined, outcome: o.getString('ergebnis') ?? undefined, permission: manage ? 'operations.manage' : undefined });
    await interaction.reply({ content: r.transferred.length ? `📁 In ${r.transferred.length} Personalakte(n) übernommen.` : '✅ Status geändert.', embeds: [embeds.success(card(r.operation))], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  } catch (e) {
    if (e instanceof OperationError) return void (await reply(interaction, `❌ ${e.message}`));
    throw e;
  }
}

export async function autocompleteEinsatz(interaction: AutocompleteInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return void (await interaction.respond([]));
  const f = interaction.options.getFocused(true);
  const q = f.value.toLowerCase();
  if (f.name === 'einheit') {
    const { units } = await dutyOverview(guild.id);
    return void (await interaction.respond(units.filter((u) => u.callsign.toLowerCase().includes(q)).slice(0, 25).map((u) => ({ name: u.callsign, value: u.id }))));
  }
  const { items } = await listOperations({ guildId: guild.id, open: true, limit: 25 });
  await interaction.respond(items.filter((x) => `${formatNumber(x.number)} ${x.kind}`.toLowerCase().includes(q)).map((x) => ({ name: `${formatNumber(x.number)} ${x.kind} – ${x.location}`.slice(0, 100), value: formatNumber(x.number) })));
}

const nummer = (s: import('discord.js').SlashCommandSubcommandBuilder) => s.addStringOption((o) => o.setName('nummer').setDescription('Einsatznummer').setRequired(true).setAutocomplete(true));
const statusChoices = (['EN_ROUTE', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as OpStatus[]).map((k) => ({ name: STATUS_LABEL[k], value: k }));

export const einsatzCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('einsatz')
    .setDescription('Einsatzmanagement')
    .setDMPermission(false)
    .addSubcommand((s) =>
      s.setName('neu').setDescription('Einsatz anfordern')
        .addStringOption((o) => o.setName('art').setDescription('Art des Einsatzes').setRequired(true).setMaxLength(60))
        .addStringOption((o) => o.setName('ort').setDescription('Ort').setRequired(true).setMaxLength(100))
        .addStringOption((o) => o.setName('prioritaet').setDescription('Priorität (Standard: Normal)').addChoices(...PRIORITIES.map((p) => ({ name: PRIORITY_LABEL[p], value: p }))))
        .addStringOption((o) => o.setName('beschreibung').setDescription('Beschreibung').setMaxLength(1000)),
    )
    .addSubcommand((s) => s.setName('liste').setDescription('Einsätze anzeigen').addBooleanOption((o) => o.setName('alle').setDescription('Auch beendete')))
    .addSubcommand((s) => nummer(s.setName('info').setDescription('Einsatz anzeigen')))
    .addSubcommand((s) => nummer(s.setName('zuweisen').setDescription('Einheit zuweisen')).addStringOption((o) => o.setName('einheit').setDescription('Einheit').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => nummer(s.setName('leiter').setDescription('Einsatzleiter festlegen')).addUserOption((o) => o.setName('mitglied').setDescription('Mitglied einer zugewiesenen Einheit').setRequired(true)))
    .addSubcommand((s) =>
      nummer(s.setName('status').setDescription('Status ändern (Abschluss mit Bericht, Abbruch mit Grund)'))
        .addStringOption((o) => o.setName('status').setDescription('Neuer Status').setRequired(true).addChoices(...statusChoices))
        .addStringOption((o) => o.setName('bericht').setDescription('Abschlussbericht bzw. Abbruchgrund').setMaxLength(1500))
        .addStringOption((o) => o.setName('ergebnis').setDescription('Ergebnis in Stichworten').setMaxLength(100)),
    )
    .toJSON(),
  execute: runEinsatz,
  autocomplete: autocompleteEinsatz,
});
