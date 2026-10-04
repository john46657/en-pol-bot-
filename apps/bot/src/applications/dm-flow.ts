import type { Client, DMChannel, TextChannel } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { DMPhase, SubmissionStatus } from '@nexus/types';
import type { AnswerMap, Question } from '@nexus/types';
import { Prisma, assignSubmissionNumber, prisma } from '@nexus/database';
import {
  areRequiredQuestionsAnswered,
  computeVisibleQuestions,
  findNextVisibleQuestionIndex,
  pruneInvisibleAnswers,
  validateAnswer,
  type VariableContext,
} from '@nexus/core';
import { log } from '../logger.js';
import { buildCustomId, CustomIdAction } from '../discord/custom-ids.js';
import { readQuestions } from './application-service.js';
import {
  formatAnswer,
  formatInfoMessage,
  formatQuestionMessage,
  formatSummary,
  isDisplayOnly,
} from './dm-format.js';
import { withSubmissionLock } from '../utils/lock.js';

/**
 * DM Application Engine (§15–§19).
 *
 * Der Bewerber beantwortet die Bewerbung Schritt für Schritt per DM. Antworten werden nie verloren (§18),
 * Race Conditions durch einen Lock ausgeschlossen (§19) und nach Bot-Restart fortgesetzt (§94).
 *
 * Zustände (`ApplicationDMState.phase`): INTRO → QUESTION → SUMMARY ⇄ EDITING → CONFIRMED | CANCELLED.
 * Übersprungene optionale Fragen werden als „leere Antwort“ (JSON null) gespeichert und nicht erneut gefragt.
 */

export interface FlowContext {
  applicationId: string;
  applicationName: string;
  versionQuestions: Question[];
  messages: Record<string, string>;
}

type Channel = Pick<DMChannel, 'send'>;
const ACTIVE: SubmissionStatus[] = [
  SubmissionStatus.STARTED,
  SubmissionStatus.IN_PROGRESS,
  SubmissionStatus.PAUSED,
];

// ---------------------------------------------------------------------------
// DM-Sicherheit (§60)
// ---------------------------------------------------------------------------

/** Öffnet den DM-Channel. Sind DMs deaktiviert, wird der Bewerber im Server informiert. */
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
// Laden
// ---------------------------------------------------------------------------

async function loadAnswers(submissionId: string): Promise<AnswerMap> {
  const rows = await prisma.applicationAnswer.findMany({ where: { submissionId } });
  const answers: AnswerMap = {};
  for (const row of rows) answers[row.questionId] = row.value as never;
  return answers;
}

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
    return (configJson as { messages?: Record<string, string> }).messages ?? {};
  }
  return {};
}

const unanswered = (q: Question, answers: AnswerMap) =>
  !isDisplayOnly(q) && answers[q.id] === undefined;
const asked = (visible: Question[]) => visible.filter((q) => !isDisplayOnly(q));

// ---------------------------------------------------------------------------
// Intro (§16)
// ---------------------------------------------------------------------------

export async function sendIntro(
  channel: Channel,
  ctx: FlowContext,
  submissionId: string,
): Promise<void> {
  const intro =
    ctx.messages['intro'] ??
    '👋 Willkommen bei deiner Bewerbung.\n\nDu wirst nun Schritt für Schritt durch die Bewerbung geführt. Antworte einfach per Nachricht auf jede Frage. Du kannst die Bewerbung jederzeit pausieren, abbrechen oder zur vorherigen Frage zurückgehen. Am Ende prüfst du alles und sendest die Bewerbung ab.\n\nBereit?';
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
  channel: Channel,
  ctx: FlowContext,
  submissionId: string,
  question: Question,
  questionNumber: number,
  totalQuestions: number,
  expiresAt?: Date,
  mode: 'normal' | 'edit' = 'normal',
  note?: string,
): Promise<void> {
  const content = formatQuestionMessage({
    applicationName: ctx.applicationName,
    question,
    number: questionNumber,
    total: totalQuestions,
    messages: ctx.messages,
    expiresAt,
    note,
  });
  const id = (a: (typeof CustomIdAction)[keyof typeof CustomIdAction]) =>
    buildCustomId(a, submissionId);
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (mode === 'edit') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(id(CustomIdAction.DM_SUMMARY))
        .setLabel('Zurück zur Zusammenfassung')
        .setStyle(ButtonStyle.Secondary),
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(id(CustomIdAction.DM_BACK))
        .setLabel('Zurück')
        .setStyle(ButtonStyle.Secondary),
    );
    if (!question.required) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(id(CustomIdAction.DM_SKIP))
          .setLabel('Überspringen')
          .setStyle(ButtonStyle.Primary),
      );
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(id(CustomIdAction.DM_PAUSE))
        .setLabel('Pausieren')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(id(CustomIdAction.DM_CANCEL))
        .setLabel('Abbrechen')
        .setStyle(ButtonStyle.Danger),
    );
  }
  await channel.send({ content, components: [row] });
}

