import type { Client, DMChannel, TextChannel } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { SubmissionStatus } from '@nexus/types';
import type { AnswerMap, Question } from '@nexus/types';
import { prisma } from '@nexus/database';
import {
  areRequiredQuestionsAnswered,
  computeVisibleQuestions,
  findNextVisibleQuestionIndex,
  renderTemplate,
  validateAnswer,
  type VariableContext,
} from '@nexus/core';
import { log } from '../logger.js';
import { buildCustomId, CustomIdAction } from '../discord/custom-ids.js';
import { readQuestions } from './application-service.js';
import { withSubmissionLock } from '../utils/lock.js';

/**
 * DM Application Engine (§15–§19).
 *
 * Der Bewerber beantwortet die Bewerbung Schritt für Schritt per DM.
 * Antworten werden nie verloren (§18), Race Conditions durch einen Lock
 * ausgeschlossen (§19) und nach Bot-Restart fortgesetzt (§94).
 */

export interface FlowContext {
  applicationId: string;
  applicationName: string;
  versionQuestions: Question[];
  messages: Record<string, string>;
}

// ---------------------------------------------------------------------------
// DM-Sicherheit (§60)
// ---------------------------------------------------------------------------

/**
 * Öffnet den DM-Channel. Wenn DMs deaktiviert sind, wird der Bewerber im
 * Server darüber informiert – die Submission bleibt konsistent.
 */
