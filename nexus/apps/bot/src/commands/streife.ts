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
  MAX_UNIT_MEMBERS,
  ShiftError,
  UNIT_STATUS_LABEL,
  createUnit,
  dutyOverview,
  dutyStatusOf,
  getUnitOf,
  joinUnit,
  leaveUnit,
  updateUnit,
  type UnitStatusKey,
  type UnitView,
} from '@nexus/shifts';
import type { Permission } from '@nexus/types';
import { embeds } from '../core/embed-builder.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

/** `/streife bilden|beitreten|verlassen|status|info|übersicht` – Einheiten, gebunden an die laufende Schicht. */
const ICON: Record<UnitStatusKey, string> = { AVAILABLE: '🟢', BUSY: '🔴', BREAK: '🟡', UNAVAILABLE: '⚫' };
const reply = (i: ChatInputCommandInteraction, content: string) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

async function allowed(member: GuildMember, key: Permission): Promise<boolean> {
  const record = await getRecordByUser(member.guild.id, member.id);
  const actor = await buildActor({ guildId: member.guild.id, userId: member.id, roleIds: [...member.roles.cache.keys()], bypass: permissionService.isDiscordAdmin(member) });
  return canOn(actor, key, { userId: member.id, teamId: record?.teamId ?? null });
}

const line = (u: UnitView) => {
  const crew = u.members.map((m) => `${m.role === 'LEADER' ? '⭐' : ''}<@${m.userId}>${m.onBreak ? ' ☕' : ''}`).join(', ');
  const extra = [u.vehicle && `🚓 ${u.vehicle}`, u.location && `📍 ${u.location}`, u.note].filter(Boolean).join(' · ');
  return `${ICON[u.availability]} **${u.callsign}** (${u.kind}) – ${UNIT_STATUS_LABEL[u.availability]} · ${u.staffing.active}/${u.staffing.total} einsatzbereit\n${crew}${extra ? `\n${extra}` : ''}`;
};