/**
 * Stellt die aktuelle Frage (Start, Fortsetzen, Zurück, nach einer Antwort). Anzeige-Elemente werden gezeigt und
 * übergangen. Ist nichts mehr offen, folgt die Zusammenfassung.
 */
export async function presentCurrent(channel: Channel, submissionId: string): Promise<void> {
  for (let guard = 0; guard < 200; guard++) {
    const submission = await prisma.applicationSubmission.findFirst({
      where: { id: submissionId },
      include: { version: true, dmState: true },
    });
    if (!submission?.dmState) return;
    const ctx = await loadFlowContext(submission);
    if (!ctx) return;
    const answers = await loadAnswers(submissionId);
    const visible = computeVisibleQuestions(ctx.versionQuestions, answers);
    if (asked(visible).length === 0) {
      await channel.send({ content: '⚠️ Diese Bewerbung enthält keine Fragen.' });
      return;
    }
    // Beim allerersten Aufruf (noch nichts gestellt) beginnt der Flow bei der ersten sichtbaren Frage – auch wenn
    // das ein Anzeige-Element ist; danach zählt die erste offene Frage.
    const fresh = !submission.dmState.currentQuestionId && Object.keys(answers).length === 0;
    const current =
      visible.find((q) => q.id === submission.dmState?.currentQuestionId) ??
      (fresh ? visible[0] : visible.find((q) => unanswered(q, answers)));
    if (!current) return void (await showSummary(channel, submissionId));

    if (isDisplayOnly(current)) {
      await channel.send({ content: formatInfoMessage(current) });
      const next = visible[findNextVisibleQuestionIndex(ctx.versionQuestions, answers, current.id)];
      await prisma.applicationDMState.update({
        where: { submissionId },
        data: { currentQuestionId: next?.id ?? null, lastInteractionAt: new Date() },
      });
      continue;
    }

    const editing = submission.dmState.phase === DMPhase.EDITING;
    await prisma.applicationDMState.update({
      where: { submissionId },
      data: {
        currentQuestionId: current.id,
        phase: editing ? DMPhase.EDITING : DMPhase.QUESTION,
        lastInteractionAt: new Date(),
      },
    });
    const list = asked(visible);
    await sendQuestion(
      channel,
      ctx,
      submissionId,
      current,
      list.findIndex((q) => q.id === current.id) + 1,
      list.length,
      submission.dmState.expiresAt ?? undefined,
      editing ? 'edit' : 'normal',
      editing
        ? `✏️ Du bearbeitest deine Antwort. Aktuell: ${formatAnswer(answers[current.id] as never, current)}`
        : undefined,
    );
    return;
  }
}

/** Rückwärtskompatibel: sendet die aktuelle Frage. */
export const sendCurrentQuestion = presentCurrent;

// ---------------------------------------------------------------------------
// Antwort verarbeiten (§18)
// ---------------------------------------------------------------------------

export interface ProcessAnswerInput {
  client: Client;
  submissionId: string;
  userId: string;
  /** Leerer Text = „überspringen“ (nur bei optionalen Fragen gültig). */
  rawAnswer: string;
}

export type ProcessAnswerResult =
  | { kind: 'stored'; nextQuestionId?: string; isLast: boolean }
  | { kind: 'invalid'; errors: string[] }
  | { kind: 'no_question' }
  | { kind: 'not_found' }
  | { kind: 'locked' }
  | { kind: 'finished' };

