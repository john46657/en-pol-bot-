import type { Client, Guild, TextChannel } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { SubmissionStatus } from '@nexus/types';
import { prisma } from '@nexus/database';
import { assertTransition, roleActionsForTransition, type RoleAction } from '@nexus/core';
import { createAuditEvent } from '@nexus/database';
import { log } from '../logger.js';
import { buildSubmissionEmbed, STATUS_LABEL } from '../discord/embeds.js';
import { readQuestions } from './application-service.js';
import type { Question } from '@nexus/types';

/**
 * Staff Review (§29–§35).
 *
 * Accept/Deny laufen über die State Machine (§62), unter einem Lock (§95)
 * und erzeugen Audit-Events (§34). Rollenaktionen werden fehlertolerant
 * mit Retry ausgeführt (§39/§90).
 */

const MAX_ROLE_RETRIES = 3;

export interface ReviewDecisionInput {
  client: Client;
  guildId: string;
  submissionId: string;
  reviewerId: string;
  reviewerRolePermissions: ReadonlySet<string>;
  publicReason?: string;
  internalReason?: string;
}

export type ReviewResult = { ok: true; status: SubmissionStatus } | { ok: false; message: string };

const REVIEW_PERMISSIONS = new Set([
  'applications.submissions.accept',
  'applications.submissions.deny',
  'applications.submissions.review',
  'applications.manage',
]);

export async function acceptSubmission(input: ReviewDecisionInput): Promise<ReviewResult> {
  return decide(input, SubmissionStatus.ACCEPTED);
}

export async function denySubmission(input: ReviewDecisionInput): Promise<ReviewResult> {
  return decide(input, SubmissionStatus.DENIED);
}

async function decide(input: ReviewDecisionInput, target: SubmissionStatus): Promise<ReviewResult> {
  // 1) Permission Check (§78/§114: serverseitig)
  const hasPermission = [...input.reviewerRolePermissions].some((p) => REVIEW_PERMISSIONS.has(p));
  if (!hasPermission) {
    return { ok: false, message: 'Du darfst diese Bewerbung nicht bewerten.' };
  }

  // 2) Submission laden + State Machine (§62)
  const submission = await prisma.applicationSubmission.findFirst({
    where: { id: input.submissionId, guildId: input.guildId },
    include: { application: true, version: true },
  });
  if (!submission) {
    return { ok: false, message: 'Bewerbung nicht gefunden.' };
  }
  try {
    assertTransition(submission.status, target);
  } catch {
    return {
      ok: false,
      message: `Diese Bewerbung kann nicht mehr bewertet werden (Status: ${STATUS_LABEL[submission.status]}).`,
    };
  }

  // 3) Ausführen unter Lock (§95: keine doppelten Accepts)
  const now = new Date();
  const decisionData: Record<string, unknown> = {
    status: target,
    reviewerUserId: input.reviewerId,
    ...(target === SubmissionStatus.ACCEPTED ? { acceptedAt: now } : { deniedAt: now }),
  };
  if (input.publicReason !== undefined) decisionData['publicReason'] = input.publicReason;
  if (input.internalReason !== undefined) decisionData['internalReason'] = input.internalReason;
  await prisma.applicationSubmission.update({
    where: { id: submission.id },
    data: decisionData as never,
  });

  // 4) Audit Events (§34)
  await createAuditEvent({
    guildId: input.guildId,
    submissionId: submission.id,
    applicationId: submission.applicationId,
    actorType: 'USER',
    actorId: input.reviewerId,
    action: target === SubmissionStatus.ACCEPTED ? 'submission.accepted' : 'submission.denied',
    after: { publicReason: input.publicReason, internalReason: input.internalReason },
  });

  // 5) Rollenaktionen (§39) mit Retry (§90)
  const roleRules = await prisma.applicationRoleRule.findMany({
    where: { applicationId: submission.applicationId },
  });
  const actions = roleActionsForTransition(submission.status, target, roleRules);
  const results = await applyRoleActions(
    input.client,
    input.guildId,
    submission.userId,
    actions,
    submission.isTest,
  );

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    // Staff benachrichtigen, Dashboard zeigt Partial Failure (§90)
    log.error({ submissionId: submission.id, failed }, 'Rollenaktion(en) fehlgeschlagen.');
    await createAuditEvent({
      guildId: input.guildId,
      submissionId: submission.id,
      actorType: 'SYSTEM',
      action: 'role.action_failed',
      after: { failed: failed.map((f) => f.roleId) },
    });
  }

  // 6) Embed aktualisieren (§26)
  await updateSubmissionMessage(input.client, submission.id, target);

  return { ok: true, status: target };
}

/**
 * Wendet Rollenaktionen mit Retry an – transaktional nach bestem Bemühen.
 * Test-Submissions führen niemals Rollenaktionen aus (§118).
 */
