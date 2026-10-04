import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import {
  askClarification,
  decideSubmission,
  denyReasonsOf,
  inviteToInterview,
  restDiscordPort,
  startReview,
  viewSubmission,
  withdrawSubmission,
  type DiscordPort,
} from '@nexus/automation';
import { prisma } from '@nexus/database';
import type { Permission } from '@nexus/types';
import { registerButton, registerModal, registerSelect } from '../core/interaction-registry.js';
import { config } from '../config.js';
import { buildCustomId, isValidId } from '../discord/custom-ids.js';
import { requireMemberPermission } from '../discord/permissions.js';
import { addNote, buildHistoryEmbed } from './review-service.js';

/**
 * Bearbeitung durch das Team (Phase 10): Ansehen · Annehmen · Ablehnen · Rückfrage · Gespräch · Notiz · Verlauf
 * sowie das Zurückziehen durch den Bewerber. Jede Aktion prüft die passende Berechtigung **serverseitig**
 * (Annehmen ≠ Ablehnen ≠ Rückfrage); die eigentliche Logik liegt in `@nexus/automation`.
 */
let portOverride: DiscordPort | null = null;
/** Nur für Tests: ersetzt die Discord-REST-Anbindung. */
export function setReviewPort(port: DiscordPort | null): void {
  portOverride = port;
}
export const reviewPort = (): DiscordPort => portOverride ?? restDiscordPort(config.discord.token);

export const dashboardLink = (submissionId?: string): string | undefined => {
  const base = process.env['DASHBOARD_URL']?.split(',')[0];
  return base ? `${base}${submissionId ? `?submission=${submissionId}` : ''}` : undefined;
};

const A = {
  view: 'review:view',
  accept: 'review:accept_r',
  deny: 'review:deny',
  denySelect: 'review:denysel',
  denyModal: 'review:deny_r',
  ask: 'review:ask',
  interview: 'review:interview',
  history: 'review:history',
  note: 'review:note',
  withdraw: 'dm:withdraw',
} as const;
const id = (action: string, ...args: string[]) => buildCustomId(action as never, ...args);

const ephemeral = MessageFlags.Ephemeral;
const slice = (t: string, n = 1900) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

const textModal = (
  customId: string,
  title: string,
  field: string,
  label: string,
  required: boolean,
  max = 1000,
) =>
  new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(field)
          .setLabel(label.slice(0, 45))
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(required)
          .setMaxLength(max),
      ),
    );

const need = (
  i: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
  ...keys: Permission[]
) => requireMemberPermission(i as never, keys);
const guildOf = (i: { guildId: string | null }) => i.guildId ?? '';

// --- Ansehen ----------------------------------------------------------------

registerButton(A.view, async (i, { args }) => {
  const submissionId = args[0] ?? '';
  if (!isValidId(submissionId) || !(await need(i, 'applications.submissions.view'))) return;
  await i.deferReply({ flags: ephemeral });
  const r = await viewSubmission(reviewPort(), {
    submissionId,
    guildId: guildOf(i),
    reviewerId: i.user.id,
  });
  if (!r.ok) return void (await i.editReply(`⚠️ ${r.message}`));
  await i.editReply({ content: slice(`**${r.title}**`), allowedMentions: { parse: [] } });
  for (const block of r.blocks)
    await i.followUp({ content: slice(block), flags: ephemeral, allowedMentions: { parse: [] } });
});

// --- Annehmen: Bestätigung per Modal (optionale Nachricht) ---------------------

registerButton(A.accept, async (i, { args }) => {
  const submissionId = args[0] ?? '';
  if (!isValidId(submissionId) || !(await need(i, 'applications.submissions.accept'))) return;
  await i.showModal(
    textModal(
      id(A.accept, submissionId),
      'Bewerbung annehmen',
      'note',
      'Nachricht an den Bewerber (optional)',
      false,
    ),
  );
});

registerModal(A.accept, async (i, { args }) => {
  const submissionId = args[0] ?? '';
  if (!isValidId(submissionId) || !(await need(i, 'applications.submissions.accept'))) return;
  await i.deferReply({ flags: ephemeral });
  const note = i.fields.getTextInputValue('note').trim() || undefined;
  const r = await decideSubmission(reviewPort(), {
    submissionId,
    guildId: guildOf(i),
    reviewerId: i.user.id,
    decision: 'ACCEPTED',
    note,
    dashboardUrl: dashboardLink(submissionId),
  });
  await i.editReply({
    content: slice(r.ok ? r.message : `⚠️ ${r.message}`),
    allowedMentions: { parse: [] },
  });
});

// --- Ablehnen: Grund wählen → optionale Nachricht ------------------------------

registerButton(A.deny, async (i, { args }) => {
  const submissionId = args[0] ?? '';
  if (!isValidId(submissionId) || !(await need(i, 'applications.submissions.deny'))) return;
  const s = await prisma.applicationSubmission.findFirst({
    where: { id: submissionId, guildId: guildOf(i) },
    include: { application: true },
  });
  if (!s)
    return void (await i.reply({ content: '⚠️ Bewerbung nicht gefunden.', flags: ephemeral }));
  const reasons = denyReasonsOf(s.application.config).slice(0, 25);
  await i.reply({
    content: '🔴 **Ablehnungsgrund wählen**',
    flags: ephemeral,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(id(A.denySelect, submissionId))
          .setPlaceholder('Grund …')
          .addOptions(
            reasons.map((r) => ({
              label: r.label.slice(0, 100),
              value: r.id,
              ...(r.text ? { description: r.text.slice(0, 100) } : {}),
            })),
          ),
      ),
    ],
  });
});

