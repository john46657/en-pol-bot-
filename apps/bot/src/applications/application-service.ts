import { blockedMessage, getActive } from '@nexus/restrictions';
import { ApplicationStatus, ResubmissionMode, SubmissionStatus } from '@nexus/types';
import type { Question } from '@nexus/types';
import { prisma, getActiveCooldown } from '@nexus/database';
import { checkCooldown, checkRoleRequirements } from '@nexus/core';
import { config } from '../config.js';
import { log } from '../logger.js';

/**
 * Start-Gate einer Bewerbung (§15 Schritte 2–8).
 *
 * Jeder Check erzeugt eine verständliche Meldung. Die Reihenfolge ist
 * bewusst: Berechtigung → Status → Cooldown → Rollen → offene Bewerbung.
 */
export interface StartApplicationInput {
  guildId: string;
  applicationId: string;
  userId: string;
  memberRoleIds: string[];
  username: string;
  displayName: string;
  avatarUrl?: string;
  /** Test-Bewerbung (§118: keine echten Rollenaktionen). */
  isTest?: boolean;
}

export interface StartApplicationResult {
  ok: boolean;
  submissionId?: string;
  message: string;
}

const OPEN_STATUS_LABEL: Record<string, string> = {
  STARTED: 'GESTARTET',
  IN_PROGRESS: 'WIRD AUSGEFÜLLT',
  PAUSED: 'PAUSIERT',
  SUBMITTED: 'EINGEREICHT',
  UNDER_REVIEW: 'IN REVIEW',
  ON_HOLD: 'ZURÜCKGESTELLT',
};
/** „Du hast bereits eine offene Bewerbung.“ mit dem aktuellen Status (und der ID, falls schon eingereicht). */
async function openMessage(guildId: string, userId: string, applicationId?: string): Promise<string> {
  const open = await prisma.applicationSubmission.findFirst({
    where: { guildId, userId, ...(applicationId ? { applicationId } : {}), isTest: false, status: { in: [SubmissionStatus.STARTED, SubmissionStatus.IN_PROGRESS, SubmissionStatus.PAUSED, SubmissionStatus.SUBMITTED, SubmissionStatus.UNDER_REVIEW, SubmissionStatus.ON_HOLD] } },
    orderBy: { createdAt: 'desc' },
    select: { status: true, submissionNumber: true },
  });
  const status = open ? (OPEN_STATUS_LABEL[open.status] ?? open.status) : null;
  return `⚠️ Du hast bereits eine offene Bewerbung.${status ? `\n\n**Status:** ${status}` : ''}${open?.submissionNumber ? `\n**ID:** #${open.submissionNumber}` : ''}`;
}