export async function runStreife(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await reply(interaction, 'Das geht nur auf einem Server.'));
  const sub = interaction.options.getSubcommand();
  const need: Permission = sub === 'übersicht' || sub === 'info' ? 'duty.view' : 'duty.unit.join';
  if (!(await allowed(member, need))) return void (await reply(interaction, `❌ ${permissionDeniedMessage([need])}`));
  const o = interaction.options;
  try {
    if (sub === 'bilden') {
      const u = await createUnit({ guildId: guild.id, userId: member.id, callsign: o.getString('rufname', true), vehicle: o.getString('fahrzeug') ?? undefined, location: o.getString('standort') ?? undefined });
      return void (await reply(interaction, `✅ Einheit **${u.callsign}** gebildet – du bist Streifenführer. Andere treten mit \`/streife beitreten\` bei.`));
    }
    if (sub === 'beitreten') {
      const u = await joinUnit(guild.id, member.id, o.getString('einheit', true));
      return void (await reply(interaction, `✅ Du bist jetzt in **${u.callsign}** (${u.members.length}/${MAX_UNIT_MEMBERS}).`));
    }
    if (sub === 'verlassen') {
      const mine = await getUnitOf(guild.id, member.id);
      if (!mine) return void (await reply(interaction, 'ℹ️ Du bist in keiner Einheit.'));
      await leaveUnit(guild.id, member.id);
      return void (await reply(interaction, `👋 Du hast **${mine.callsign}** verlassen.`));
    }
    if (sub === 'status') {
      const mine = await getUnitOf(guild.id, member.id);
      if (!mine) return void (await reply(interaction, 'ℹ️ Du bist in keiner Einheit.'));
      const status = o.getString('status') ?? undefined;
      const u = await updateUnit(guild.id, mine.id, { status, vehicle: o.getString('fahrzeug') ?? undefined, location: o.getString('standort') ?? undefined, note: o.getString('notiz') ?? undefined }, member.id);
      return void (await reply(interaction, `✅ **${u.callsign}**: ${ICON[u.status]} ${UNIT_STATUS_LABEL[u.status]}${u.vehicle ? ` · 🚓 ${u.vehicle}` : ''}${u.location ? ` · 📍 ${u.location}` : ''}`));
    }
    if (sub === 'info') {
      const user = o.getUser('mitglied') ?? interaction.user;
      const s = await dutyStatusOf(guild.id, user.id);
      const text = { OFF_DUTY: '⚫ Nicht im Dienst', ON_DUTY: '🟢 Im Dienst (ohne Einheit)', IN_UNIT: `🟢 Im Dienst in **${s.unit?.callsign}**`, ON_BREAK: '🟡 In der Pause' }[s.state];
      return void (await reply(interaction, `<@${user.id}>: ${text}`));
    }
    // übersicht
    const d = await dutyOverview(guild.id);
    const c = d.counts;
    const parts = d.units.map(line);
    if (d.unassigned.length) parts.push(`**Ohne Einheit:** ${d.unassigned.map((x) => `<@${x.userId}>${x.paused ? ' ☕' : ''}`).join(', ')}`);
    await interaction.reply({
      embeds: [embeds.info({ title: '🚓 Dienstübersicht', description: `${c.onDuty} im Dienst · ${c.onBreak} Pause · ${c.units} Einheiten (🟢 ${c.available} verfügbar · 🔴 ${c.busy} im Einsatz · ⚫ ${c.unavailable} nicht verfügbar)\n\n${parts.join('\n\n') || 'Keine Einheiten im Dienst.'}`.slice(0, 4000) })],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  } catch (e) {
    if (e instanceof ShiftError) return void (await reply(interaction, `❌ ${e.message}`));
    throw e;
  }
}

export async function autocompleteStreife(interaction: AutocompleteInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return void (await interaction.respond([]));
  const q = interaction.options.getFocused().toLowerCase();
  const { units } = await dutyOverview(guild.id);
  await interaction.respond(units.filter((u) => u.callsign.toLowerCase().includes(q)).slice(0, 25).map((u) => ({ name: `${u.callsign} (${u.staffing.total}/${MAX_UNIT_MEMBERS})`, value: u.id })));
}

const statusChoices = (Object.keys(UNIT_STATUS_LABEL) as UnitStatusKey[]).map((k) => ({ name: UNIT_STATUS_LABEL[k], value: k }));

export const streifeCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('streife')
    .setDescription('Streifen/Einheiten: bilden, beitreten, Status, Übersicht')
    .setDMPermission(false)
    .addSubcommand((s) =>
      s.setName('bilden').setDescription('Neue Einheit bilden (du musst im Dienst sein)')
        .addStringOption((o) => o.setName('rufname').setDescription('Rufname, z. B. Adam 1').setRequired(true).setMaxLength(30))
        .addStringOption((o) => o.setName('fahrzeug').setDescription('Fahrzeug').setMaxLength(100))
        .addStringOption((o) => o.setName('standort').setDescription('Standort').setMaxLength(100)),
    )
    .addSubcommand((s) => s.setName('beitreten').setDescription('Einer Einheit beitreten').addStringOption((o) => o.setName('einheit').setDescription('Einheit').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('verlassen').setDescription('Deine Einheit verlassen'))
    .addSubcommand((s) =>
      s.setName('status').setDescription('Status, Fahrzeug, Standort deiner Einheit setzen')
        .addStringOption((o) => o.setName('status').setDescription('Status').addChoices(...statusChoices))
        .addStringOption((o) => o.setName('fahrzeug').setDescription('Fahrzeug').setMaxLength(100))
        .addStringOption((o) => o.setName('standort').setDescription('Standort').setMaxLength(100))
        .addStringOption((o) => o.setName('notiz').setDescription('Notiz').setMaxLength(100)),
    )
    .addSubcommand((s) => s.setName('info').setDescription('Dienststatus eines Mitglieds').addUserOption((o) => o.setName('mitglied').setDescription('Mitglied (Standard: du)')))
    .addSubcommand((s) => s.setName('übersicht').setDescription('Alle Einheiten mit Besetzung und Verfügbarkeit'))
    .toJSON(),
  execute: runStreife,
  autocomplete: autocompleteStreife,
});
