import { MessageFlags, SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import { restDiscordPort } from '@nexus/automation';
import { DangerError, getCurrent, history, listLevels, setLevel, statusMessage } from '@nexus/danger';
import { permissionDeniedMessage } from '@nexus/permissions';
import type { Permission } from '@nexus/types';
import { config } from '../config.js';
import { embeds } from '../core/embed-builder.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

/** `/gefahr anzeigen|setzen|verlauf` – Gefahrenstatus. Rollenbeschränkungen je Stufe werden in `setLevel` geprüft. */
const reply = (i: ChatInputCommandInteraction, content: string) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

export async function runGefahr(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await reply(interaction, 'Das geht nur auf einem Server.'));
  const sub = interaction.options.getSubcommand();
  const need: Permission = sub === 'setzen' ? 'danger.set' : 'danger.view';
  if (!(await permissionService.can(member, need))) return void (await reply(interaction, `❌ ${permissionDeniedMessage([need])}`));
  try {
    if (sub === 'setzen') {
      const override = await permissionService.can(member, 'danger.manage');
      const r = await setLevel({ guildId: guild.id, level: Number(interaction.options.getString('stufe', true)), actorId: member.id, roleIds: [...member.roles.cache.keys()], override, reason: interaction.options.getString('grund') ?? undefined, port: restDiscordPort(config.discord.token) });
      const note = { posted: ' Statusmeldung veröffentlicht.', edited: ' Statusmeldung aktualisiert.', failed: ' ⚠️ Die Statusmeldung konnte nicht aktualisiert werden (Kanal/Rechte prüfen).', none: '' }[r.published];
      return void (await reply(interaction, `✅ Gefahrenstufe: ${r.level.emoji ?? ''} **${r.level.level} – ${r.level.name}**.${note}`));
    }
    if (sub === 'verlauf') {
      const events = await history(guild.id, 10);
      const text = events.map((e) => `<t:${Math.floor(e.at.getTime() / 1000)}:f> ${e.fromLevel ?? '–'} → **${e.toLevel}** von <@${e.actorId}>${e.reason ? ` – ${e.reason}` : ''}`).join('\n');
      return void (await interaction.reply({ embeds: [embeds.info({ title: '📜 Gefahrenstatus – Verlauf', description: text || 'Noch keine Änderungen.' })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    const { level, state } = await getCurrent(guild.id);
    const m = statusMessage(level, state?.setBy ?? null, state?.reason ?? null, state?.setAt ?? new Date());
    await interaction.reply({ embeds: m.embeds as never, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  } catch (e) {
    if (e instanceof DangerError) return void (await reply(interaction, `❌ ${e.message}`));
    throw e;
  }
}

export async function autocompleteGefahr(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guild) return void (await interaction.respond([]));
  const q = interaction.options.getFocused().toLowerCase();
  const levels = await listLevels(interaction.guild.id);
  await interaction.respond(levels.filter((l) => `${l.level} ${l.name}`.toLowerCase().includes(q)).slice(0, 25).map((l) => ({ name: `${l.emoji ?? ''} ${l.level} – ${l.name}`.trim(), value: String(l.level) })));
}

export const gefahrCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('gefahr')
    .setDescription('Gefahrenstatus anzeigen oder setzen')
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('anzeigen').setDescription('Aktuelle Gefahrenstufe'))
    .addSubcommand((s) =>
      s.setName('setzen').setDescription('Gefahrenstufe setzen')
        .addStringOption((o) => o.setName('stufe').setDescription('Neue Stufe').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('grund').setDescription('Grund').setMaxLength(300)),
    )
    .addSubcommand((s) => s.setName('verlauf').setDescription('Letzte Änderungen'))
    .toJSON(),
  execute: runGefahr,
  autocomplete: autocompleteGefahr,
});
