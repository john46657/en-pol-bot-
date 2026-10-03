import type {
  Client,
  Guild,
  Interaction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
} from 'discord.js';
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { parseCustomId, CustomIdAction, isValidId } from '../discord/custom-ids.js';
import { log } from '../logger.js';
import { DMPhase, SubmissionStatus } from '@nexus/types';
import { prisma } from '@nexus/database';
import { startApplication } from '../applications/application-service.js';
import {
  openDM,
  processAnswer,
  sendIntro,
  sendQuestion,
  showSummary,
  editAnswer,
  type FlowContext,
} from '../applications/dm-flow.js';
import {
  acceptSubmission,
  addNote,
  buildHistoryEmbed,
  denySubmission,
} from '../applications/review-service.js';

/**
 * Zentraler Interaction-Router (§135: Custom-IDs werden serverseitig validiert).
 */

export async function handleInteraction(client: Client, interaction: Interaction): Promise<void> {
  try {
    if (interaction.isMessageComponent()) {
      await handleComponent(client, interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModal(client, interaction);
    }
  } catch (error) {
    log.error(
      {
        err: String(error),
        customId: 'customId' in interaction ? interaction.customId : undefined,
      },
      'Interaction-Handler Fehler.',
    );
    const reply =
      interaction.isRepliable() && !interaction.replied && !interaction.deferred
        ? interaction.reply({ content: '⚠️ Es ist ein Fehler aufgetreten.', ephemeral: true })
        : undefined;
    await reply?.catch(() => undefined);
  }
}

async function handleComponent(
  client: Client,
  interaction: MessageComponentInteraction,
): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return;

  switch (parsed.action) {
    case CustomIdAction.PANEL_START:
      return startApplicationFromPanel(client, interaction, parsed.args[0] ?? '');
    case CustomIdAction.DM_CANCEL:
      return cancelSubmission(interaction, parsed.args[0] ?? '');
    case CustomIdAction.DM_PAUSE:
      return pauseSubmission(interaction, parsed.args[0] ?? '');
    case CustomIdAction.DM_RESUME:
      return resumeSubmission(interaction, parsed.args[0] ?? '');
    case CustomIdAction.DM_BACK:
      return goBack(interaction, parsed.args[0] ?? '');
    case CustomIdAction.DM_EDIT_ANSWER:
      return startEdit(interaction, parsed.args[0] ?? '', parsed.args[1] ?? '');
    case CustomIdAction.DM_SUBMIT:
      return submitFromSummary(interaction, parsed.args[0] ?? '');
    case CustomIdAction.REVIEW_ACCEPT:
      return reviewDecide(interaction, parsed.args[0] ?? '', 'accept');
    case CustomIdAction.REVIEW_DENY:
      return reviewDecide(interaction, parsed.args[0] ?? '', 'deny');
    case CustomIdAction.REVIEW_ACCEPT_REASON:
      return reviewDecideWithReasonModal(interaction, parsed.args[0] ?? '', 'accept');
    case CustomIdAction.REVIEW_DENY_REASON:
      return reviewDecideWithReasonModal(interaction, parsed.args[0] ?? '', 'deny');
    case CustomIdAction.REVIEW_HISTORY:
      return reviewHistory(interaction, parsed.args[0] ?? '');
    case CustomIdAction.REVIEW_NOTE:
      return reviewNoteModal(interaction, parsed.args[0] ?? '');
    default:
      log.debug({ customId: interaction.customId }, 'Unbehandelte Interaction.');
  }
}

async function handleModal(_client: Client, interaction: ModalSubmitInteraction): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return;

  if (parsed.action === CustomIdAction.REVIEW_ACCEPT_REASON) {
    const reason = interaction.fields.getTextInputValue('reason');
    await reviewDecide(interaction, parsed.args[0] ?? '', 'accept', reason);
  } else if (parsed.action === CustomIdAction.REVIEW_DENY_REASON) {
    const reason = interaction.fields.getTextInputValue('reason');
    await reviewDecide(interaction, parsed.args[0] ?? '', 'deny', reason);
  } else if (parsed.action === CustomIdAction.REVIEW_NOTE) {
    const content = interaction.fields.getTextInputValue('content');
    const result = await addNote({
      guildId: interaction.guildId ?? '',
      submissionId: parsed.args[0] ?? '',
      authorId: interaction.user.id,
      content,
    });
    await interaction.reply({ content: result.message, ephemeral: true }).catch(() => undefined);
  }
}

// --- Panel → Start (§15) ----------------------------------------------------

