import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import { permissionDeniedMessage } from '@nexus/permissions';
import { TEAM_STATE_LABEL, buildActor, scopeFor, teamOverview, type TeamStateKey } from '@nexus/personnel';
import { embeds } from '../core/embed-builder.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

/** `/team` – Teamliste wie im Dashboard: aktive Mitglieder je Team, höchster Dienstgrad zuerst (nur Teams, die du sehen darfst). */
export async function runTeam(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await interaction.reply({ content: 'Das geht nur auf einem Server.', flags: MessageFlags.Ephemeral }));
  const actor = await buildActor({ guildId: guild.id, userId: interaction.user.id, roleIds: [...member.roles.cache.keys()], bypass: permissionService.isDiscordAdmin(member) });
  const scope = await scopeFor(actor, 'personnel.view');
  if (!scope.all && scope.teamIds.length === 0) return void (await interaction.reply({ content: `❌ ${permissionDeniedMessage(['personnel.view'])}`, flags: MessageFlags.Ephemeral }));
  const wanted = interaction.options.getString('team')?.toLowerCase();
  const groups = (await teamOverview(guild.id, scope.all ? null : scope.teamIds)).filter((g) => !wanted || g.name.toLowerCase().includes(wanted));
  const fields = groups.slice(0, 10).map((g) => ({
    name: `${g.name} (${g.members.length})`.slice(0, 256),
    value:
      (g.members
        .slice(0, 15)
        .map((m) => `${TEAM_STATE_LABEL[m.teamState as TeamStateKey].split(' ')[0]} ${m.rank?.icon ?? ''} ${m.rank?.name ?? '–'} · ${m.rpName}${m.serviceNumber ? ` (${m.serviceNumber})` : ''}`)
        .join('\n') + (g.members.length > 15 ? `\n… und ${g.members.length - 15} weitere` : '')) || '–',
  }));
  await interaction.reply({ embeds: [embeds.info({ title: '👥 Team', description: fields.length ? 'Aktive Mitglieder, höchster Dienstgrad zuerst.' : 'Keine Teams oder Mitglieder gefunden.', fields })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
}

export const teamCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('team')
    .setDescription('Teamliste: aktive Mitglieder je Team nach Dienstgrad')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('team').setDescription('Nur ein Team (Teil des Namens)').setMaxLength(60))
    .toJSON(),
  execute: runTeam,
});
