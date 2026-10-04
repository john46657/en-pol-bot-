import { MessageFlags, SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import { FleetError, vehicles as V } from '@nexus/fleet';
import { permissionDeniedMessage } from '@nexus/permissions';
import { dutyOverview, getUnitOf } from '@nexus/shifts';
import type { Permission } from '@nexus/types';
import { embeds } from '../core/embed-builder.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

/** `/fahrzeug liste|info|neu|status|zuweisen|freigeben|fahrer|schaden|reparatur|ausmustern` – Fuhrpark. */
const ICON = { AVAILABLE: '🟢', IN_USE: '🔵', MAINTENANCE: '🟠', OUT_OF_SERVICE: '⚫' } as const;
const reply = (i: ChatInputCommandInteraction, content: string) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
type Vehicle = Awaited<ReturnType<typeof V.getVehicle>>;
const line = (v: Vehicle) => `${ICON[v.status]} **${v.plate}** (${v.type}) – ${V.STATUS_LABEL[v.status]}${v.driverId ? ` · 👤 <@${v.driverId}>` : ''}${v.damages.length ? ` · 🔧 ${v.damages.length} Schaden` : ''}`;

export async function runFahrzeug(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await reply(interaction, 'Das geht nur auf einem Server.'));
  const sub = interaction.options.getSubcommand();
  const o = interaction.options;
  const need: Permission = sub === 'liste' || sub === 'info' ? 'fleet.view' : sub === 'schaden' ? 'fleet.report' : 'fleet.manage';
  if (!(await permissionService.can(member, need))) return void (await reply(interaction, `❌ ${permissionDeniedMessage([need])}`));
  try {
    if (sub === 'liste') {
      const list = await V.listVehicles({ guildId: guild.id, status: o.getString('status') ?? undefined });
      return void (await interaction.reply({ embeds: [embeds.info({ title: '🚓 Fuhrpark', description: list.map(line).join('\n').slice(0, 3900) || 'Keine Fahrzeuge.' })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    if (sub === 'neu') {
      const v = await V.addVehicle({ guildId: guild.id, plate: o.getString('kennzeichen', true), type: o.getString('typ', true), notes: o.getString('notiz') ?? undefined, actorId: member.id });
      return void (await reply(interaction, `✅ Fahrzeug **${v.plate}** (${v.type}) aufgenommen.`));
    }
    const v = await V.getVehicleByPlate(guild.id, o.getString('kennzeichen', true));
    if (sub === 'info') {
      const unit = v.unitId ? (await dutyOverview(guild.id)).units.find((u) => u.id === v.unitId) : null;
      const dmg = v.damages.map((d) => `• ${V.SEVERITY_LABEL[d.severity]}: ${d.description}`).join('\n');
      return void (await interaction.reply({ embeds: [embeds.info({ title: `${ICON[v.status]} ${v.plate}`, description: `${v.type} – ${V.STATUS_LABEL[v.status]}`, fields: [{ name: 'Einheit', value: unit?.callsign ?? '–', inline: true }, { name: 'Fahrer', value: v.driverId ? `<@${v.driverId}>` : '–', inline: true }, { name: 'Offene Schäden', value: dmg || 'keine' }] })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    if (sub === 'status') {
      const u = await V.setStatus(guild.id, v.id, o.getString('status', true), member.id);
      return void (await reply(interaction, `✅ ${line(u)}`));
    }
    if (sub === 'zuweisen') {
      // Standard: die eigene Einheit des Aufrufers
      const unitId = o.getString('einheit') ?? (await getUnitOf(guild.id, member.id))?.id;
      if (!unitId) return void (await reply(interaction, '❌ Gib eine Einheit an oder tritt zuerst einer Einheit bei.'));
      const u = await V.assignToUnit(guild.id, v.id, unitId, o.getUser('fahrer')?.id, member.id);
      return void (await reply(interaction, `✅ ${line(u)}`));
    }
    if (sub === 'freigeben') return void (await reply(interaction, `✅ ${line(await V.release(guild.id, v.id, member.id))}`));
    if (sub === 'fahrer') return void (await reply(interaction, `✅ ${line(await V.setDriver(guild.id, v.id, o.getUser('fahrer', true).id, member.id))}`));
    if (sub === 'schaden') {
      await V.reportDamage({ guildId: guild.id, vehicleId: v.id, description: o.getString('beschreibung', true), severity: o.getString('stufe') ?? undefined, actorId: member.id });
      return void (await reply(interaction, `✅ Schaden an **${v.plate}** gemeldet. Status: ${V.STATUS_LABEL[(await V.getVehicle(guild.id, v.id)).status]}`));
    }
    if (sub === 'reparatur') {
      const d = v.damages[0];
      if (!d) return void (await reply(interaction, 'ℹ️ Es sind keine offenen Schäden gemeldet.'));
      return void (await reply(interaction, `✅ „${d.description}“ repariert. ${line(await V.repairDamage(guild.id, d.id, member.id))}`));
    }
    await V.retireVehicle(guild.id, v.id, member.id); // ausmustern
    await reply(interaction, `✅ **${v.plate}** ausgemustert.`);
  } catch (e) {
    if (e instanceof FleetError) return void (await reply(interaction, `❌ ${e.message}`));
    throw e;
  }
}

export async function autocompleteFahrzeug(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guild) return void (await interaction.respond([]));
  const f = interaction.options.getFocused(true);
  if (f.name === 'einheit') {
    const { units } = await dutyOverview(interaction.guild.id);
    return void (await interaction.respond(units.filter((u) => u.callsign.toLowerCase().includes(f.value.toLowerCase())).slice(0, 25).map((u) => ({ name: u.callsign, value: u.id }))));
  }
  const list = await V.listVehicles({ guildId: interaction.guild.id, query: f.value || undefined });
  await interaction.respond(list.slice(0, 25).map((v) => ({ name: `${v.plate} (${v.type})`.slice(0, 100), value: v.plate })));
}

const plate = (s: import('discord.js').SlashCommandSubcommandBuilder) => s.addStringOption((o) => o.setName('kennzeichen').setDescription('Kennzeichen').setRequired(true).setAutocomplete(true));
const statusChoices = (Object.keys(V.STATUS_LABEL) as (keyof typeof V.STATUS_LABEL)[]).map((k) => ({ name: V.STATUS_LABEL[k], value: k }));

export const fahrzeugCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('fahrzeug')
    .setDescription('Fuhrpark: Fahrzeuge, Zuweisung, Schäden')
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('liste').setDescription('Fahrzeuge anzeigen').addStringOption((o) => o.setName('status').setDescription('Nur dieser Status').addChoices(...statusChoices)))
    .addSubcommand((s) => plate(s.setName('info').setDescription('Fahrzeug anzeigen')))
    .addSubcommand((s) => s.setName('neu').setDescription('Fahrzeug aufnehmen').addStringOption((o) => o.setName('kennzeichen').setDescription('Kennzeichen').setRequired(true).setMaxLength(15)).addStringOption((o) => o.setName('typ').setDescription('Typ, z. B. Streifenwagen').setRequired(true).setMaxLength(60)).addStringOption((o) => o.setName('notiz').setDescription('Notiz').setMaxLength(500)))
    .addSubcommand((s) => plate(s.setName('status').setDescription('Status setzen')).addStringOption((o) => o.setName('status').setDescription('Neuer Status').setRequired(true).addChoices(...statusChoices)))
    .addSubcommand((s) => plate(s.setName('zuweisen').setDescription('Einer Einheit zuweisen (Standard: deine)')).addStringOption((o) => o.setName('einheit').setDescription('Einheit').setAutocomplete(true)).addUserOption((o) => o.setName('fahrer').setDescription('Fahrer (Mitglied der Einheit)')))
    .addSubcommand((s) => plate(s.setName('freigeben').setDescription('Von der Einheit lösen')))
    .addSubcommand((s) => plate(s.setName('fahrer').setDescription('Fahrer ändern')).addUserOption((o) => o.setName('fahrer').setDescription('Fahrer').setRequired(true)))
    .addSubcommand((s) => plate(s.setName('schaden').setDescription('Schaden melden')).addStringOption((o) => o.setName('beschreibung').setDescription('Was ist kaputt?').setRequired(true).setMaxLength(300)).addStringOption((o) => o.setName('stufe').setDescription('Schwere').addChoices(...V.SEVERITIES.map((k) => ({ name: V.SEVERITY_LABEL[k], value: k })))))
    .addSubcommand((s) => plate(s.setName('reparatur').setDescription('Neuesten offenen Schaden als repariert markieren')))
    .addSubcommand((s) => plate(s.setName('ausmustern').setDescription('Fahrzeug ausmustern')))
    .toJSON(),
  execute: runFahrzeug,
  autocomplete: autocompleteFahrzeug,
});