export async function processAnswer(input: ProcessAnswerInput): Promise<ProcessAnswerResult> {
  const submission = await prisma.applicationSubmission.findFirst({
    where: { id: input.submissionId, userId: input.userId },
    include: { dmState: true, version: true },
  });
  if (!submission || !submission.dmState) return { kind: 'not_found' };
  if (!ACTIVE.includes(submission.status as SubmissionStatus)) return { kind: 'finished' };
  const ctx = await loadFlowContext(submission);
  if (!ctx) return { kind: 'not_found' };

  try {
    return await withSubmissionLock(submission.id, async () => {
      // Zustand unter dem Lock frisch lesen (parallele Nachrichten)
      const state = await prisma.applicationDMState.findUnique({
        where: { submissionId: submission.id },
      });
      const currentQuestionId = state?.currentQuestionId;
      if (!state || !currentQuestionId) return { kind: 'no_question' } as const;
      const questions = ctx.versionQuestions;
      const question = questions.find((q) => q.id === currentQuestionId);
      if (!question || isDisplayOnly(question)) return { kind: 'no_question' } as const;

      const result = validateAnswer(question, input.rawAnswer);
      if (!result.ok) return { kind: 'invalid', errors: result.errors } as const;

      // Antwort speichern; leer (optional übersprungen) = JSON null
      const answers = await loadAnswers(submission.id);
      answers[question.id] = result.value;
      await prisma.applicationAnswer.upsert({
        where: {
          submissionId_questionId: { submissionId: submission.id, questionId: question.id },
        },
        update: { value: toJson(result.value), normalizedValue: normalize(result.value) },
        create: {
          submissionId: submission.id,
          questionId: question.id,
          questionVersionId: submission.versionId,
          value: toJson(result.value),
          normalizedValue: normalize(result.value),
        },
      });
      if (submission.status === SubmissionStatus.STARTED) {
        await prisma.applicationSubmission.update({
          where: { id: submission.id },
          data: { status: SubmissionStatus.IN_PROGRESS },
        });
      }

      // Antworten auf nicht mehr sichtbare Fragen verwerfen (Bedingungen können sich geändert haben)
      const pruned = pruneInvisibleAnswers(questions, answers);
      if (pruned.prunedQuestionIds.length > 0) {
        await prisma.applicationAnswer.deleteMany({
          where: { submissionId: submission.id, questionId: { in: pruned.prunedQuestionIds } },
        });
      }
      const live = pruned.answers;
      const visible = computeVisibleQuestions(questions, live);

      // Nächste Frage: beim Bearbeiten die erste offene, sonst die nächste sichtbare; zuletzt fehlende Pflichtfragen
      const editing = state.phase === DMPhase.EDITING;
      let next: Question | undefined = editing
        ? visible.find((q) => unanswered(q, live))
        : visible[findNextVisibleQuestionIndex(questions, live, question.id)];
      if (!next) {
        const missing = areRequiredQuestionsAnswered(questions, live).missingQuestionIds[0];
        next = visible.find((q) => q.id === missing);
      }
      await prisma.applicationDMState.update({
        where: { submissionId: submission.id },
        data: {
          currentQuestionId: next?.id ?? null,
          phase: next ? (editing ? DMPhase.EDITING : DMPhase.QUESTION) : DMPhase.SUMMARY,
          lastInteractionAt: new Date(),
        },
      });
      return next
        ? ({ kind: 'stored', nextQuestionId: next.id, isLast: false } as const)
        : ({ kind: 'stored', isLast: true } as const);
    });
  } catch (error) {
    log.warn(
      { submissionId: submission.id, err: String(error) },
      'Antwort-Verarbeitung abgelehnt/fehlgeschlagen.',
    );
    return { kind: 'locked' };
  }
}

// ---------------------------------------------------------------------------
// Zurück (§22)
// ---------------------------------------------------------------------------

