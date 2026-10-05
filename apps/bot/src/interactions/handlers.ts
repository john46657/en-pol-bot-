import type {
  Client,
  Guild,
  Interaction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
} from 'discord.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { parseCustomId, CustomIdAction, isValidId } from '../discord/custom-ids.js';
import { log } from '../logger.js';
import { dispatchComponent, dispatchModal, registerSelect } from '../core/interaction-registry.js';
import { buildCustomId } from '../discord/custom-ids.js';
import { DMPhase, SubmissionStatus } from '@nexus/types';
import { prisma } from '@nexus/database';
import { postSubmissionToReview } from '@nexus/automation';
import { startApplication } from '../applications/application-service.js';
import { dashboardLink, reviewPort } from '../applications/review-handlers.js';
import {
  cancelSubmission as cancelInFlow,
  editAnswer,
  goBack as goBackInFlow,
  openDM,
  presentCurrent,
  processAnswer,
  sendIntro,
  showSummary,
  submitSubmission,
  type FlowContext,
} from '../applications/dm-flow.js';

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
  if (await dispatchComponent(client, interaction)) return;
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
    case CustomIdAction.DM_SKIP:
      return skipQuestion(client, interaction, parsed.args[0] ?? '');
    case CustomIdAction.DM_SUMMARY:
      return backToSummary(interaction, parsed.args[0] ?? '');
    case CustomIdAction.DM_SUBMIT:
      return submitFromSummary(interaction, parsed.args[0] ?? '');
    default:
      log.debug({ customId: interaction.customId }, 'Unbehandelte Interaction.');
  }
}

async function handleModal(client: Client, interaction: ModalSubmitInteraction): Promise<void> {
  // Alle Modals werden über die Registry bedient (siehe applications/review-handlers.ts).
  await dispatchModal(client, interaction);
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
    joinedAt: member.joinedAt ?? undefined,
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
    messages: (application.config as { messages?: Record<string, string> } | null)?.messages ?? {},
  };
}

// --- DM Steuerung (§21/§22/§24) ---------------------------------------------

/** Entfernt die Schaltflächen der Nachricht, damit abgeschlossene Schritte nicht erneut ausgelöst werden. */
async function disableComponents(interaction: MessageComponentInteraction): Promise<void> {
  await interaction.message.edit({ components: [] }).catch(() => undefined);
}

const reply = (i: MessageComponentInteraction, content: string) =>
  i.reply({ content, ephemeral: true }).catch(() => undefined);

async function cancelSubmission(
  interaction: MessageComponentInteraction,
  submissionId: string,
): Promise<void> {
  if (!isValidId(submissionId)) return;
  const ok = await cancelInFlow(submissionId, interaction.user.id);
  if (!ok) return void (await reply(interaction, 'ℹ️ Diese Bewerbung ist bereits beendet.'));
  await disableComponents(interaction);
  await reply(
    interaction,
    '✖️ Deine Bewerbung wurde abgebrochen. Du kannst jederzeit eine neue starten.',
  );
}

async function pauseSubmission(
  interaction: MessageComponentInteraction,
  submissionId: string,
): Promise<void> {
  if (!isValidId(submissionId)) return;
  const submission = await prisma.applicationSubmission.findFirst({
    where: { id: submissionId, userId: interaction.user.id },
  });
  if (!submission) return;
  if (
    submission.status !== SubmissionStatus.IN_PROGRESS &&
    submission.status !== SubmissionStatus.STARTED
  ) {
    return void (await reply(interaction, 'ℹ️ Diese Bewerbung kann nicht pausiert werden.'));
  }
  await prisma.applicationSubmission.update({
    where: { id: submissionId },
    data: { status: SubmissionStatus.PAUSED },
  });
  await disableComponents(interaction);
  await reply(
    interaction,
    '⏸️ Deine Bewerbung wurde pausiert und ist gespeichert. Mit „Bewerbung starten/fortsetzen“ geht es weiter – auch nach einer längeren Pause.',
  );
  const dm = interaction.channel;
  if (dm?.isDMBased()) {
    await (dm as never as { send: (o: unknown) => Promise<unknown> }).send({
      content: '⏸️ Pausiert. Klicke auf **Fortsetzen**, wenn du weitermachen möchtest.',
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(buildCustomId(CustomIdAction.DM_RESUME, submissionId))
            .setLabel('Fortsetzen')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('▶️'),
        ),
      ],
    });
  }
}

async function resumeSubmission(
  interaction: MessageComponentInteraction,
  submissionId: string,
): Promise<void> {
  if (!isValidId(submissionId)) return;
  const submission = await prisma.applicationSubmission.findFirst({
    where: { id: submissionId, userId: interaction.user.id },
  });
  if (!submission) return;
  const resumable: SubmissionStatus[] = [
    SubmissionStatus.STARTED,
    SubmissionStatus.IN_PROGRESS,
    SubmissionStatus.PAUSED,
  ];
  if (!resumable.includes(submission.status as SubmissionStatus)) {
    return void (await reply(interaction, 'ℹ️ Diese Bewerbung ist bereits beendet.'));
  }
  await prisma.applicationSubmission.update({
    where: { id: submissionId },
    data: { status: SubmissionStatus.IN_PROGRESS },
  });
  await prisma.applicationDMState.updateMany({
    where: { submissionId },
    data: { phase: DMPhase.QUESTION },
  });
  await disableComponents(interaction);
  await reply(interaction, '▶️ Deine Bewerbung wird fortgesetzt.');
  const dm = interaction.channel;
  if (dm?.isDMBased()) await presentCurrent(dm as never, submissionId);
}

