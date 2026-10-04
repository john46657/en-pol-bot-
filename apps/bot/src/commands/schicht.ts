import {
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
} from 'discord.js';
import { permissionDeniedMessage } from '@nexus/permissions';
import { buildActor, canOn, getRecordByUser } from '@nexus/personnel';
import {
  ShiftError,
  computeDuration,
  endShift,
  formatSeconds,
  getOpenShift,
  leaderboard,
  overview,
  rankOf,
  PERIODS,
  type Period,
  pauseShift,
  resumeShift,
  startShift,
  usableTypes,
} from '@nexus/shifts';
import type { Permission } from '@nexus/types';
import { embeds } from '../core/embed-builder.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

/**
 * `/schicht start|pause|weiter|ende|status` – eigene Schicht. Rechte (`shifts.start/pause/end`, `own.shift.view`)
 * und Rollenanforderung des Typs werden serverseitig geprüft; fachliche Fehler kommen als verständliche Meldung.
 */
const PERIOD_LABEL: Record<Period, string> = { day: 'Heute', week: 'Diese Woche', month: 'Dieser Monat', all: 'Gesamt' };
const ts = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:t>`;
const reply = (i: ChatInputCommandInteraction, content: string) =>
  i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

async function allowed(member: GuildMember, key: Permission): Promise<boolean> {
  const record = await getRecordByUser(member.guild.id, member.id);
  const actor = await buildActor({
    guildId: member.guild.id,
    userId: member.id,
    roleIds: [...member.roles.cache.keys()],
    bypass: permissionService.isDiscordAdmin(member),
  });
  return canOn(actor, key, { userId: member.id, teamId: record?.teamId ?? null });
}

export async function runSchicht(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await reply(interaction, 'Das geht nur auf einem Server.'));
  const sub = interaction.options.getSubcommand();
  const need: Permission =
    sub === 'start'
      ? 'shifts.start'
      : sub === 'pause' || sub === 'weiter'
        ? 'shifts.pause'
        : sub === 'ende'
          ? 'shifts.end'
          : sub === 'rangliste'
            ? 'shifts.view'
            : 'own.shift.view';
  if (!(await allowed(member, need)))
    return void (await reply(interaction, `❌ ${permissionDeniedMessage([need])}`));
  try {
    const roles = [...member.roles.cache.keys()];
    if (sub === 'start') {
      const typeId = interaction.options.getString('typ', true);
      const s = await startShift({ guildId: guild.id, userId: member.id, typeId, memberRoleIds: roles });
      return void (await interaction.reply({
        embeds: [embeds.success({ title: '🟢 Schicht gestartet', description: `${s.type.emoji ?? ''} **${s.type.name}** seit ${ts(s.startedAt)}` })],
        flags: MessageFlags.Ephemeral,
      }));
    }
    if (sub === 'pause' || sub === 'weiter') {
      const s = sub === 'pause' ? await pauseShift(guild.id, member.id) : await resumeShift(guild.id, member.id);
      return void (await reply(interaction, sub === 'pause' ? `⏸️ Pause gestartet (${s.type.name}).` : `▶️ Weiter im Dienst (${s.type.name}).`));
    }
    if (sub === 'ende') {
      const open = await getOpenShift(guild.id, member.id);
      if (!open) return void (await reply(interaction, 'ℹ️ Du hast keine laufende Schicht.'));
      const s = await endShift(guild.id, open.id, { actorId: member.id, permission: 'shifts.end' });
      return void (await interaction.reply({
        embeds: [embeds.info({ title: '🔴 Schicht beendet', description: `**${s.type.name}** – Dienstzeit: **${formatSeconds(s.durationSeconds ?? 0)}**` })],
        flags: MessageFlags.Ephemeral,
      }));
    }
    if (sub === 'rangliste') {
      const period = (interaction.options.getString('zeitraum') ?? 'week') as Period;
      const scope = { guildId: guild.id, restrictToTeams: null };
      const top = await leaderboard({ ...scope, period, limit: 10 });
      const medal = (n: number) => ['🥇', '🥈', '🥉'][n - 1] ?? `**${n}.**`;
      const body = top.map((e) => `${medal(e.rank)} <@${e.userId}> – ${formatSeconds(e.totalSeconds)} (${e.count} Schichten, Ø ${formatSeconds(e.averageSeconds)})`).join('\n');
      return void (await interaction.reply({ embeds: [embeds.info({ title: `🏆 Rangliste – ${PERIOD_LABEL[period]}`, description: body || 'Noch keine beendeten Schichten in diesem Zeitraum.' })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    // status
    const open = await getOpenShift(guild.id, member.id);
    const ov = await overview({ guildId: guild.id, restrictToTeams: null }, member.id);
    const rank = await rankOf({ guildId: guild.id, restrictToTeams: null, period: 'week' }, member.id);
    const lines: string[] = [];
    if (open) {
      const d = computeDuration(open);
      lines.push(`${open.status === 'PAUSED' ? '⏸️ Pausiert' : '🟢 Im Dienst'}: **${open.type.name}** seit ${ts(open.startedAt)} (netto ${formatSeconds(d.netSeconds)})`);
    } else lines.push('Keine laufende Schicht.');
    for (const p of ov) lines.push(`${PERIOD_LABEL[p.period]}: **${formatSeconds(p.totalSeconds)}** in ${p.count} Schichten${p.count ? ` (Ø ${formatSeconds(p.averageSeconds)})` : ''}`);
    if (rank) lines.push(`Platz diese Woche: **${rank}**`);
    await interaction.reply({ embeds: [embeds.info({ title: '🕒 Dienstzeit', description: lines.join('\n') })], flags: MessageFlags.Ephemeral });
  } catch (e) {
    if (e instanceof ShiftError) return void (await reply(interaction, `❌ ${e.message}`));
    throw e;
  }
}

export async function autocompleteSchicht(interaction: AutocompleteInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await interaction.respond([]));
  const q = interaction.options.getFocused().toLowerCase();
  const types = await usableTypes(guild.id, [...member.roles.cache.keys()]);
  await interaction.respond(
    types.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 25).map((t) => ({ name: `${t.emoji ?? ''} ${t.name}`.trim(), value: t.id })),
  );
}

export const schichtCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('schicht')
    .setDescription('Deine Schicht: starten, pausieren, beenden')
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName('start')
        .setDescription('Schicht starten')
        .addStringOption((o) => o.setName('typ').setDescription('Art der Schicht').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) => s.setName('pause').setDescription('Pause beginnen'))
    .addSubcommand((s) => s.setName('weiter').setDescription('Nach der Pause weitermachen'))
    .addSubcommand((s) => s.setName('ende').setDescription('Schicht beenden'))
    .addSubcommand((s) =>
      s
        .setName('rangliste')
        .setDescription('Rangliste nach Dienstzeit')
        .addStringOption((o) =>
          o.setName('zeitraum').setDescription('Zeitraum (Standard: Woche)').addChoices(
            ...PERIODS.map((p) => ({ name: PERIOD_LABEL[p], value: p })),
          ),
        ),
    )
    .addSubcommand((s) => s.setName('status').setDescription('Aktuelle Schicht und Dienstzeit'))
    .toJSON(),
  execute: runSchicht,
  autocomplete: autocompleteSchicht,
});
