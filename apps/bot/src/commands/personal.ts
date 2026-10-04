import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import { permissionDeniedMessage } from '@nexus/permissions';
import {
  PersonnelError,
  TEAM_STATES,
  TEAM_STATE_LABEL,
  archiveRecord,
  buildActor,
  canOn,
  effectiveState,
  getRecordByUser,
  restoreRecord,
  setServiceNumber,
  setTeamState,
} from '@nexus/personnel';
import type { Permission } from '@nexus/types';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

/**
 * `/personal status|schliessen|wiederherstellen|nummer` – dieselben Funktionen wie in der Personalakte im Dashboard
 * (Teamstatus, Akte schließen mit Pflichtgrund, Dienstnummer). Rechte wie dort: serverweit oder nur eigenes Team.
 */
const reply = (i: ChatInputCommandInteraction, content: string) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const STATE_CHOICES = TEAM_STATES.map((s) => ({ name: TEAM_STATE_LABEL[s].replace(/^\S+ /, ''), value: s }));

export async function runPersonal(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await reply(interaction, 'Das geht nur auf einem Server.'));
  const sub = interaction.options.getSubcommand();
  const o = interaction.options;
  const target = o.getUser('mitglied', true);
  const need: Permission = sub === 'status' ? 'personnel.state.edit' : sub === 'nummer' ? 'personnel.number.edit' : 'personnel.archive';
  try {
    const record = await getRecordByUser(guild.id, target.id);
    const actor = await buildActor({ guildId: guild.id, userId: interaction.user.id, roleIds: [...member.roles.cache.keys()], bypass: permissionService.isDiscordAdmin(member) });
    // Keine Akte oder kein Recht: gleiche Antwort wie ohne Recht, damit nichts über fremde Akten verraten wird
    if (!record || !(await canOn(actor, need, record))) return void (await reply(interaction, `❌ ${permissionDeniedMessage([need])}`));
    const opts = { permission: need };
    if (sub === 'status') {
      const r = await setTeamState(guild.id, record.id, o.getString('zustand', true), o.getString('grund') ?? undefined, interaction.user.id, opts);
      return void (await reply(interaction, `✅ ${record.rpName}: ${TEAM_STATE_LABEL[effectiveState(r)]}`));
    }
    if (sub === 'schliessen') {
      await archiveRecord(guild.id, record.id, o.getString('grund', true), interaction.user.id, opts);
      return void (await reply(interaction, `✅ Akte von ${record.rpName} geschlossen. Sie bleibt mit Historie erhalten.`));
    }
    if (sub === 'wiederherstellen') {
      await restoreRecord(guild.id, record.id, interaction.user.id, opts);
      return void (await reply(interaction, `✅ Akte von ${record.rpName} wiederhergestellt (Zustand: aktiv).`));
    }
    const r = await setServiceNumber(guild.id, record.id, o.getString('nummer') ?? 'auto', interaction.user.id, opts);
    return void (await reply(interaction, `✅ Dienstnummer von ${record.rpName}: **${r.serviceNumber}**`));
  } catch (e) {
    if (e instanceof PersonnelError) return void (await reply(interaction, `❌ ${e.message}`));
    throw e;
  }
}

const user = (s: import('discord.js').SlashCommandSubcommandBuilder) => s.addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true));

export const personalCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('personal')
    .setDescription('Personalverwaltung: Teamstatus, Akte schließen, Dienstnummer')
    .setDMPermission(false)
    .addSubcommand((s) =>
      user(s.setName('status').setDescription('Teamstatus setzen (aktiv, Pause, außer Dienst, suspendiert)'))
        .addStringOption((o) => o.setName('zustand').setDescription('Neuer Zustand').setRequired(true).addChoices(...STATE_CHOICES))
        .addStringOption((o) => o.setName('grund').setDescription('Grund (bei Suspendierung Pflicht)').setMaxLength(300)),
    )
    .addSubcommand((s) =>
      user(s.setName('schliessen').setDescription('Akte schließen (Austritt) – Grund ist Pflicht'))
        .addStringOption((o) => o.setName('grund').setDescription('Schließungsgrund').setRequired(true).setMinLength(3).setMaxLength(300)),
    )
    .addSubcommand((s) => user(s.setName('wiederherstellen').setDescription('Geschlossene Akte wiederherstellen')))
    .addSubcommand((s) =>
      user(s.setName('nummer').setDescription('Dienstnummer vergeben oder korrigieren'))
        .addStringOption((o) => o.setName('nummer').setDescription('Neue Nummer (leer = nächste freie automatisch)').setMaxLength(30)),
    )
    .toJSON(),
  execute: runPersonal,
});
