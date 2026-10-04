import { MessageFlags, SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import { restDiscordPort } from '@nexus/automation';
import { permissionDeniedMessage } from '@nexus/permissions';
import {
  PART_LABEL,
  PARTS,
  TrainingError,
  activeParts,
  cancelTraining,
  createTraining,
  enroll,
  finishTraining,
  formatNumber,
  getByNumber,
  grade,
  listCourses,
  listTrainings,
  parseBerlin,
  progressOf,
  setTrainers,
  startTraining,
  withdraw,
  type Actor,
} from '@nexus/training';
import type { Permission } from '@nexus/types';
import { config } from '../config.js';
import { embeds } from '../core/embed-builder.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

/**
 * `/ausbildung liste|info|anmelden|abmelden|meine|neu|ausbilder|start|bewerten|ende|absagen` – Ausbildungssystem.
 * Teilnehmer: `own.training.view` (oder `training.view`); Termine anlegen: `training.create`; Ausbilder setzen:
 * `training.trainer.manage`; starten/bewerten/beenden: `training.session.manage` **und** Ausbilder des Termins
 * (oder `training.manage`); Prüfung bewerten zusätzlich `exam.manage`.
 */
const reply = (i: ChatInputCommandInteraction, content: string) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const nr = (s: string) => Number(s.replace(/^T-?/i, ''));
const ts = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:f>`;
const STATUS = { PLANNED: '🗓️ Geplant', RUNNING: '▶️ Läuft', FINISHED: '✅ Beendet', CANCELLED: '❌ Abgesagt' } as const;
type Tr = Awaited<ReturnType<typeof getByNumber>>;
const taken = (t: Tr) => t.participants.filter((p) => p.status === 'ENROLLED' || p.status === 'PASSED' || p.status === 'FAILED').length;
const line = (t: Tr) => `**${formatNumber(t.number)}** ${t.course.name} – ${ts(t.scheduledAt)} · ${STATUS[t.status]} · ${taken(t)}/${t.maxParticipants}`;

export async function runAusbildung(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await reply(interaction, 'Das geht nur auf einem Server.'));
  const sub = interaction.options.getSubcommand();
  const o = interaction.options;
  const can = (k: Permission) => permissionService.can(member, k);
  const deny = (...k: Permission[]) => reply(interaction, `❌ ${permissionDeniedMessage(k)}`);
  const memberOk = (await can('own.training.view')) || (await can('training.view'));
  const needs: Record<string, Permission[]> = { neu: ['training.create'], ausbilder: ['training.trainer.manage'], start: ['training.session.manage'], bewerten: ['training.session.manage'], ende: ['training.session.manage'], absagen: ['training.session.manage'] };
  if (needs[sub]) {
    if (!(await can(needs[sub]![0]!)) && !(sub === 'absagen' && (await can('training.manage')))) return void (await deny(...needs[sub]!));
  } else if (!memberOk) return void (await deny('own.training.view'));
  const actor: Actor = { userId: member.id, manage: await can('training.manage'), canExam: await can('exam.manage') };
  try {
    if (sub === 'liste') {
      const list = await listTrainings({ guildId: guild.id, upcoming: true, limit: 15 });
      return void (await interaction.reply({ embeds: [embeds.info({ title: '🎓 Ausbildungstermine', description: list.map(line).join('\n') || 'Keine anstehenden Termine.' })], flags: MessageFlags.Ephemeral }));
    }
    if (sub === 'meine') {
      const p = await progressOf(guild.id, member.id);
      const text = [`**Bestanden:** ${p.passed.map((x) => `${x.course} (${x.percent} %)`).join(', ') || '–'}`, `**Angemeldet:** ${p.enrolled.map((x) => `${formatNumber(x.number)} ${x.course} ${ts(x.scheduledAt)}`).join('; ') || '–'}`].join('\n');
      return void (await interaction.reply({ embeds: [embeds.info({ title: '🎓 Meine Ausbildungen', description: text })], flags: MessageFlags.Ephemeral }));
    }
    if (sub === 'neu') {
      const courseName = o.getString('ausbildung', true);
      const course = (await listCourses(guild.id, true)).find((c) => c.id === courseName || c.name.toLowerCase() === courseName.toLowerCase());
      if (!course) return void (await reply(interaction, '❌ Diese Ausbildung gibt es nicht (oder sie ist deaktiviert).'));
      const when = parseBerlin(o.getString('termin', true));
      if (!when) return void (await reply(interaction, '❌ Bitte den Termin als `TT.MM.JJJJ HH:MM` angeben, z. B. `15.07.2026 18:30`.'));
      const t = await createTraining({ guildId: guild.id, courseId: course.id, scheduledAt: when, actorId: member.id, location: o.getString('ort') ?? undefined, trainerIds: [member.id] });
      return void (await reply(interaction, `✅ Termin **${formatNumber(t.number)}** (${course.name}) am ${ts(when)} angelegt – du bist Ausbilder.`));
    }
    const t = await getByNumber(guild.id, nr(o.getString('nummer', true)));
    if (sub === 'info') {
      const parts = activeParts(t.course).map((p) => `${PART_LABEL[p]} (${({ THEORY: t.course.theoryMax, PRACTICE: t.course.practiceMax, EXAM: t.course.examMax })[p]} P.)`).join(', ');
      const people = t.participants.filter((p) => p.status !== 'WITHDRAWN' && p.status !== 'REMOVED').map((p) => `<@${p.userId}>${p.status === 'PASSED' ? ` ✅ ${p.percent} %` : p.status === 'FAILED' ? ` ❌ ${p.percent} %` : ''}`).join(', ');
      return void (await interaction.reply({ embeds: [embeds.info({ title: `${formatNumber(t.number)} – ${t.course.name}`, description: t.course.description ?? '–', fields: [{ name: 'Termin', value: `${ts(t.scheduledAt)}${t.location ? ` · ${t.location}` : ''}`, inline: true }, { name: 'Status', value: STATUS[t.status], inline: true }, { name: 'Ausbilder', value: t.trainerIds.map((x) => `<@${x}>`).join(', ') || '–', inline: true }, { name: 'Teile / Bestehen', value: `${parts} · ab ${t.course.passPercent} %` }, { name: `Teilnehmer ${taken(t)}/${t.maxParticipants}`, value: people || '–' }] })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    if (sub === 'anmelden') {
      await enroll({ guildId: guild.id, trainingId: t.id, userId: member.id, memberRoleIds: [...member.roles.cache.keys()], actorId: member.id });
      return void (await reply(interaction, `✅ Angemeldet für **${formatNumber(t.number)} ${t.course.name}** am ${ts(t.scheduledAt)}.`));
    }
    if (sub === 'abmelden') {
      await withdraw(guild.id, t.id, member.id, member.id);
      return void (await reply(interaction, `✅ Von **${formatNumber(t.number)}** abgemeldet.`));
    }
    if (sub === 'ausbilder') {
      const user = o.getUser('mitglied', true);
      const add = o.getString('aktion') !== 'entfernen';
      const next = add ? [...new Set([...t.trainerIds, user.id])] : t.trainerIds.filter((x) => x !== user.id);
      const r = await setTrainers(guild.id, t.id, next, member.id);
      return void (await reply(interaction, `✅ Ausbilder: ${r.trainerIds.map((x) => `<@${x}>`).join(', ') || '–'}`));
    }
    if (sub === 'start') return void (await reply(interaction, `✅ ${line(await startTraining(guild.id, t.id, actor))}`));
    if (sub === 'ende') return void (await reply(interaction, `✅ ${line(await finishTraining(guild.id, t.id, actor))}`));
    if (sub === 'absagen') return void (await reply(interaction, `✅ ${line(await cancelTraining(guild.id, t.id, o.getString('grund', true), member.id, actor.manage === true))}`));
    // bewerten
    const user = o.getUser('mitglied', true);
    const r = await grade({ guildId: guild.id, trainingId: t.id, userId: user.id, part: o.getString('teil', true), points: o.getInteger('punkte', true), actor, port: restDiscordPort(config.discord.token) });
    const e = r.evaluation;
    const res = e.complete ? (e.passed ? `✅ **bestanden** (${e.percent} %)` : `❌ **nicht bestanden** (${e.percent} %${e.examPercent !== null && e.examPercent < t.course.passPercent ? `, Prüfung ${e.examPercent} %` : ''})`) : `noch offen: ${e.missing.map((m) => PART_LABEL[m]).join(', ')}`;
    const role = r.roleResult?.endsWith('failed') ? '\n⚠️ Die Rolle konnte nicht vergeben werden – Bot-Rechte prüfen.' : r.roleResult?.startsWith('add') ? '\n🎖️ Rolle vergeben.' : '';
    await reply(interaction, `<@${user.id}>: ${res}${role}`);
  } catch (e) {
    if (e instanceof TrainingError) return void (await reply(interaction, `❌ ${e.message}`));
    throw e;
  }
}

export async function autocompleteAusbildung(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guild) return void (await interaction.respond([]));
  const f = interaction.options.getFocused(true);
  const q = f.value.toLowerCase();
  if (f.name === 'ausbildung') {
    const courses = await listCourses(interaction.guild.id, true);
    return void (await interaction.respond(courses.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 25).map((c) => ({ name: c.name, value: c.name }))));
  }
  const list = await listTrainings({ guildId: interaction.guild.id, upcoming: true, limit: 25 });
  await interaction.respond(list.filter((t) => `${formatNumber(t.number)} ${t.course.name}`.toLowerCase().includes(q)).map((t) => ({ name: `${formatNumber(t.number)} ${t.course.name}`.slice(0, 100), value: formatNumber(t.number) })));
}

const nummer = (s: import('discord.js').SlashCommandSubcommandBuilder) => s.addStringOption((o) => o.setName('nummer').setDescription('Terminnummer').setRequired(true).setAutocomplete(true));

export const ausbildungCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('ausbildung')
    .setDescription('Ausbildungen: Termine, Anmeldung, Bewertung')
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('liste').setDescription('Anstehende Termine'))
    .addSubcommand((s) => s.setName('meine').setDescription('Meine Ausbildungen'))
    .addSubcommand((s) => nummer(s.setName('info').setDescription('Termin anzeigen')))
    .addSubcommand((s) => nummer(s.setName('anmelden').setDescription('Für einen Termin anmelden')))
    .addSubcommand((s) => nummer(s.setName('abmelden').setDescription('Vom Termin abmelden')))
    .addSubcommand((s) =>
      s.setName('neu').setDescription('Termin anlegen (du wirst Ausbilder)')
        .addStringOption((o) => o.setName('ausbildung').setDescription('Ausbildung').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('termin').setDescription('TT.MM.JJJJ HH:MM (Berlin-Zeit)').setRequired(true))
        .addStringOption((o) => o.setName('ort').setDescription('Ort').setMaxLength(100)),
    )
    .addSubcommand((s) => nummer(s.setName('ausbilder').setDescription('Ausbilder hinzufügen/entfernen')).addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true)).addStringOption((o) => o.setName('aktion').setDescription('Standard: hinzufügen').addChoices({ name: 'hinzufügen', value: 'hinzufügen' }, { name: 'entfernen', value: 'entfernen' })))
    .addSubcommand((s) => nummer(s.setName('start').setDescription('Termin starten')))
    .addSubcommand((s) =>
      nummer(s.setName('bewerten').setDescription('Teil bewerten (Punkte)'))
        .addUserOption((o) => o.setName('mitglied').setDescription('Teilnehmer').setRequired(true))
        .addStringOption((o) => o.setName('teil').setDescription('Teil').setRequired(true).addChoices(...PARTS.map((p) => ({ name: PART_LABEL[p], value: p }))))
        .addIntegerOption((o) => o.setName('punkte').setDescription('Punkte').setRequired(true).setMinValue(0).setMaxValue(1000)),
    )
    .addSubcommand((s) => nummer(s.setName('ende').setDescription('Termin beenden (alle Bewertungen nötig)')))
    .addSubcommand((s) => nummer(s.setName('absagen').setDescription('Termin absagen')).addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(true).setMaxLength(300)))
    .toJSON(),
  execute: runAusbildung,
  autocomplete: autocompleteAusbildung,
});
