import { MessageFlags, SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import { restDiscordPort } from '@nexus/automation';
import { permissionDeniedMessage } from '@nexus/permissions';
import { SekError, addMember, assignSquad, createSekOperation, isSekCourse, listMembers, listSekOperations, listSekTrainings, listSquads, removeMember, removeSquadMember, saveSquad, setSquadMember, stats, syncRadio } from '@nexus/sek';
import { createTraining, formatNumber as trainingNumber, listCourses, parseBerlin } from '@nexus/training';
import { formatNumber, getByNumber } from '@nexus/operations';
import type { Permission } from '@nexus/types';
import { config } from '../config.js';
import { embeds } from '../core/embed-builder.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

/**
 * `/sek übersicht|mitglieder|aufnehmen|entfernen|team|team-mitglied|einsatz|einsatz-team|ausbildungen|ausbildung-neu|funk|statistik`
 * – SEK-Modul (Rechte `sek.*`). Alle Daten liegen in den allgemeinen Systemen; hier wird nur gebündelt.
 */
const reply = (i: ChatInputCommandInteraction, content: string) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const DUTY = { ON: '🟢', PAUSED: '🟡', OFF: '⚫' } as const;
const ts = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:f>`;
const hours = (s: number) => `${Math.floor(s / 3600)} Std ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} Min`;

export async function runSek(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await reply(interaction, 'Das geht nur auf einem Server.'));
  const sub = interaction.options.getSubcommand();
  const o = interaction.options;
  const need: Permission = ({ aufnehmen: 'sek.member.manage', entfernen: 'sek.member.manage', team: 'sek.member.manage', 'team-mitglied': 'sek.member.manage', einsatz: 'sek.member.manage', 'einsatz-team': 'sek.member.manage', funk: 'sek.member.manage', 'ausbildung-neu': 'sek.training.manage', ausbildungen: 'sek.training.view' } as Record<string, Permission>)[sub] ?? 'sek.view';
  if (!(await permissionService.can(member, need)) && !(await permissionService.can(member, 'sek.manage'))) return void (await reply(interaction, `❌ ${permissionDeniedMessage([need])}`));
  const port = () => restDiscordPort(config.discord.token);
  try {
    if (sub === 'mitglieder' || sub === 'übersicht') {
      const m = await listMembers(guild.id);
      const squads = await listSquads(guild.id);
      const lines = m.map((x) => `${DUTY[x.onDuty]} **${x.rpName}** <@${x.userId}> · ${x.rank ?? '–'}${x.hasQualification ? '' : ' · ⚠️ Qualifikation fehlt'}${x.squads.length ? ` · ${x.squads.join(', ')}` : ''}`);
      const sq = squads.filter((s) => s.active).map((s) => `**${s.name}**: ${s.members.map((x) => `<@${x.userId}> (${x.role})`).join(', ') || '–'}`);
      return void (await interaction.reply({ embeds: [embeds.info({ title: '🛡️ SEK', description: `${lines.join('\n') || 'Keine Mitglieder.'}${sub === 'übersicht' && sq.length ? `\n\n**Einsatzteams**\n${sq.join('\n')}` : ''}`.slice(0, 3900) })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    if (sub === 'aufnehmen') {
      const user = o.getUser('mitglied', true);
      const r = await addMember({ guildId: guild.id, userId: user.id, actorId: member.id, override: o.getBoolean('ausnahme') ?? undefined, reason: o.getString('grund') ?? undefined, port: port() });
      return void (await reply(interaction, `✅ <@${user.id}> ist jetzt im SEK${r.awarded ? ' (Qualifikation vergeben)' : ''}.`));
    }
    if (sub === 'entfernen') {
      const user = o.getUser('mitglied', true);
      await removeMember({ guildId: guild.id, userId: user.id, actorId: member.id, reason: o.getString('grund', true), port: port() });
      return void (await reply(interaction, `✅ <@${user.id}> wurde aus dem SEK entfernt.`));
    }
    if (sub === 'team') {
      const s = await saveSquad(guild.id, { name: o.getString('name', true), leaderId: o.getUser('leiter')?.id }, member.id);
      return void (await reply(interaction, `✅ Einsatzteam **${s.name}** gespeichert.`));
    }
    if (sub === 'team-mitglied') {
      const squad = (await listSquads(guild.id)).find((s) => s.name.toLowerCase() === o.getString('team', true).toLowerCase());
      if (!squad) return void (await reply(interaction, '❌ Dieses Einsatzteam gibt es nicht.'));
      const user = o.getUser('mitglied', true);
      if (o.getString('aktion') === 'entfernen') await removeSquadMember(guild.id, squad.id, user.id, member.id);
      else await setSquadMember(guild.id, squad.id, user.id, o.getString('funktion') ?? undefined, member.id);
      return void (await reply(interaction, `✅ ${squad.name}: <@${user.id}> ${o.getString('aktion') === 'entfernen' ? 'entfernt' : 'eingetragen'}.`));
    }
    if (sub === 'einsatz') {
      const op = await createSekOperation({ guildId: guild.id, actorId: member.id, kind: o.getString('art', true), location: o.getString('ort', true), priority: o.getString('prioritaet') ?? undefined, description: o.getString('beschreibung') ?? undefined });
      return void (await reply(interaction, `✅ SEK-Einsatz **${formatNumber(op.number)}** angelegt. Einheiten weist du mit \`/einsatz zuweisen\` zu, Einsatzteams mit \`/sek einsatz-team\`.`));
    }
    if (sub === 'einsatz-team') {
      const op = await getByNumber(guild.id, Number(o.getString('nummer', true).replace(/^E-?/i, '')));
      const squad = (await listSquads(guild.id)).find((s) => s.name.toLowerCase() === o.getString('team', true).toLowerCase());
      if (!squad) return void (await reply(interaction, '❌ Dieses Einsatzteam gibt es nicht.'));
      await assignSquad(guild.id, op.id, squad.id, member.id);
      return void (await reply(interaction, `✅ ${squad.name} → ${formatNumber(op.number)}`));
    }
    if (sub === 'ausbildungen') {
      const list = await listSekTrainings(guild.id);
      return void (await interaction.reply({ embeds: [embeds.info({ title: '🎓 SEK-Ausbildungen', description: list.slice(0, 15).map((t) => `**${trainingNumber(t.number)}** ${t.course.name} – ${ts(t.scheduledAt)} · ${t.status}`).join('\n') || 'Keine SEK-Termine.' })], flags: MessageFlags.Ephemeral }));
    }
    if (sub === 'ausbildung-neu') {
      const courseName = o.getString('ausbildung', true).toLowerCase();
      const course = (await listCourses(guild.id, true)).find((c) => c.name.toLowerCase() === courseName);
      if (!course || !(await isSekCourse(guild.id, course.id))) return void (await reply(interaction, '❌ Das ist keine SEK-Ausbildung.'));
      const when = parseBerlin(o.getString('termin', true));
      if (!when) return void (await reply(interaction, '❌ Bitte den Termin als `TT.MM.JJJJ HH:MM` angeben.'));
      const t = await createTraining({ guildId: guild.id, courseId: course.id, scheduledAt: when, actorId: member.id, trainerIds: [member.id], location: o.getString('ort') ?? undefined });
      return void (await reply(interaction, `✅ Termin **${trainingNumber(t.number)}** (${course.name}) am ${ts(when)} angelegt.`));
    }
    if (sub === 'funk') {
      const r = await syncRadio(guild.id, member.id);
      return void (await reply(interaction, `✅ Spezialfunk: ${r.granted.length} freigeschaltet, ${r.kept.length} hatten ihn bereits.`));
    }
    // statistik
    const st = await stats(guild.id, (o.getString('zeitraum') as 'day' | 'week' | 'month' | 'all' | null) ?? 'month');
    const fields = [
      { name: 'Personal', value: `${st.members.total} Mitglieder · ${st.members.qualified} qualifiziert · ${st.members.onDuty} im Dienst`, inline: false },
      { name: 'Einsätze', value: Object.entries(st.operations).map(([k, v]) => `${k}: ${v}`).join(' · ') || '–', inline: false },
      { name: 'Ausbildungen', value: `${st.trainings.total} Termine · ${st.trainings.passed} bestanden`, inline: false },
      ...(st.shifts ? [{ name: 'Dienstzeit (Rangliste)', value: st.shifts.leaderboard.map((e) => `${e.rank}. <@${e.userId}> ${hours(e.totalSeconds)}`).join('\n') || '–', inline: false }] : []),
    ];
    await interaction.reply({ embeds: [embeds.info({ title: '🛡️ SEK-Statistik', description: ' ', fields })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  } catch (e) {
    if (e instanceof SekError) return void (await reply(interaction, `❌ ${e.message}`));
    if (e instanceof Error && ['TrainingError', 'OperationError', 'RadioError', 'QualificationError', 'PersonnelError'].includes(e.name)) return void (await reply(interaction, `❌ ${e.message}`));
    throw e;
  }
}

export async function autocompleteSek(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guild) return void (await interaction.respond([]));
  const f = interaction.options.getFocused(true);
  const q = f.value.toLowerCase();
  if (f.name === 'team') return void (await interaction.respond((await listSquads(interaction.guild.id)).filter((s) => s.name.toLowerCase().includes(q)).slice(0, 25).map((s) => ({ name: s.name, value: s.name }))));
  if (f.name === 'ausbildung') return void (await interaction.respond((await listCourses(interaction.guild.id, true)).filter((c) => c.name.toLowerCase().includes(q)).slice(0, 25).map((c) => ({ name: c.name, value: c.name }))));
  const ops = await listSekOperations(interaction.guild.id);
  await interaction.respond(ops.filter((s) => s.operation.status !== 'COMPLETED' && s.operation.status !== 'CANCELLED').slice(0, 25).map((s) => ({ name: `${formatNumber(s.operation.number)} ${s.operation.kind}`.slice(0, 100), value: formatNumber(s.operation.number) })));
}

