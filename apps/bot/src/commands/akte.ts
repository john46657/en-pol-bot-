import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from 'discord.js';
import { permissionDeniedMessage } from '@nexus/permissions';
import { TEAM_STATE_LABEL, buildActor, effectiveState, getRecordByUser, recordSections, visibleSections } from '@nexus/personnel';
import { embeds } from '../core/embed-builder.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

/**
 * `/akte [mitglied]` – eigene oder (mit Berechtigung) fremde Personalakte. Dieselbe Rechteprüfung wie im Dashboard:
 * serverweit oder nur eigenes Team, Disziplin/Notizen/Verlauf nur mit eigenem Recht.
 */
const DAY = 86_400_000;
const date = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:D>`;

export async function runAkte(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) {
    await interaction.reply({
      content: 'Das geht nur auf einem Server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const target = interaction.options.getUser('mitglied') ?? interaction.user;
  const actor = await buildActor({
    guildId: guild.id,
    userId: interaction.user.id,
    roleIds: [...member.roles.cache.keys()],
    bypass: permissionService.isDiscordAdmin(member),
  });
  const record = await getRecordByUser(guild.id, target.id);
  const deny = () =>
    interaction.reply({
      content: `❌ ${permissionDeniedMessage(target.id === interaction.user.id ? ['own.profile.view'] : ['personnel.view'])}`,
      flags: MessageFlags.Ephemeral,
    });
  if (!record) {
    // Fremde Akten: nicht verraten, ob es eine gibt, solange kein Recht besteht
    const own = target.id === interaction.user.id;
    const sees =
      own || (await visibleSections(actor, { userId: target.id, teamId: null })).has('base');
    if (!sees) return void (await deny());
    await interaction.reply({
      content: own
        ? 'ℹ️ Für dich existiert noch keine Personalakte.'
        : 'ℹ️ Für dieses Mitglied existiert keine Personalakte.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const sections = await visibleSections(actor, record);
  if (!sections.has('base')) return void (await deny());
  const data = await recordSections(guild.id, record.id, {
    awards: sections.has('awards'),
    discipline: sections.has('discipline'),
    notes: sections.has('notes'),
    history: false,
  });
  const active = (kind: string) => data.entries.filter((e) => e.kind === kind && !e.revokedAt);
  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: 'Dienstnummer', value: record.serviceNumber ?? '–', inline: true },
    { name: 'Dienstgrad', value: record.rank ? `${record.rank.icon ? `${record.rank.icon} ` : ''}${record.rank.name}` : '–', inline: true },
    { name: 'Team', value: record.team?.name ?? '–', inline: true },
    { name: 'Eintritt', value: date(record.joinedAt), inline: true },
    { name: 'Status', value: TEAM_STATE_LABEL[effectiveState(record)], inline: true },
  ];
  if (record.probationEndsAt && record.probationEndsAt.getTime() > Date.now()) {
    fields.push({
      name: 'Probezeit bis',
      value: `${date(record.probationEndsAt)} (${Math.ceil((record.probationEndsAt.getTime() - Date.now()) / DAY)} Tage)`,
      inline: true,
    });
  }
  if (sections.has('awards'))
    fields.push({
      name: 'Auszeichnungen',
      value:
        active('AWARD')
          .map((a) => `🏅 ${a.title}`)
          .join('\n') || '–',
    });
  if (sections.has('discipline'))
    fields.push({
      name: 'Disziplin',
      value:
        active('DISCIPLINE')
          .map((a) => `⚠️ ${a.title}`)
          .join('\n') || '–',
    });
  if (sections.has('notes'))
    fields.push({ name: 'Notizen', value: String(active('NOTE').length), inline: true });
  await interaction.reply({
    embeds: [
      embeds.info({ title: `📁 ${record.rpName}`, description: `<@${record.userId}>`, fields }),
    ],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

export const akteCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('akte')
    .setDescription(
      'Zeigt eine Personalakte (deine eigene oder – mit Berechtigung – die eines Mitglieds)',
    )
    .setDMPermission(false)
    .addUserOption((o) => o.setName('mitglied').setDescription('Mitglied (Standard: du selbst)'))
    .toJSON(),
  execute: runAkte,
});