registerSelect(A.denySelect, async (i, { args }) => {
  const submissionId = args[0] ?? '';
  const reasonId = i.values[0] ?? '';
  if (!isValidId(submissionId) || !reasonId || !(await need(i, 'applications.submissions.deny')))
    return;
  await i.showModal(
    textModal(
      id(A.denyModal, submissionId, reasonId),
      'Bewerbung ablehnen',
      'note',
      'Zusätzliche Nachricht (optional)',
      false,
    ),
  );
});

registerModal(A.denyModal, async (i, { args }) => {
  const [submissionId = '', reasonId = ''] = args;
  if (!isValidId(submissionId) || !(await need(i, 'applications.submissions.deny'))) return;
  await i.deferReply({ flags: ephemeral });
  const note = i.fields.getTextInputValue('note').trim() || undefined;
  const r = await decideSubmission(reviewPort(), {
    submissionId,
    guildId: guildOf(i),
    reviewerId: i.user.id,
    decision: 'DENIED',
    reasonId,
    note,
    dashboardUrl: dashboardLink(submissionId),
  });
  await i.editReply({
    content: slice(r.ok ? r.message : `⚠️ ${r.message}`),
    allowedMentions: { parse: [] },
  });
});

// --- Rückfrage / Gespräch ---------------------------------------------------------

for (const [action, title, label, run] of [
  [A.ask, 'Rückfrage an den Bewerber', 'Deine Frage', 'ask'],
  [A.interview, 'Gespräch vereinbaren', 'Nachricht / Termin', 'interview'],
] as const) {
  registerButton(action, async (i, { args }) => {
    const submissionId = args[0] ?? '';
    if (!isValidId(submissionId) || !(await need(i, 'applications.submissions.review'))) return;
    await i.showModal(textModal(id(action, submissionId), title, 'text', label, true, 1500));
  });
  registerModal(action, async (i, { args }) => {
    const submissionId = args[0] ?? '';
    if (!isValidId(submissionId) || !(await need(i, 'applications.submissions.review'))) return;
    await i.deferReply({ flags: ephemeral });
    const text = i.fields.getTextInputValue('text').trim();
    const base = { submissionId, guildId: guildOf(i), reviewerId: i.user.id };
    const r =
      run === 'ask'
        ? await askClarification(reviewPort(), { ...base, question: text })
        : await inviteToInterview(reviewPort(), { ...base, message: text });
    await i.editReply(r.ok ? r.message : `⚠️ ${r.message}`);
  });
}

// --- Verlauf & Notiz -----------------------------------------------------------------

registerButton(A.history, async (i, { args }) => {
  const submissionId = args[0] ?? '';
  if (!isValidId(submissionId) || !(await need(i, 'applications.submissions.view'))) return;
  const embed = await buildHistoryEmbed(guildOf(i), submissionId);
  await i.reply({ embeds: [embed], flags: ephemeral });
});

registerButton(A.note, async (i, { args }) => {
  const submissionId = args[0] ?? '';
  if (!isValidId(submissionId) || !(await need(i, 'applications.notes.create'))) return;
  await i.showModal(
    textModal(
      id(A.note, submissionId),
      'Interne Notiz',
      'content',
      'Notiz (nur für Staff sichtbar)',
      true,
      4000,
    ),
  );
});

registerModal(A.note, async (i, { args }) => {
  const submissionId = args[0] ?? '';
  if (!isValidId(submissionId) || !(await need(i, 'applications.notes.create'))) return;
  const result = await addNote({
    guildId: guildOf(i),
    submissionId,
    authorId: i.user.id,
    content: i.fields.getTextInputValue('content'),
  });
  await i.reply({ content: result.message, flags: ephemeral });
});

// --- Bewerber: zurückziehen (Bestätigung per Modal, optional mit Grund) -----------------

registerButton(A.withdraw, async (i, { args }) => {
  const submissionId = args[0] ?? '';
  if (!isValidId(submissionId)) return;
  const own = await prisma.applicationSubmission.findFirst({
    where: { id: submissionId, userId: i.user.id },
    select: { id: true },
  });
  if (!own) return;
  await i.showModal(
    textModal(
      id(A.withdraw, submissionId),
      'Bewerbung zurückziehen?',
      'reason',
      'Grund (optional) – Absenden zieht zurück',
      false,
    ),
  );
});

registerModal(A.withdraw, async (i, { args }) => {
  const submissionId = args[0] ?? '';
  if (!isValidId(submissionId)) return;
  const reason = i.fields.getTextInputValue('reason').trim() || undefined;
  const r = await withdrawSubmission(reviewPort(), { submissionId, userId: i.user.id, reason });
  await i.reply({
    content: r.ok
      ? '↩️ Deine Bewerbung wurde zurückgezogen. Das Team wurde informiert.'
      : `⚠️ ${r.message}`,
    flags: ephemeral,
  });
  if (r.ok) await i.message?.edit({ components: [] }).catch(() => undefined);
});

export { startReview };