async function startApplicationFromPanel(
  client: Client,
  interaction: MessageComponentInteraction,
  applicationId: string,
): Promise<void> {
  if (!interaction.guild || !isValidId(applicationId)) {
    await interaction
      .reply({ content: '⚠️ Ungültige Bewerbung.', ephemeral: true })
      .catch(() => undefined);
    return;
  }
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return;

  const started = await startApplication({
    guildId: interaction.guild.id,
    applicationId,
    userId: interaction.user.id,
    memberRoleIds: [...member.roles.cache.keys()],
    username: interaction.user.username,
    displayName: interaction.user.displayName,
    avatarUrl: interaction.user.displayAvatarURL(),
  });

  if (!started.ok || !started.submissionId) {
    await interaction
      .reply({ content: `⚠️ ${started.message}`, ephemeral: true })
      .catch(() => undefined);
    return;
  }

  // DM öffnen (§60: DM-Sicherheit) – Panel-Channel als Fallback
  const dm = await openDM(client, interaction.user.id, (interaction.channel as never) ?? undefined);
  if (!dm) {
    await interaction
      .reply({ content: '⚠️ Bewerbung konnte nicht per DM gestartet werden.', ephemeral: true })
      .catch(() => undefined);
    return;
  }

  const flowContext: FlowContext | null = await loadFlowContextFor(applicationId);
  if (!flowContext) {
    await interaction.reply({
      content: '⚠️ Bewerbung konnte nicht geladen werden.',
      ephemeral: true,
    });
    return;
  }

  await sendIntro(dm, flowContext, started.submissionId);

  await interaction
    .reply({ content: `✅ Deine Bewerbung wurde per DM gestartet.`, ephemeral: true })
    .catch(() => undefined);
}

async function loadFlowContextFor(applicationId: string): Promise<FlowContext | null> {
  const application = await prisma.application.findFirst({ where: { id: applicationId } });
  if (!application) return null;
  return {
    applicationId: application.id,
    applicationName: application.name,
    versionQuestions: [],
    messages: ((application.config as { messages?: Record<string, string> } | null)?.messages) ?? {},
  };
}

// --- DM Steuerung (§21/§22/§24) ---------------------------------------------

async function cancelSubmission(
  interaction: MessageComponentInteraction,
  submissionId: string,
): Promise<void> {
  if (!isValidId(submissionId)) return;
  const submission = await prisma.applicationSubmission.findFirst({ where: { id: submissionId } });
  if (!submission || submission.userId !== interaction.user.id) return;

  await prisma.applicationSubmission.update({
    where: { id: submissionId },
    data: { status: SubmissionStatus.CANCELLED },
  });
  await prisma.applicationDMState.updateMany({
    where: { submissionId },
    data: { phase: DMPhase.CANCELLED },
  });

  await interaction
    .reply({ content: '✖️ Deine Bewerbung wurde abgebrochen.', ephemeral: true })
    .catch(() => undefined);
}

async function pauseSubmission(
  interaction: MessageComponentInteraction,
  submissionId: string,
): Promise<void> {
  if (!isValidId(submissionId)) return;
  const submission = await prisma.applicationSubmission.findFirst({ where: { id: submissionId } });
  if (!submission || submission.userId !== interaction.user.id) return;

  await prisma.applicationSubmission.update({
    where: { id: submissionId },
    data: { status: SubmissionStatus.PAUSED },
  });
  await prisma.applicationDMState.updateMany({
    where: { submissionId },
    data: { phase: DMPhase.QUESTION },
  });

  await interaction
    .reply({
      content: '⏸️ Deine Bewerbung wurde pausiert. Klicke Fortsetzen, um sie weiterzuführen.',
      ephemeral: true,
    })
    .catch(() => undefined);
}

async function resumeSubmission(
  interaction: MessageComponentInteraction,
  submissionId: string,
): Promise<void> {
  if (!isValidId(submissionId)) return;
  const submission = await prisma.applicationSubmission.findFirst({ where: { id: submissionId } });
  if (!submission || submission.userId !== interaction.user.id) return;

  await prisma.applicationSubmission.update({
    where: { id: submissionId },
    data: { status: SubmissionStatus.IN_PROGRESS },
  });
  await prisma.applicationDMState.updateMany({
    where: { submissionId },
    data: { phase: DMPhase.QUESTION },
  });

  await interaction
    .reply({ content: '▶️ Deine Bewerbung wird fortgesetzt.', ephemeral: true })
    .catch(() => undefined);
}

async function goBack(
  interaction: MessageComponentInteraction,
  submissionId: string,
): Promise<void> {
  if (!isValidId(submissionId)) return;
  const state = await prisma.applicationDMState.findUnique({ where: { submissionId } });
  if (!state || state.userId !== interaction.user.id) return;

  const answers = await prisma.applicationAnswer.findMany({ where: { submissionId } });
  const answeredIds = answers.map((a) => a.questionId);
  const previous = answeredIds[answeredIds.length - 1];
  if (previous) {
    await prisma.applicationDMState.update({
      where: { submissionId },
      data: { currentQuestionId: previous, lastInteractionAt: new Date() },
    });
  }
  await interaction
    .reply({ content: '⬅️ Zurück zur vorherigen Frage.', ephemeral: true })
    .catch(() => undefined);
}