/** Setzt auf die vorherige gestellte Frage zurück (nicht auf die „zuletzt gespeicherte“). */
export async function goBack(
  submissionId: string,
  userId: string,
): Promise<{ moved: boolean; reason?: 'first' | 'not_found' | 'inactive' }> {
  const submission = await prisma.applicationSubmission.findFirst({
    where: { id: submissionId, userId },
    include: { version: true, dmState: true },
  });
  if (!submission?.dmState) return { moved: false, reason: 'not_found' };
  if (!ACTIVE.includes(submission.status as SubmissionStatus))
    return { moved: false, reason: 'inactive' };
  const ctx = await loadFlowContext(submission);
  if (!ctx) return { moved: false, reason: 'not_found' };
  const answers = await loadAnswers(submissionId);
  const list = asked(computeVisibleQuestions(ctx.versionQuestions, answers));
  const currentId = submission.dmState.currentQuestionId;
  const at = currentId ? list.findIndex((q) => q.id === currentId) : list.length; // null = Zusammenfassung
  const previous = list[(at === -1 ? list.length : at) - 1];
  if (!previous) return { moved: false, reason: 'first' };
  await prisma.applicationDMState.update({
    where: { submissionId },
    data: {
      currentQuestionId: previous.id,
      phase: DMPhase.QUESTION,
      lastInteractionAt: new Date(),
    },
  });
  return { moved: true };
}

// ---------------------------------------------------------------------------
// Zusammenfassung (§23) + Bearbeiten (§24)
// ---------------------------------------------------------------------------

export async function showSummary(channel: Channel, submissionId: string): Promise<void> {
  const submission = await prisma.applicationSubmission.findFirst({
    where: { id: submissionId },
    include: { version: true },
  });
  if (!submission) return;
  const ctx = await loadFlowContext(submission);
  if (!ctx) return;
  await prisma.applicationDMState.updateMany({
    where: { submissionId },
    data: { phase: DMPhase.SUMMARY, currentQuestionId: null, lastInteractionAt: new Date() },
  });

  const answers = await loadAnswers(submission.id);
  const visible = computeVisibleQuestions(ctx.versionQuestions, answers);
  const chunks = formatSummary(visible, answers as never);

  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildCustomId(CustomIdAction.DM_SUBMIT, submissionId))
        .setLabel('Bewerbung absenden')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(buildCustomId(CustomIdAction.DM_CANCEL, submissionId))
        .setLabel('Abbrechen')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌'),
    ),
  ];
  const list = asked(visible);
  for (let i = 0; i < list.length && rows.length < 5; i += 25) {
    const part = list.slice(i, i + 25);
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(buildCustomId(CustomIdAction.DM_EDIT_SELECT, submissionId, String(i / 25)))
          .setPlaceholder(
            list.length > 25
              ? `Antwort ändern (Fragen ${i + 1}–${i + part.length})`
              : 'Antwort ändern …',
          )
          .addOptions(
            part.map((q, j) => ({ label: `${i + j + 1}. ${q.title}`.slice(0, 100), value: q.id })),
          ),
      ),
    );
  }
  for (let i = 0; i < chunks.length; i++) {
    await channel.send({
      content: chunks[i]!,
      ...(i === chunks.length - 1 ? { components: rows } : {}),
    });
  }
}

export async function editAnswer(
  channel: Channel,
  submissionId: string,
  questionId: string,
): Promise<boolean> {
  const submission = await prisma.applicationSubmission.findFirst({
    where: { id: submissionId },
    include: { version: true },
  });
  if (!submission || !ACTIVE.includes(submission.status as SubmissionStatus)) return false;
  const ctx = await loadFlowContext(submission);
  if (!ctx) return false;
  const answers = await loadAnswers(submissionId);
  const question = computeVisibleQuestions(ctx.versionQuestions, answers).find(
    (q) => q.id === questionId,
  );
  if (!question || isDisplayOnly(question)) return false;
  await prisma.applicationDMState.update({
    where: { submissionId },
    data: { currentQuestionId: questionId, phase: DMPhase.EDITING, lastInteractionAt: new Date() },
  });
  await presentCurrent(channel, submissionId);
  return true;
}

// ---------------------------------------------------------------------------
// Absenden (§25) und Abbrechen (§21)
// ---------------------------------------------------------------------------