async function goBack(
  interaction: MessageComponentInteraction,
  submissionId: string,
): Promise<void> {
  if (!isValidId(submissionId)) return;
  const r = await goBackInFlow(submissionId, interaction.user.id);
  if (!r.moved) {
    return void (await reply(
      interaction,
      r.reason === 'first'
        ? 'ℹ️ Du bist bereits bei der ersten Frage.'
        : 'ℹ️ Zurück ist nicht möglich.',
    ));
  }
  await disableComponents(interaction);
  await reply(interaction, '⬅️ Zurück zur vorherigen Frage.');
  const dm = interaction.channel;
  if (dm?.isDMBased()) await presentCurrent(dm as never, submissionId);
}

/** Überspringt eine optionale Frage (leere Antwort); Pflichtfragen lassen sich nicht überspringen. */
async function skipQuestion(
  client: Client,
  interaction: MessageComponentInteraction,
  submissionId: string,
): Promise<void> {
  if (!isValidId(submissionId)) return;
  const result = await processAnswer({
    client,
    submissionId,
    userId: interaction.user.id,
    rawAnswer: '',
  });
  if (result.kind === 'invalid')
    return void (await reply(interaction, `⚠️ ${result.errors.join(' ')}`));
  if (result.kind !== 'stored')
    return void (await reply(interaction, 'ℹ️ Überspringen ist gerade nicht möglich.'));
  await disableComponents(interaction);
  await reply(interaction, '⏭️ Übersprungen.');
  const dm = interaction.channel;
  if (dm?.isDMBased()) await presentCurrent(dm as never, submissionId);
}

async function backToSummary(
  interaction: MessageComponentInteraction,
  submissionId: string,
): Promise<void> {
  if (!isValidId(submissionId)) return;
  const submission = await prisma.applicationSubmission.findFirst({
    where: { id: submissionId, userId: interaction.user.id },
  });
  if (!submission) return;
  await disableComponents(interaction);
  await reply(interaction, '📋 Zusammenfassung.');
  const dm = interaction.channel;
  if (dm?.isDMBased()) await showSummary(dm as never, submissionId);
}

async function submitFromSummary(
  interaction: MessageComponentInteraction,
  submissionId: string,
): Promise<void> {
  if (!isValidId(submissionId)) return;
  const r = await submitSubmission(submissionId, interaction.user.id);
  if (!r.ok) {
    await reply(interaction, `⚠️ ${r.message}`);
    if (r.missing) {
      const dm = interaction.channel;
      if (dm?.isDMBased()) await presentCurrent(dm as never, submissionId);
    }
    return;
  }
  await disableComponents(interaction);
  await reply(
    interaction,
    `✅ **Bewerbung erfolgreich eingereicht!**\n\n${r.number ? `**Bewerbungs-ID:** \`#${r.number}\`\n` : ''}**Status:** 🟡 In Bearbeitung\n\nBitte warte auf die Entscheidung des Teams – du erhältst eine Nachricht, sobald es eine gibt.`,
  );
  // Bearbeitungsteam benachrichtigen (Review-Nachricht mit Schaltflächen)
  const posted = await postSubmissionToReview(reviewPort(), submissionId, {
    dashboardUrl: dashboardLink(submissionId),
  }).catch((error: unknown) => ({ ok: false as const, reason: String(error) }));
  if (!posted.ok)
    log.error(
      { submissionId, reason: posted.reason },
      'Bearbeitungsteam konnte nicht benachrichtigt werden.',
    );
  // Bewerber: Zurückziehen bis zur Entscheidung
  const dm = interaction.channel;
  if (dm?.isDMBased()) {
    await (dm as never as { send: (o: unknown) => Promise<unknown> })
      .send({
        content:
          '📨 Deine Bewerbung ist eingegangen. Falls du es dir anders überlegst, kannst du sie bis zur Entscheidung zurückziehen.',
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(buildCustomId(CustomIdAction.DM_WITHDRAW, submissionId))
              .setLabel('Bewerbung zurückziehen')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('↩️'),
          ),
        ],
      })
      .catch(() => undefined);
  }
}

/** Auswahl im Zusammenfassungs-Menü: gezielt eine Antwort ändern. */
registerSelect(CustomIdAction.DM_EDIT_SELECT, async (interaction, { args }) => {
  const submissionId = args[0] ?? '';
  const questionId = interaction.values[0] ?? '';
  if (!isValidId(submissionId) || !questionId) return;
  const owner = await prisma.applicationSubmission.findFirst({
    where: { id: submissionId, userId: interaction.user.id },
    select: { id: true },
  });
  if (!owner) return;
  const dm = interaction.channel;
  if (!dm?.isDMBased()) return;
  const ok = await editAnswer(dm as never, submissionId, questionId);
  await interaction
    .reply({
      content: ok ? '✏️ Frage gestellt.' : 'ℹ️ Diese Frage lässt sich nicht bearbeiten.',
      ephemeral: true,
    })
    .catch(() => undefined);
});
