import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import {
  askClarification,
  decideSubmission,
  inviteToInterview,
  restDiscordPort,
  startReview,
  viewSubmission,
  withdrawSubmission,
  type DiscordPort,
} from '@nexus/automation';
import { prisma } from '@nexus/database';
import type { Permission } from '@nexus/types';
import { registerButton, registerModal } from '../core/interaction-registry.js';
import { config } from '../config.js';
import { buildCustomId, isValidId } from '../discord/custom-ids.js';
import { requireMemberPermission } from '../discord/permissions.js';
import { addNote, buildHistoryEmbed } from './review-service.js';
import { getSettings, listCategories, openTicket } from '@nexus/tickets';
import { log } from '../logger.js';
import { ticketDiscord } from '../tickets/ticket-core.js';

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
  accept: 'review:accept',
  acceptReason: 'review:accept_r',
  deny: 'review:deny',
  denyReason: 'review:deny_r',
  ticket: 'review:ticket',
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

// --- Entscheiden ---------------------------------------------------------------------------------------------
// Accept / Deny: sofort (mit den konfigurierten Standardtexten). Accept/Deny mit Grund: Modal mit Pflichtfeld.

async function decide(
  i: ButtonInteraction | ModalSubmitInteraction,
  submissionId: string,
  decision: 'ACCEPTED' | 'DENIED',
  note: string | undefined,
): Promise<void> {
  const r = await decideSubmission(reviewPort(), {
    submissionId,
    guildId: guildOf(i),
    reviewerId: i.user.id,
    decision,
    note,
    // „mit Grund“ speichert den Grund auch intern (Verlauf/Dashboard), nicht nur für den Bewerber
    ...(note ? { internalReason: note } : {}),
    dashboardUrl: dashboardLink(submissionId),
  });
  await i.editReply({ content: slice(r.ok ? r.message : `⚠️ ${r.message}`), allowedMentions: { parse: [] } });
  // Entscheidung sichtbar machen: Knöpfe der Bewerbung entfernen (nur wenn tatsächlich entschieden)
  if (r.ok && i.isButton()) await i.message.edit({ components: [] }).catch(() => undefined);
}

for (const [action, decision, perm] of [
  [A.accept, 'ACCEPTED', 'applications.submissions.accept'],
  [A.deny, 'DENIED', 'applications.submissions.deny'],
] as const) {
  registerButton(action, async (i, { args }) => {
    const submissionId = args[0] ?? '';
    if (!isValidId(submissionId) || !(await need(i, perm))) return;
    await i.deferReply({ flags: ephemeral });
    await decide(i, submissionId, decision, undefined);
  });
}

for (const [action, decision, perm, title, label] of [
  [A.acceptReason, 'ACCEPTED', 'applications.submissions.accept', 'Provide a reason for accepting', 'Provide a reason for accepting'],
  [A.denyReason, 'DENIED', 'applications.submissions.deny', 'Provide a reason for denying', 'Provide a reason for denying'],
] as const) {
  const modalId = action;
  registerButton(action, async (i, { args }) => {
    const submissionId = args[0] ?? '';
    if (!isValidId(submissionId) || !(await need(i, perm))) return;
    await i.showModal(textModal(id(modalId, submissionId), title, 'note', label, true, 1000));
  });
  registerModal(modalId, async (i, { args }) => {
    const submissionId = args[0] ?? '';
    if (!isValidId(submissionId) || !(await need(i, perm))) return;
    const reason = i.fields.getTextInputValue('note').trim();
    if (!reason) return void (await i.reply({ content: '⚠️ Bitte gib einen Grund an.', flags: ephemeral }));
    await i.deferReply({ flags: ephemeral });
    await decide(i, submissionId, decision, reason);
  });
}

// --- Ticket mit dem Bewerber eröffnen ----------------------------------------------------------------------------------

registerButton(A.ticket, async (i, { args }) => {
  const submissionId = args[0] ?? '';
  const member = await need(i, 'tickets.handle', 'tickets.manage');
  if (!isValidId(submissionId) || !member || !i.guild) return;
  await i.deferReply({ flags: ephemeral });
  try {
    const s = await prisma.applicationSubmission.findFirst({ where: { id: submissionId, guildId: i.guild.id }, include: { application: true } });
    if (!s) return void (await i.editReply('⚠️ Bewerbung nicht gefunden.'));
    const applicant = await i.guild.members.fetch(s.userId).catch(() => null);
    if (!applicant) return void (await i.editReply('⚠️ Der Bewerber ist nicht (mehr) auf dem Server.'));
    // Bereits ein offenes Gespräch zu dieser Bewerbung? Dann nicht doppelt anlegen.
    const existing = await prisma.ticket.findFirst({ where: { guildId: i.guild.id, submissionId, status: { not: 'CLOSED' } } });
    if (existing?.channelId) return void (await i.editReply(`ℹ️ Es gibt bereits ein Gespräch zu dieser Bewerbung: <#${existing.channelId}>`));
    const categories = await listCategories(i.guild.id, true);
    const configured = (await getSettings(i.guild.id)).applicationCategoryId;
    const cat = categories.find((c) => c.id === configured) ?? categories[0];
    if (!cat) return void (await i.editReply('⚠️ Es gibt keine aktive Ticket-Kategorie. Lege im Dashboard eine an.'));
    const t = await openTicket({ guildId: i.guild.id, userId: s.userId, username: applicant.displayName, categoryId: cat.id, subject: `Bewerbungsgespräch – ${s.application.name}`.slice(0, 100), roleIds: [...applicant.roles.cache.keys()], submission: { id: s.id, name: s.application.name }, openedBy: i.user.id }, ticketDiscord());
    await i.editReply(`🎫 Gespräch eröffnet: <#${t.channelId}>`);
  } catch (e) {
    log.error({ err: e instanceof Error ? (e.stack ?? e.message) : String(e), submissionId }, 'Ticket mit Bewerber fehlgeschlagen.');
    await i.editReply(e instanceof Error && e.name === 'TicketError' ? `❌ ${e.message}` : '❌ Ein Fehler ist aufgetreten. Bitte versuche es erneut oder wende dich an den Support.').catch(() => undefined);
  }
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
