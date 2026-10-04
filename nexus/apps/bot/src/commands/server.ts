import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { embeds } from '../core/embed-builder.js';
import { channelService, guildInfoService, memberService, roleService } from '../services/index.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

const BLOCK_REASON: Record<string, string> = {
  'missing-manage-roles': 'Bot hat „Rollen verwalten“ nicht',
  'managed-role': 'Integrationsrolle',
  everyone: '@everyone',
  hierarchy: 'Rolle liegt über der Bot-Rolle',
};

/** `/server info|rollen|kanaele|mitglieder` – liest Serverdaten über die Services (nur für Verwalter). */
export const serverCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Liest Serverdaten aus (Info, Rollen, Kanäle, Mitglieder)')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('info').setDescription('Serverinformationen'))
    .addSubcommand((s) =>
      s.setName('rollen').setDescription('Rollen inkl. Verwaltbarkeit durch den Bot'),
    )
    .addSubcommand((s) => s.setName('kanaele').setDescription('Text-, Voice-Kanäle und Kategorien'))
    .addSubcommand((s) =>
      s
        .setName('mitglieder')
        .setDescription('Mitglieder suchen')
        .addStringOption((o) => o.setName('suche').setDescription('Namensteil').setRequired(true)),
    )
    .toJSON(),
  execute: runServerCommand,
});

async function runServerCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = guild ? await guild.members.fetch(interaction.user.id).catch(() => null) : null;
  // Serverseitige Prüfung – die Standard-Sichtbarkeit des Commands ist nur UI.
  if (
    !guild ||
    !member ||
    !(
      permissionService.isDiscordAdmin(member) ||
      member.permissions.has(PermissionFlagsBits.ManageGuild)
    )
  ) {
    await interaction.reply({
      content:
        '❌ Keine Berechtigung. Du benötigst Server-Verwalter-Rechte. Wende dich an einen Administrator.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand();

  if (sub === 'info') {
    const i = guildInfoService.get(guild);
    await interaction.editReply({
      embeds: [
        embeds.info({
          title: i.name,
          thumbnailUrl: i.iconUrl ?? undefined,
          fields: [
            { name: 'Mitglieder', value: String(i.memberCount), inline: true },
            { name: 'Rollen', value: String(i.roleCount), inline: true },
            {
              name: 'Kanäle',
              value: `${i.textChannels} Text · ${i.voiceChannels} Voice · ${i.categories} Kategorien`,
              inline: true,
            },
            { name: 'Höchste Bot-Rolle', value: i.botHighestRole ?? '–', inline: true },
          ],
        }),
      ],
    });
  } else if (sub === 'rollen') {
    const lines = roleService
      .list(guild)
      .filter((r) => !r.isEveryone)
      .slice(0, 40)
      .map(
        (r) =>
          `${r.botCanManage ? '🟢' : '🔴'} <@&${r.id}>${r.botBlockedReason ? ` – ${BLOCK_REASON[r.botBlockedReason]}` : ''}`,
      );
    await interaction.editReply({
      embeds: [
        embeds.info({
          title: 'Rollen',
          description: lines.join('\n') || 'Keine Rollen.',
          footer: '🟢 Bot kann Rolle verwalten · 🔴 nicht',
        }),
      ],
      allowedMentions: { parse: [] },
    });
  } else if (sub === 'kanaele') {
    const lines = channelService
      .list(guild)
      .slice(0, 50)
      .map((c) => `${{ text: '#️⃣', voice: '🔊', category: '📁', other: '▫️' }[c.kind]} ${c.name}`);
    await interaction.editReply({
      embeds: [embeds.info({ title: 'Kanäle', description: lines.join('\n') || 'Keine Kanäle.' })],
    });
  } else if (sub === 'mitglieder') {
    const found = await memberService.search(
      guild,
      interaction.options.getString('suche', true),
      15,
    );
    const lines = found.map((m) => `• ${m.displayName} (\`${m.username}\`)${m.bot ? ' 🤖' : ''}`);
    await interaction.editReply({
      embeds: [
        embeds.info({
          title: `Mitglieder (${found.length})`,
          description: lines.join('\n') || 'Keine Treffer.',
        }),
      ],
    });
  }
}
