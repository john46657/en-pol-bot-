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
    return fail('Du hast bereits eine laufende Bewerbung.');
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
          ],
        },
      },
    });
    if (sameApp > 0) {
      return fail('Du hast diese Bewerbung bereits eingereicht oder sie läuft noch.');
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

export function readQuestions(versionQuestionsJson: unknown): Question[] {
  if (!Array.isArray(versionQuestionsJson)) return [];
  return versionQuestionsJson as Question[];
}

function fail(message: string): StartApplicationResult {
  return { ok: false, message };
}