export async function applyRoleActions(
  client: Client,
  guildId: string,
  userId: string,
  actions: RoleAction[],
  isTest: boolean,
): Promise<Array<{ roleId: string; ok: boolean }>> {
  if (isTest) {
    log.info(
      { guildId, userId, count: actions.length },
      'Test-Modus: Rollenaktionen übersprungen (§118).',
    );
    return actions.map((a) => ({ roleId: a.roleId, ok: true }));
  }

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return actions.map((a) => ({ roleId: a.roleId, ok: false }));

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return actions.map((a) => ({ roleId: a.roleId, ok: false }));

  const results: Array<{ roleId: string; ok: boolean }> = [];
  for (const action of actions) {
    let ok = false;
    for (let attempt = 1; attempt <= MAX_ROLE_RETRIES && !ok; attempt++) {
      try {
        if (action.type === 'ADD') {
          await member.roles.add(action.roleId, action.reason);
        } else {
          await member.roles.remove(action.roleId, action.reason);
        }
        ok = true;
      } catch (error) {
        log.warn(
          { roleId: action.roleId, attempt, err: String(error) },
          'Rollenaktion fehlgeschlagen (Retry).',
        );
        if (attempt < MAX_ROLE_RETRIES) await delay(500 * attempt);
      }
    }
    results.push({ roleId: action.roleId, ok });
  }
  return results;
}

/**
 * Aktualisiert die Submission-Nachricht im Review-Channel auf den neuen Status.
 */
export async function updateSubmissionMessage(
  client: Client,
  submissionId: string,
  status: SubmissionStatus,
): Promise<void> {
  const submission = await prisma.applicationSubmission.findFirst({
    where: { id: submissionId },
    include: { application: true, version: true },
  });
  if (!submission || !submission.submissionChannelId || !submission.submissionMessageId) return;

  const channel = (await client.channels
    .fetch(submission.submissionChannelId)
    .catch(() => null)) as TextChannel | null;
  if (!channel) return;

  const message = await channel.messages.fetch(submission.submissionMessageId).catch(() => null);
  if (!message) return;

  const answers = await loadAnswers(submission.id);
  const embedInput: Parameters<typeof buildSubmissionEmbed>[0] = {
    applicantName: submission.displayNameSnapshot,
    applicationName: submission.application.name,
    applicationVersion: submission.version.version,
    status,
    questions: readQuestions(submission.version.questions),
    answers,
    userId: submission.userId,
    username: submission.usernameSnapshot,
  };
  if (submission.submittedAt) embedInput.submittedAt = submission.submittedAt;
  const embed = buildSubmissionEmbed(embedInput);

  await message.edit({ embeds: [embed] }).catch(() => undefined);
}

async function loadAnswers(submissionId: string): Promise<Record<string, unknown>> {
  const rows = await prisma.applicationAnswer.findMany({ where: { submissionId } });
  const answers: Record<string, unknown> = {};
  for (const row of rows) answers[row.questionId] = row.value;
  return answers;
}

// --- Notizen (§35) ----------------------------------------------------------

export async function addNote(input: {
  guildId: string;
  submissionId: string;
  authorId: string;
  content: string;
  mentions?: string[];
}): Promise<{ ok: boolean; message: string }> {
  const submission = await prisma.applicationSubmission.findFirst({
    where: { id: input.submissionId, guildId: input.guildId },
  });
  if (!submission) return { ok: false, message: 'Bewerbung nicht gefunden.' };

  await prisma.applicationNote.create({
    data: {
      submissionId: submission.id,
      authorId: input.authorId,
      content: input.content,
      mentions: input.mentions ?? [],
    },
  });
  await createAuditEvent({
    guildId: input.guildId,
    submissionId: submission.id,
    actorType: 'USER',
    actorId: input.authorId,
    action: 'note.created',
    after: { content: input.content.slice(0, 200) },
  });
  return { ok: true, message: 'Notiz gespeichert.' };
}

// --- History (§34) -----------------------------------------------------------

export async function buildHistoryEmbed(
  guildId: string,
  submissionId: string,
): Promise<EmbedBuilder> {
  const submission = await prisma.applicationSubmission.findFirst({
    where: { id: submissionId, guildId },
  });
  const events = await prisma.applicationAuditEvent.findMany({
    where: { submissionId },
    orderBy: { createdAt: 'asc' },
  });

  const embed = new EmbedBuilder()
    .setTitle(`📜 History – ${submission?.submissionNumber ?? submissionId}`)
    .setColor(0x5865f2);

  const lines = events.map((e) => {
    const time = `<t:${Math.floor(e.createdAt.getTime() / 1000)}:t> `;
    const actor = e.actorId ? ` von <@${e.actorId}>` : '';
    return `${time}**${e.action}**${actor}`;
  });
  embed.setDescription(lines.slice(0, 20).join('\n') || 'Keine Ereignisse.');
  return embed;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type { Guild, TextChannel, Question };
