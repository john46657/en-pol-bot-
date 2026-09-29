import type { Client, Message } from 'discord.js';
import { prisma } from '@nexus/database';
import { SubmissionStatus } from '@nexus/types';
import {
  openDM,
  processAnswer,
  sendQuestion,
  showSummary,
  type FlowContext,
} from '../applications/dm-flow.js';
import { log } from '../logger.js';
import { readQuestions } from '../applications/application-service.js';
import { computeVisibleQuestions } from '@nexus/core';
import { config } from '../config.js';
import { parseCustomId } from '../discord/custom-ids.js';

/**
 * Eingehende DM-Nachrichten → Antwort-Verarbeitung (§18).
 *
 * Antworten niemals verlieren: ungültige Antworten werden mit Fehlermeldung
 * quittiert, die Frage erneut gestellt – aber nicht gespeichert (§18).
 * Doppelte/parallele Nachrichten werden über den Lock serialisiert (§19).
 */
export async function handleDMMessage(client: Client, message: Message): Promise<void> {
  if (!message.channel.isDMBased() || message.author.bot) return;
  if (!client.user || message.author.id === client.user.id) return;

  const state = await prisma.applicationDMState.findFirst({
    where: { userId: message.author.id },
    orderBy: { lastInteractionAt: 'desc' },
    include: { submission: { include: { version: true, application: true } } },
  });

  if (!state || !state.submission) return;

  const submission = state.submission;
  const activeStatuses: SubmissionStatus[] = [
    SubmissionStatus.STARTED,
    SubmissionStatus.IN_PROGRESS,
    SubmissionStatus.PAUSED,
  ];
  if (!activeStatuses.includes(submission.status)) {
    await message
      .reply('ℹ️ Diese Bewerbung ist bereits beendet. Weitere Antworten werden nicht mehr erfasst.')
      .catch(() => undefined);
    return;
  }

  // Pause: Antworten werden ignoriert, Hinweis erfolgt (§21)
  if (submission.status === SubmissionStatus.PAUSED) {
    await message
      .reply('⏸️ Deine Bewerbung ist pausiert. Setze sie über den Fortsetzen-Button fort.')
      .catch(() => undefined);
    return;
  }

  const result = await processAnswer({
    client,
    submissionId: submission.id,
    userId: message.author.id,
    rawAnswer: message.content,
  });

  if (result.kind === 'invalid') {
    await message.reply(`⚠️ ${result.errors.join('\n⚠️ ')}`).catch(() => undefined);
    return;
  }
  if (result.kind === 'not_found' || result.kind === 'locked') {
    await message
      .reply('⚠️ Bitte warte einen Moment, deine Antwort wird verarbeitet.')
      .catch(() => undefined);
    return;
  }
  if (result.kind === 'finished') {
    await message.reply('✅ Diese Bewerbung ist bereits abgeschlossen.').catch(() => undefined);
    return;
  }

  // Nächste Frage oder Zusammenfassung (§15 Schritte 15–18, §23)
  const questions = readQuestions(submission.version?.questions);
  if (result.isLast || !result.nextQuestionId) {
    await showSummary(message.channel as never, submission.id);
    return;
  }

  const nextQuestion = questions.find((q) => q.id === result.nextQuestionId);
  if (!nextQuestion) {
    await showSummary(message.channel as never, submission.id);
    return;
  }
  const visible = computeVisibleQuestions(questions, {});
  const number = Math.max(1, visible.findIndex((q) => q.id === nextQuestion.id) + 1);

  const flowContext: FlowContext = {
    applicationId: submission.applicationId,
    applicationName: submission.application?.name ?? 'Bewerbung',
    versionQuestions: questions,
    messages: readMessagesSafe(submission.application?.config),
  };

  await sendQuestion(
    message.channel as never,
    flowContext,
    submission.id,
    nextQuestion,
    number,
    visible.length || questions.length,
    state.expiresAt ?? undefined,
  );
}

function readMessagesSafe(configJson: unknown): Record<string, string> {
  if (configJson && typeof configJson === 'object') {
    return (configJson as { messages?: Record<string, string> }).messages ?? {};
  }
  return {};
}

export { openDM, config, parseCustomId };