export type SubmitResult =
  { ok: true; submittedAt: Date; number: string | null } | { ok: false; message: string; missing?: string[] };

export async function submitSubmission(
  submissionId: string,
  userId: string,
): Promise<SubmitResult> {
  try {
    return await withSubmissionLock(submissionId, async (): Promise<SubmitResult> => {
      const submission = await prisma.applicationSubmission.findFirst({
        where: { id: submissionId, userId },
        include: { version: true },
      });
      if (!submission) return { ok: false, message: 'Bewerbung nicht gefunden.' };
      if (!ACTIVE.includes(submission.status as SubmissionStatus)) {
        return { ok: false, message: 'Diese Bewerbung kann nicht (mehr) abgeschickt werden.' };
      }
      const ctx = await loadFlowContext(submission);
      if (!ctx) return { ok: false, message: 'Bewerbung konnte nicht geladen werden.' };

      const answers = await loadAnswers(submissionId);
      const pruned = pruneInvisibleAnswers(ctx.versionQuestions, answers);
      if (pruned.prunedQuestionIds.length > 0) {
        await prisma.applicationAnswer.deleteMany({
          where: { submissionId, questionId: { in: pruned.prunedQuestionIds } },
        });
      }
      const check = areRequiredQuestionsAnswered(ctx.versionQuestions, pruned.answers);
      if (!check.complete) {
        const titles = check.missingQuestionIds.map(
          (id) => ctx.versionQuestions.find((q) => q.id === id)?.title ?? id,
        );
        await prisma.applicationDMState.updateMany({
          where: { submissionId },
          data: { currentQuestionId: check.missingQuestionIds[0] ?? null, phase: DMPhase.QUESTION },
        });
        return {
          ok: false,
          message: `Es fehlen noch Pflichtantworten: ${titles.join(', ')}.`,
          missing: titles,
        };
      }

      const now = new Date();
      await prisma.applicationSubmission.update({
        where: { id: submissionId },
        data: {
          status: SubmissionStatus.SUBMITTED,
          submittedAt: now,
          durationSeconds: Math.max(
            0,
            Math.floor((now.getTime() - submission.startedAt.getTime()) / 1000),
          ),
        },
      });
      const number = await assignSubmissionNumber(submissionId);
      await prisma.applicationDMState.updateMany({
        where: { submissionId },
        data: { phase: DMPhase.CONFIRMED, currentQuestionId: null },
      });
      await prisma.applicationAuditEvent.create({
        data: {
          guildId: submission.guildId,
          applicationId: submission.applicationId,
          submissionId,
          actorType: 'USER',
          actorId: userId,
          action: 'submission.submitted',
          after: { answers: Object.keys(pruned.answers).length, versionId: submission.versionId },
        },
      });
      return { ok: true, submittedAt: now, number };
    });
  } catch {
    return {
      ok: false,
      message: 'Bitte einen Moment warten – deine Bewerbung wird gerade verarbeitet.',
    };
  }
}

export async function cancelSubmission(submissionId: string, userId: string): Promise<boolean> {
  const submission = await prisma.applicationSubmission.findFirst({
    where: { id: submissionId, userId },
  });
  if (!submission || !ACTIVE.includes(submission.status as SubmissionStatus)) return false;
  await prisma.applicationSubmission.update({
    where: { id: submissionId },
    data: { status: SubmissionStatus.CANCELLED },
  });
  await prisma.applicationDMState.updateMany({
    where: { submissionId },
    data: { phase: DMPhase.CANCELLED, currentQuestionId: null },
  });
  await prisma.applicationAuditEvent.create({
    data: {
      guildId: submission.guildId,
      applicationId: submission.applicationId,
      submissionId,
      actorType: 'USER',
      actorId: userId,
      action: 'submission.cancelled',
    },
  });
  return true;
}

// ---------------------------------------------------------------------------
// Helfer
// ---------------------------------------------------------------------------

const toJson = (v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  v === null || v === undefined ? Prisma.JsonNull : (v as Prisma.InputJsonValue);

function normalize(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(String).join(' ').toLowerCase();
  return String(value).toLowerCase();
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
  if (submission.submittedAt) context.submittedAt = submission.submittedAt.toISOString();
  return context;
}