async function startEdit(
  interaction: MessageComponentInteraction,
  submissionId: string,
  questionId: string,
): Promise<void> {
  if (!isValidId(submissionId) || !questionId) return;
  const dm = interaction.channel;
  if (!dm || !dm.isDMBased()) return;
  await editAnswer(dm as never, submissionId, questionId);
  await interaction
    .reply({ content: '✏️ Frage gestellt.', ephemeral: true })
    .catch(() => undefined);
}

async function submitFromSummary(
  interaction: MessageComponentInteraction,
  submissionId: string,
): Promise<void> {
  if (!isValidId(submissionId)) return;
  const submission = await prisma.applicationSubmission.findFirst({
    where: { id: submissionId, userId: interaction.user.id },
  });
  if (!submission) return;

  // §91: Transition verifizieren, Antworten finalisieren
  if (
    submission.status !== SubmissionStatus.IN_PROGRESS &&
    submission.status !== SubmissionStatus.PAUSED
  ) {
    await interaction
      .reply({ content: '⚠️ Diese Bewerbung kann nicht abgeschickt werden.', ephemeral: true })
      .catch(() => undefined);
    return;
  }

  const now = new Date();
  await prisma.applicationSubmission.update({
    where: { id: submissionId },
    data: {
      status: SubmissionStatus.SUBMITTED,
      submittedAt: now,
      durationSeconds: Math.floor((now.getTime() - submission.startedAt.getTime()) / 1000),
    },
  });
  await prisma.applicationDMState.updateMany({
    where: { submissionId },
    data: { phase: DMPhase.CONFIRMED },
  });

  await interaction
    .reply({ content: '✅ Deine Bewerbung wurde eingereicht!', ephemeral: true })
    .catch(() => undefined);
}

// --- Review (§29) ------------------------------------------------------------

async function reviewDecide(
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
  submissionId: string,
  decision: 'accept' | 'deny',
  reason?: string,
): Promise<void> {
  if (!interaction.guild || !isValidId(submissionId)) return;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return;

  // Permission serverseitig (§114)
  const permissions = await readMemberPermissionsSimple(interaction.guild, interaction.user.id);
  const decide = decision === 'accept' ? acceptSubmission : denySubmission;
  const decisionInput: Parameters<typeof decide>[0] = {
    client: interaction.client,
    guildId: interaction.guild.id,
    submissionId,
    reviewerId: interaction.user.id,
    reviewerRolePermissions: permissions,
  };
  if (reason !== undefined) decisionInput.publicReason = reason;
  const result = await decide(decisionInput);

  await interaction
    .reply({ content: result.ok ? '✅ Erledigt.' : `⚠️ ${result.message}`, ephemeral: true })
    .catch(() => undefined);
}

function reviewDecideWithReasonModal(
  interaction: MessageComponentInteraction,
  submissionId: string,
  decision: 'accept' | 'deny',
): Promise<void> | undefined {
  if (!interaction.guild || !isValidId(submissionId)) return undefined;
  const modal = new ModalBuilder()
    .setCustomId(`nexus:review:${decision === 'accept' ? 'accept_r' : 'deny_r'}:${submissionId}`)
    .setTitle(decision === 'accept' ? '✅ Accept mit Grund' : '🔴 Deny mit Grund');

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Grund (öffentlich an den Bewerber)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(2000);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
  return interaction.showModal(modal).catch(() => undefined);
}

async function reviewHistory(
  interaction: MessageComponentInteraction,
  submissionId: string,
): Promise<void> {
  if (!interaction.guild || !isValidId(submissionId)) return;
  const embed = await buildHistoryEmbed(interaction.guild.id, submissionId);
  await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => undefined);
}

function reviewNoteModal(
  interaction: MessageComponentInteraction,
  submissionId: string,
): Promise<void> | undefined {
  if (!interaction.guild || !isValidId(submissionId)) return undefined;
  const modal = new ModalBuilder()
    .setCustomId(`nexus:review:note:${submissionId}`)
    .setTitle('📝 Interne Notiz');
  const content = new TextInputBuilder()
    .setCustomId('content')
    .setLabel('Notiz (nur für Staff sichtbar)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(4000);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(content));
  return interaction.showModal(modal).catch(() => undefined);
}

/**
 * Permission-Set des Members: nur die Permissions der Rollen,
 * die das Mitglied tatsächlich besitzt (§38/§114).
 */
async function readMemberPermissionsSimple(guild: Guild, memberId: string): Promise<Set<string>> {
  const guildRow = await prisma.guild.findUnique({
    where: { id: guild.id },
    select: { rolePermissions: true },
  });
  const raw = (guildRow?.rolePermissions ?? {}) as Record<string, string[]>;
  const member = await guild.members.fetch(memberId).catch(() => null);
  if (!member) return new Set();

  const permissions = new Set<string>();
  for (const roleId of member.roles.cache.keys()) {
    for (const p of raw[roleId] ?? []) {
      if (typeof p === 'string') permissions.add(p);
    }
  }
  return permissions;
}