const team = (s: import('discord.js').SlashCommandSubcommandBuilder) => s.addStringOption((o) => o.setName('team').setDescription('Einsatzteam').setRequired(true).setAutocomplete(true));

export const sekCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('sek')
    .setDescription('SEK: Personal, Einsatzteams, Einsätze, Ausbildungen, Funk, Statistik')
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('übersicht').setDescription('Mitglieder und Einsatzteams'))
    .addSubcommand((s) => s.setName('mitglieder').setDescription('SEK-Personal mit Dienststatus'))
    .addSubcommand((s) => s.setName('aufnehmen').setDescription('Mitglied ins SEK aufnehmen (Team + Qualifikation)').addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true)).addBooleanOption((o) => o.setName('ausnahme').setDescription('Voraussetzungen übergehen (Grund nötig)')).addStringOption((o) => o.setName('grund').setDescription('Begründung').setMaxLength(300)))
    .addSubcommand((s) => s.setName('entfernen').setDescription('Mitglied aus dem SEK entfernen').addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true)).addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(true).setMaxLength(300)))
    .addSubcommand((s) => s.setName('team').setDescription('Einsatzteam anlegen/ändern').addStringOption((o) => o.setName('name').setDescription('Name, z. B. Alpha').setRequired(true).setMaxLength(40)).addUserOption((o) => o.setName('leiter').setDescription('Teamleiter')))
    .addSubcommand((s) => team(s.setName('team-mitglied').setDescription('Mitglied im Einsatzteam eintragen/entfernen')).addUserOption((o) => o.setName('mitglied').setDescription('SEK-Mitglied').setRequired(true)).addStringOption((o) => o.setName('funktion').setDescription('z. B. Scharfschütze').setMaxLength(40)).addStringOption((o) => o.setName('aktion').setDescription('Standard: eintragen').addChoices({ name: 'eintragen', value: 'eintragen' }, { name: 'entfernen', value: 'entfernen' })))
    .addSubcommand((s) => s.setName('einsatz').setDescription('SEK-Einsatz anlegen').addStringOption((o) => o.setName('art').setDescription('Art').setRequired(true).setMaxLength(55)).addStringOption((o) => o.setName('ort').setDescription('Ort').setRequired(true).setMaxLength(100)).addStringOption((o) => o.setName('prioritaet').setDescription('Priorität').addChoices({ name: 'Niedrig', value: 'LOW' }, { name: 'Normal', value: 'NORMAL' }, { name: 'Hoch', value: 'HIGH' }, { name: 'Dringend', value: 'URGENT' })).addStringOption((o) => o.setName('beschreibung').setDescription('Beschreibung').setMaxLength(1000)))
    .addSubcommand((s) => team(s.setName('einsatz-team').setDescription('Einsatzteam einem SEK-Einsatz zuordnen')).addStringOption((o) => o.setName('nummer').setDescription('Einsatznummer').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('ausbildungen').setDescription('SEK-Ausbildungstermine'))
    .addSubcommand((s) => s.setName('ausbildung-neu').setDescription('SEK-Ausbildungstermin anlegen').addStringOption((o) => o.setName('ausbildung').setDescription('SEK-Ausbildung').setRequired(true).setAutocomplete(true)).addStringOption((o) => o.setName('termin').setDescription('TT.MM.JJJJ HH:MM').setRequired(true)).addStringOption((o) => o.setName('ort').setDescription('Ort').setMaxLength(100)))
    .addSubcommand((s) => s.setName('funk').setDescription('Spezialfunk für alle SEK-Mitglieder freischalten'))
    .addSubcommand((s) => s.setName('statistik').setDescription('SEK-Statistiken').addStringOption((o) => o.setName('zeitraum').setDescription('Standard: Monat').addChoices({ name: 'Heute', value: 'day' }, { name: 'Woche', value: 'week' }, { name: 'Monat', value: 'month' }, { name: 'Gesamt', value: 'all' })))
    .toJSON(),
  execute: runSek,
  autocomplete: autocompleteSek,
});