export async function openDM(
  client: Client,
  userId: string,
  fallbackGuildChannel?: TextChannel,
): Promise<DMChannel | null> {
  try {
    return await client.users.createDM(userId);
  } catch (error) {
    log.warn({ userId, err: String(error) }, 'DM konnte nicht geöffnet werden (§60).');
    if (fallbackGuildChannel) {
      await fallbackGuildChannel
        .send({
          content: `<@${userId}> Ich konnte dir keine DM senden. Bitte aktiviere Direktnachrichten und versuche es erneut.`,
        })
        .catch(() => undefined);
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Intro (§16)
// ---------------------------------------------------------------------------

export async function sendIntro(
  channel: DMChannel,
  ctx: FlowContext,
  submissionId: string,
): Promise<void> {
  const intro =
    ctx.messages['intro'] ??
    '👋 Willkommen bei deiner Bewerbung.\n\nDu wirst nun Schritt für Schritt durch die Bewerbung geführt. Du kannst die Bewerbung jederzeit abbrechen. Antworte einfach auf jede Frage mit deiner Antwort.\n\nBereit?';

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(CustomIdAction.DM_RESUME, submissionId))
      .setLabel('Bewerbung starten')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('▶️'),
    new ButtonBuilder()
      .setCustomId(buildCustomId(CustomIdAction.DM_CANCEL, submissionId))
      .setLabel('Abbrechen')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('✖️'),
  );

  await channel.send({ content: intro, components: [row] });
}

// ---------------------------------------------------------------------------
// Frage senden (§17)
// ---------------------------------------------------------------------------

export async function sendQuestion(
  channel: DMChannel,
  ctx: FlowContext,
  submissionId: string,
  question: Question,
  questionNumber: number,
  totalQuestions: number,
  expiresAt?: Date,
): Promise<void> {
  const template =
    ctx.messages['question'] ?? '{title}\n\n{description}\n\nAntworte direkt auf diese Nachricht.';

  const body = renderTemplate(template, {
    applicationName: ctx.applicationName,
    title: question.title,
    description: question.description ?? '',
  });

  const lines = [
    '━━━━━━━━━━━━━━━━━━',
    `${ctx.applicationName}`,
    '━━━━━━━━━━━━━━━━━━',
    '',
    `Frage ${questionNumber} von ${totalQuestions}`,
    '',
    body,
  ];
  if (expiresAt) {
    lines.push(
      '',
      '━━━━━━━━━━━━━━━━━━',
      `⏱️ Zeit verbleibend: <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
      '━━━━━━━━━━━━━━━━━━',
    );
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(CustomIdAction.DM_BACK, submissionId))
      .setLabel('Zurück')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildCustomId(CustomIdAction.DM_CANCEL, submissionId))
      .setLabel('Abbrechen')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(buildCustomId(CustomIdAction.DM_PAUSE, submissionId))
      .setLabel('Pausieren')
      .setStyle(ButtonStyle.Secondary),
  );

  await channel.send({ content: lines.join('\n'), components: [row] });
}

// ---------------------------------------------------------------------------
// Antwort verarbeiten (§18)
// ---------------------------------------------------------------------------

export interface ProcessAnswerInput {
  client: Client;
  submissionId: string;
  userId: string;
  rawAnswer: string;
}

export type ProcessAnswerResult =
  | { kind: 'stored'; nextQuestionId?: string; isLast: boolean }
  | { kind: 'invalid'; errors: string[] }
  | { kind: 'not_found' }
  | { kind: 'locked' }
  | { kind: 'finished' };

export async function processAnswer(input: ProcessAnswerInput): Promise<ProcessAnswerResult> {
  // 1) Aktive Submission + Zustand laden (§18 Schritt 1)
  const submission = await prisma.applicationSubmission.findFirst({
    where: { id: input.submissionId, userId: input.userId },
    include: { dmState: true, version: true },
  });
  if (!submission || !submission.dmState) return { kind: 'not_found' };

  if (
    submission.status === SubmissionStatus.CANCELLED ||
    submission.status === SubmissionStatus.EXPIRED
  ) {
    return { kind: 'finished' };
  }

  const ctx = await loadFlowContext(submission);
  if (!ctx) return { kind: 'not_found' };

  // 2) Lock: keine parallele/ doppelte Verarbeitung (§19)
  try {
    return await withSubmissionLock(submission.id, async () => {
      const currentQuestionId = submission.dmState?.currentQuestionId;
      if (!currentQuestionId) return { kind: 'not_found' };

      const questions = ctx.versionQuestions;
      const question = questions.find((q) => q.id === currentQuestionId);
      if (!question) return { kind: 'not_found' };

      // 3) Validierung (§18 Schritt 3)
      const result = validateAnswer(question, input.rawAnswer);
      if (!result.ok) {
        return { kind: 'invalid', errors: result.errors };
      }

      // 4) Antwort speichern (§18 Schritt 4) – upsert, niemals überschreiben los
      const answers = await loadAnswers(submission.id);
      if (result.value !== null) {
        answers[question.id] = result.value;
      } else {
        delete answers[question.id];
      }
      await persistAnswers(submission.id, answers, question.id, submission.versionId);

      // 5) Status: erste Antwort → IN_PROGRESS
      if (submission.status === SubmissionStatus.STARTED) {
        await prisma.applicationSubmission.update({
          where: { id: submission.id },
          data: { status: SubmissionStatus.IN_PROGRESS },
        });
      }

      // 6) Nächste sichtbare Frage (§18 Schritte 6–8, Branching §14)
      const visible = computeVisibleQuestions(questions, answers);
      const nextIndex = findNextVisibleQuestionIndex(questions, answers, question.id);
      const nextQuestion = nextIndex === -1 ? undefined : visible[nextIndex];

      await prisma.applicationDMState.update({
        where: { submissionId: submission.id },
        data: {
          currentQuestionId: nextQuestion?.id ?? null,
          lastInteractionAt: new Date(),
        },
      });

      if (!nextQuestion) {
        const check = areRequiredQuestionsAnswered(questions, answers);
        if (!check.complete) {
          // Nachfragen, bis alles Pflichtige beantwortet ist
          const firstMissing = visible.find((q) => q.id === check.missingQuestionIds[0]);
          if (firstMissing) {
            await prisma.applicationDMState.update({
              where: { submissionId: submission.id },
              data: { currentQuestionId: firstMissing.id },
            });
            return { kind: 'stored', nextQuestionId: firstMissing.id, isLast: false };
          }
        }
        return { kind: 'stored', isLast: true };
      }
      return { kind: 'stored', nextQuestionId: nextQuestion.id, isLast: false };
    });
  } catch {
    return { kind: 'locked' };
  }
}

// ---------------------------------------------------------------------------
// Zusammenfassung (§23) + Antworten bearbeiten (§24)
// ---------------------------------------------------------------------------

export async function showSummary(channel: DMChannel, submissionId: string): Promise<void> {
  const submission = await prisma.applicationSubmission.findFirst({
    where: { id: submissionId },
    include: { version: true },
  });
  if (!submission) return;

  const ctx = await loadFlowContext(submission);
  if (!ctx) return;

  const answers = await loadAnswers(submission.id);
  const visible = computeVisibleQuestions(ctx.versionQuestions, answers);

  const lines = ['━━━━━━━━━━━━━━━━━━', '📋 DEINE BEWERBUNG', '━━━━━━━━━━━━━━━━━━', ''];
  visible.forEach((q, i) => {
    lines.push(`${i + 1}. ${q.title}`);
    lines.push(formatAnswer(answers[q.id]));
    lines.push('');
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(CustomIdAction.DM_SUBMIT, submissionId))
      .setLabel('Bewerbung absenden')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(buildCustomId(CustomIdAction.DM_EDIT_ANSWER, submissionId, visible[0]?.id ?? ''))
      .setLabel('Antworten bearbeiten')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('✏️'),
    new ButtonBuilder()
      .setCustomId(buildCustomId(CustomIdAction.DM_CANCEL, submissionId))
      .setLabel('Abbrechen')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌'),
  );

  await channel.send({ content: lines.join('\n').slice(0, 1900), components: [row] });
}

export async function editAnswer(
  channel: DMChannel,
  submissionId: string,
  questionId: string,
): Promise<void> {
  const submission = await prisma.applicationSubmission.findFirst({
    where: { id: submissionId },
    include: { version: true },
  });
  if (!submission) return;
  const ctx = await loadFlowContext(submission);
  if (!ctx) return;

  await prisma.applicationDMState.update({
    where: { submissionId },
    data: { currentQuestionId: questionId, lastInteractionAt: new Date() },
  });

  await channel.send({
    content: `✏️ Du bearbeitest: **${ctx.versionQuestions.find((q) => q.id === questionId)?.title}**\n\nBitte antworte jetzt neu auf diese Frage.`,
  });
}

// ---------------------------------------------------------------------------
// Persistenz-Helfer (§64)
// ---------------------------------------------------------------------------

async function loadAnswers(submissionId: string): Promise<AnswerMap> {
  const rows = await prisma.applicationAnswer.findMany({ where: { submissionId } });
  const answers: AnswerMap = {};
  for (const row of rows) {
    answers[row.questionId] = row.value as never;
  }
  return answers;
}

async function persistAnswers(
  submissionId: string,
  answers: AnswerMap,
  changedQuestionId: string,
  versionId: string,
): Promise<void> {
  const value = answers[changedQuestionId];
  await prisma.applicationAnswer.upsert({
    where: { submissionId_questionId: { submissionId, questionId: changedQuestionId } },
    update: {
      value: (value ?? null) as never,
      normalizedValue: normalizeForSearch(value),
      updatedAt: new Date(),
    },
    create: {
      submissionId,
      questionId: changedQuestionId,
      questionVersionId: versionId,
      value: (value ?? null) as never,
      normalizedValue: normalizeForSearch(value),
    },
  });
}

function normalizeForSearch(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(String).join(' ').toLowerCase();
  return String(value).toLowerCase();
}

function formatAnswer(value: unknown): string {
  if (value === null || value === undefined || value === '') return '–';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nein';
  return String(value);
}

// ---------------------------------------------------------------------------
// Flow-Kontext
// ---------------------------------------------------------------------------

async function loadFlowContext(submission: {
  applicationId: string;
  version?: { questions: unknown } | null;
}): Promise<FlowContext | null> {
  const application = await prisma.application.findFirst({
    where: { id: submission.applicationId },
  });
  if (!application) return null;
  return {
    applicationId: application.id,
    applicationName: application.name,
    versionQuestions: readQuestions(submission.version?.questions),
    messages: readMessages(application.config),
  };
}

function readMessages(configJson: unknown): Record<string, string> {
  if (configJson && typeof configJson === 'object') {
    const messages = (configJson as { messages?: Record<string, string> }).messages;
    return messages ?? {};
  }
  return {};
}

export function buildVariableContext(submission: {
  id: string;
  userId: string;
  usernameSnapshot: string;
  displayNameSnapshot: string;
  startedAt: Date;
  submittedAt: Date | null;
  status: string;
}): VariableContext {
  const context: VariableContext = {
    submissionId: submission.id,
    userId: submission.userId,
    username: submission.usernameSnapshot,
    displayName: submission.displayNameSnapshot,
    startedAt: submission.startedAt.toISOString(),
    status: submission.status,
  };
  if (submission.submittedAt) {
    context.submittedAt = submission.submittedAt.toISOString();
  }
  return context;
}
