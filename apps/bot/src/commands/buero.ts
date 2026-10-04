import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import { getWaitingRoom } from '@nexus/office';
import { permissionDeniedMessage } from '@nexus/permissions';
import { permissionService } from '../services/permission.service.js';
import { embeds } from '../core/embed-builder.js';
import { defineCommand } from './registry.js';

/**
 * `/buero status|wartend` – zeigt den konfigurierten Büro-Warteraum und wer sich gerade darin aufhält.
 * Rein lesend: der Bot behandelt den Kanal nur als konfigurierten Warteraum und verschiebt/stummschaltet/trennt niemanden.
 */
export async function runBuero(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await interaction.reply({ content: 'Das geht nur auf einem Server.', flags: MessageFlags.Ephemeral }));
  if (!(await permissionService.can(member, 'personnel.view'))) return void (await interaction.reply({ content: `❌ ${permissionDeniedMessage(['personnel.view'])}`, flags: MessageFlags.Ephemeral }));
  const room = await getWaitingRoom(guild.id);
  if (room.state !== 'ok' || !room.channelId) return void (await interaction.reply({ content: `⚠️ ${room.message}`, flags: MessageFlags.Ephemeral }));
  if (interaction.options.getSubcommand() === 'status') return void (await interaction.reply({ content: `🟢 Büro-Warteraum: <#${room.channelId}> (${room.name})`, flags: MessageFlags.Ephemeral }));
  const channel = guild.channels.cache.get(room.channelId);
  const waiting = channel && 'members' in channel ? [...(channel.members as Map<string, GuildMember>).values()].filter((m) => !m.user.bot) : [];
  await interaction.reply({ embeds: [embeds.info({ title: '🔊 Büro-Warteraum', description: waiting.length ? waiting.map((m) => `<@${m.id}>`).join('\n') : 'Niemand wartet.' })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
}

export const bueroCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('buero')
    .setDescription('Büro-Warteraum')
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('status').setDescription('Welcher Kanal ist der Büro-Warteraum?'))
    .addSubcommand((s) => s.setName('wartend').setDescription('Wer wartet gerade?'))
    .toJSON(),
  execute: runBuero,
});