export async function startApplication(
  input: StartApplicationInput,
): Promise<StartApplicationResult> {
  const { guildId, applicationId, userId } = input;

  // 1) Application laden (guild-scoped!)
  const application = await prisma.application.findFirst({
    where: { id: applicationId, guildId },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 }, roleRules: true },
  });
  if (!application) return fail('Diese Bewerbung existiert nicht auf diesem Server.');

  // 2) Application Status
  if (!application.enabled || application.status !== ApplicationStatus.PUBLISHED) {
    return fail('Diese Bewerbung ist aktuell nicht verfügbar.');
  }

  // 3) Fragen der aktuellen Version (Snapshot, §65)
  const currentVersion = application.versions[0];
  if (!currentVersion) return fail('Diese Bewerbung hat keine veröffentlichte Version.');

  // 3b) Bewerbungssperre (Sperren-System)
  const ban = await getActive(guildId, userId, 'APPLICATION');
  if (ban) return fail(blockedMessage(ban));

  // 4) Cooldown (§51)
  const cooldownRow = await getActiveCooldown(guildId, applicationId, userId);
  const requirements = readRequirements(application.config);
  const cooldownState = checkCooldown(requirements.cooldown, cooldownRow?.createdAt.toISOString());
  if (cooldownState.active) {
    const ende = new Date(cooldownState.endsAt).toLocaleString('de-DE');
    return fail(
      `Du kannst diese Bewerbung vorerst nicht erneut starten (Cooldown). Sie endet am ${ende}.`,
    );
  }

  // 5) Required / Restricted Rollen (§38/§70)
  const roleCheck = checkRoleRequirements(input.memberRoleIds, application.roleRules);
  if (!roleCheck.ok) return fail(roleCheck.messages[0] ?? 'Du erfüllst die Voraussetzungen nicht.');

  // 6) Laufende Bewerbungen (§52)
  const activeCount = await prisma.applicationSubmission.count({
    where: {
      guildId,
      userId,
      status: {
        in: [SubmissionStatus.STARTED, SubmissionStatus.IN_PROGRESS, SubmissionStatus.PAUSED],
      },
    },
  });
  const mode = requirements.multipleActiveSubmissions ?? 'per_application';
  if (mode === 'none' && activeCount > 0) {
    return fail(await openMessage(guildId, userId));
  }
  if (activeCount >= config.limits.maxActiveSubmissionsPerUser) {
    return fail('Du hast das Maximum an gleichzeitigen Bewerbungen erreicht.');
  }
  if (mode === 'per_application') {
    const sameApp = await prisma.applicationSubmission.count({
      where: {
        guildId,
        userId,
        applicationId,
        status: {
          in: [
            SubmissionStatus.STARTED,
            SubmissionStatus.IN_PROGRESS,
            SubmissionStatus.PAUSED,
            SubmissionStatus.SUBMITTED,
            SubmissionStatus.UNDER_REVIEW,
            SubmissionStatus.ON_HOLD,
          ],
        },
      },
    });
    if (sameApp > 0) {
      return fail(await openMessage(guildId, userId, applicationId));
    }
    // Resubmission-Regel (§53)
    const lastDecision = await prisma.applicationSubmission.findFirst({
      where: { guildId, userId, applicationId, status: SubmissionStatus.DENIED },
      orderBy: { deniedAt: 'desc' },
    });
    if (lastDecision && requirements.resubmission === ResubmissionMode.NEVER) {
      return fail('Eine erneute Bewerbung ist nach einer Ablehnung nicht möglich.');
    }
  }

  // 7) Submission + DM-Status anlegen (§15 Schritt 8)
  const submission = await prisma.applicationSubmission.create({
    data: {
      guildId,
      applicationId,
      versionId: currentVersion.id,
      userId,
      usernameSnapshot: input.username,
      displayNameSnapshot: input.displayName,
      avatarSnapshot: input.avatarUrl ?? null,
      status: SubmissionStatus.STARTED,
      isTest: input.isTest ?? false,
    },
  });
  await prisma.applicationDMState.create({
    data: { submissionId: submission.id, userId, guildId },
  });

  log.info({ submissionId: submission.id, applicationId, userId }, 'Bewerbung gestartet.');
  return { ok: true, submissionId: submission.id, message: 'Bewerbung gestartet.' };
}

export interface RequirementsConfig {
  cooldown?: { days?: number; hours?: number; minutes?: number };
  timeLimit?: { days?: number; hours?: number; minutes?: number };
  multipleActiveSubmissions?: 'none' | 'per_application' | 'unlimited';
  resubmission?: ResubmissionMode;
}

export interface ApplicationConfigShape {
  requirements?: RequirementsConfig;
  messages?: Record<string, string>;
}

function readRequirements(configJson: unknown): RequirementsConfig {
  if (configJson && typeof configJson === 'object') {
    const cfg = configJson as ApplicationConfigShape;
    return cfg.requirements ?? {};
  }
  return {};
}

/**
 * Fragen einer Version. Der Veröffentlichungs-Snapshot enthält die komplette Konfiguration (`{ questions: [...] }`);
 * ältere Daten können direkt eine Liste sein. Immer nach `order` sortiert.
 */
export function readQuestions(versionQuestionsJson: unknown): Question[] {
  const raw = Array.isArray(versionQuestionsJson)
    ? versionQuestionsJson
    : versionQuestionsJson && typeof versionQuestionsJson === 'object'
      ? (versionQuestionsJson as { questions?: unknown }).questions
      : undefined;
  return Array.isArray(raw) ? ([...raw] as Question[]).sort((a, b) => a.order - b.order) : [];
}

function fail(message: string): StartApplicationResult {
  return { ok: false, message };
}
