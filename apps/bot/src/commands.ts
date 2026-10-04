import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { ApplicationStatus } from '@nexus/types';
import { prisma } from '@nexus/database';
import { config } from './config.js';
import { log } from './logger.js';
import { buildCustomId, CustomIdAction } from './discord/custom-ids.js';
import { buildPanelEmbed } from './discord/embeds.js';
import { permissionDeniedMessage } from '@nexus/permissions';
import { memberCanManage } from './discord/permissions.js';
import { getCommand, listCommandData } from './commands/registry.js';
import './commands/server.js';
import './commands/diagnose.js';
import './commands/akte.js';
import './commands/schicht.js';
import './commands/streife.js';
import './commands/funk.js';
import './commands/einsatz.js';
import './commands/gefahr.js';
import './commands/fahndung.js';
import './commands/fahrzeug.js';
import './commands/strafe.js';
import './commands/ausbildung.js';
import './commands/qualifikation.js';
import './commands/befoerderung.js';
import './commands/sek.js';
import './commands/ticket.js';
import './commands/abmeldung.js';
import './commands/bericht.js';
import './commands/buero.js';

const panelCommand = new SlashCommandBuilder()
  .setName('panel')
  .setDescription('Postet ein Bewerbungs-Panel mit Start-Button in einen Channel')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((o) =>
    o
      .setName('bewerbung')
      .setDescription('Veröffentlichte Bewerbung')
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addChannelOption((o) =>
    o
      .setName('kanal')
      .setDescription('Ziel-Channel (Standard: dieser Channel)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
  );

const nexusCommand = new SlashCommandBuilder()
  .setName('nexus')
  .setDescription('Zeigt den Status von NEXUS und den Link zum Dashboard')
  .setDMPermission(false);

export const COMMANDS: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  panelCommand.toJSON(),
  nexusCommand.toJSON(),
  ...listCommandData(),
];

/** Mit DISCORD_DEV_GUILD_ID sofort (nur dort), sonst global (bis zu 1 h Verzögerung). */
export async function registerCommands(client: Client<true>): Promise<void> {
  try {
    if (config.discord.devGuildId) {
      await client.application.commands.set(COMMANDS, config.discord.devGuildId);
      log.info(
        { guild: config.discord.devGuildId, count: COMMANDS.length },
        'Slash-Commands für den Dev-Server registriert.',
      );
    } else {
      await client.application.commands.set(COMMANDS);
      log.info(
        { count: COMMANDS.length },
        'Slash-Commands global registriert (kann bis zu 1 h dauern).',
      );
    }
  } catch (error) {
    log.error(
      { err: String(error) },
      'Slash-Commands konnten nicht registriert werden (Scope applications.commands beim Einladen?).',
    );
  }
}

export async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const mod = getCommand(interaction.commandName);
  if (mod?.autocomplete) return mod.autocomplete(interaction);
  if (interaction.commandName !== 'panel' || !interaction.guildId) return;
  const typed = interaction.options.getFocused().toLowerCase();
  const apps = await prisma.application.findMany({
    where: { guildId: interaction.guildId, status: ApplicationStatus.PUBLISHED, enabled: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: 100,
  });
  await interaction
    .respond(
      apps
        .filter((a) => a.name.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((a) => ({ name: a.name.slice(0, 100), value: a.id })),
    )
    .catch(() => undefined);
}

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: 'Das geht nur auf einem Server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const mod = getCommand(interaction.commandName);
  if (mod) return mod.execute(interaction);
  if (interaction.commandName === 'nexus') return nexusStatus(interaction);
  if (interaction.commandName === 'panel') return postPanel(interaction);
}

async function nexusStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const [published, open] = await Promise.all([
    prisma.application.count({
      where: { guildId, status: ApplicationStatus.PUBLISHED, enabled: true },
    }),
    prisma.applicationSubmission.count({
      where: { guildId, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
    }),
  ]);
  const dashboard = process.env['DASHBOARD_URL']?.split(',')[0] ?? 'http://localhost:3001';
  await interaction.reply({
    content: `**NEXUS** läuft.\n• Veröffentlichte Bewerbungen: **${published}**\n• Offene Einreichungen: **${open}**\n• Dashboard: ${dashboard}/guilds/${guildId}`,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

async function postPanel(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild!;
  // Discord blendet den Befehl per Default-Permission aus, aber die Prüfung gehört auf den Server (§114):
  // „Server verwalten“ oder eine NEXUS-Rolle mit Verwaltungsrecht.
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const allowed =
    !!member &&
    (member.permissions.has(PermissionFlagsBits.ManageGuild) || (await memberCanManage(member)));
  if (!allowed) {
    await interaction.reply({
      content: `❌ ${permissionDeniedMessage(['applications.panels.manage'])}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const applicationId = interaction.options.getString('bewerbung', true);
  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      guildId: guild.id,
      status: ApplicationStatus.PUBLISHED,
      enabled: true,
    },
  });
  if (!application) {
    await interaction.reply({
      content: '⚠️ Diese Bewerbung ist nicht veröffentlicht oder existiert nicht.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const target = interaction.options.getChannel('kanal') ?? interaction.channel;
  const channel = target ? await guild.channels.fetch(target.id).catch(() => null) : null;
  if (!channel?.isTextBased() || channel.isDMBased() || !('send' in channel)) {
    await interaction.reply({
      content: '⚠️ In diesen Channel kann nicht gepostet werden.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const me = guild.members.me;
  const perms = me && 'permissionsFor' in channel ? channel.permissionsFor(me) : null;
  if (
    !perms?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ])
  ) {
    await interaction.reply({
      content:
        '⚠️ Dem Bot fehlen in diesem Channel die Rechte „Kanal ansehen“, „Nachrichten senden“ und „Links einbetten“.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const cfg = (application.config ?? {}) as {
    embed?: { color?: string; imageUrl?: string; thumbnailUrl?: string; footer?: string };
  };
  const embed = buildPanelEmbed({
    title: application.name,
    ...(application.description ? { description: application.description } : {}),
    ...(application.color
      ? { embed: { ...cfg.embed, color: application.color } }
      : cfg.embed
        ? { embed: cfg.embed }
        : {}),
    applicationNames: [application.name],
  });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(CustomIdAction.PANEL_START, application.id))
      .setLabel('Bewerbung starten')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📝'),
  );

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const message = await channel.send({
    embeds: [embed],
    components: [row],
    allowedMentions: { parse: [] },
  });
  await prisma.applicationPanel.create({
    data: {
      guildId: guild.id,
      channelId: channel.id,
      messageId: message.id,
      title: application.name,
      embed: embed.toJSON() as object,
      applications: { create: [{ applicationId: application.id, order: 0 }] },
    },
  });
  await interaction.editReply(`✅ Panel gepostet: ${message.url}`);
}
