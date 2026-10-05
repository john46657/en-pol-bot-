import { blockedMessage, getActive } from '@nexus/restrictions';
import { ApplicationStatus, OPEN_SUBMISSION_STATUSES, ResubmissionMode, SubmissionStatus } from '@nexus/types';
import type { Question, Requirements } from '@nexus/types';
import { prisma, getActiveCooldown } from '@nexus/database';
import { checkRequirements, checkRoleRequirements, requirementMessage, type RequirementContext } from '@nexus/core';
import { statusLabelsOf } from '@nexus/automation';
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
  /** Beitritt zum Server (für „Mindestzeit auf dem Server“). */
  joinedAt?: Date | undefined;
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
    select: { status: true, submissionNumber: true, application: { select: { config: true } } },
  });
  const status = open ? (statusLabelsOf(open.application.config)[open.status]?.label ?? OPEN_STATUS_LABEL[open.status] ?? open.status) : null;
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

  // 4) Voraussetzungen der Bewerbungsart (Team-Chance): Wartezeiten, Rollen, Kontoalter, Mitgliedsdauer, frühere
  //    Annahmen, Höchstzahlen, Personalakte, Dienststunden. Zusätzlich eine von Hand gesetzte Wartezeit (Cooldown-Tabelle).
  const requirements = readRequirements(application.config);
  const manual = await getActiveCooldown(guildId, applicationId, userId);
  if (manual) return fail(`Du kannst diese Bewerbung vorerst nicht erneut starten. Die Wartezeit endet am ${manual.expiresAt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}.`);
  const check = checkRequirements(requirements, await requirementContext(guildId, applicationId, input, requirements));
  if (!check.ok) return fail(requirementMessage(check, requirements.failMessage));

  // 5) Rollenregeln (§38/§70)
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

export type RequirementsConfig = Requirements & {
  multipleActiveSubmissions?: 'none' | 'per_application' | 'unlimited';
  resubmission?: ResubmissionMode;
};

/** Zustand des Bewerbers für die Voraussetzungen – fragt nur ab, was die Bewerbungsart tatsächlich verlangt. */
async function requirementContext(guildId: string, applicationId: string, input: StartApplicationInput, r: RequirementsConfig): Promise<RequirementContext> {
  const { userId } = input;
  const submitted = { guildId, userId, applicationId, isTest: false, submittedAt: { not: null } };
  const [lastSubmitted, lastDenied, submittedCount, openCount] = await Promise.all([
    r.cooldown ? prisma.applicationSubmission.findFirst({ where: submitted, orderBy: { submittedAt: 'desc' }, select: { submittedAt: true } }) : null,
    r.denyCooldown ? prisma.applicationSubmission.findFirst({ where: { ...submitted, status: SubmissionStatus.DENIED }, orderBy: { deniedAt: 'desc' }, select: { deniedAt: true, updatedAt: true } }) : null,
    r.maxSubmissionsPerUser ? prisma.applicationSubmission.count({ where: submitted }) : 0,
    r.maxOpenSubmissions ? prisma.applicationSubmission.count({ where: { guildId, applicationId, isTest: false, status: { in: [...OPEN_SUBMISSION_STATUSES] } } }) : 0,
  ]);
  const appIds = [...(r.requirePreviousApproval ?? []), ...(r.forbidPreviousApproval ?? [])];
  const accepted = appIds.length
    ? await prisma.applicationSubmission.findMany({ where: { guildId, userId, applicationId: { in: appIds }, status: SubmissionStatus.ACCEPTED, isTest: false }, select: { applicationId: true } })
    : [];
  const apps = appIds.length ? await prisma.application.findMany({ where: { guildId, id: { in: appIds } }, select: { id: true, name: true } }) : [];
  const needsRecord = !!(r.requiredRankIds?.length || r.requiredTeamIds?.length);
  const personnel = needsRecord ? await prisma.personnelRecord.findFirst({ where: { guildId, userId, archivedAt: null }, select: { rankId: true, teamId: true } }) : null;
  const [ranks, teams] = needsRecord
    ? await Promise.all([
        prisma.rank.findMany({ where: { guildId, id: { in: r.requiredRankIds ?? [] } }, select: { id: true, name: true } }),
        prisma.team.findMany({ where: { guildId, id: { in: r.requiredTeamIds ?? [] } }, select: { id: true, name: true } }),
      ])
    : [[], []];
  let dutyHours: number | undefined;
  if (r.minDutyHours) {
    const since = new Date(Date.now() - (r.dutyWindowDays ?? 30) * 86_400_000);
    const sum = await prisma.shift.aggregate({ where: { guildId, userId, startedAt: { gte: since }, durationSeconds: { not: null } }, _sum: { durationSeconds: true } });
    dutyHours = (sum._sum.durationSeconds ?? 0) / 3600;
  }
  return {
    now: new Date(),
    userId,
    memberRoleIds: input.memberRoleIds,
    joinedAt: input.joinedAt,
    lastSubmittedAt: lastSubmitted?.submittedAt ?? undefined,
    lastDeniedAt: lastDenied ? (lastDenied.deniedAt ?? lastDenied.updatedAt) : undefined,
    submittedCount,
    openCount,
    acceptedApplicationIds: new Set(accepted.map((a) => a.applicationId)),
    personnel,
    dutyHours,
    names: {
      // Rollen als Erwähnung: Discord zeigt in der (nur für den Bewerber sichtbaren) Antwort den Rollennamen
      roles: Object.fromEntries([...(r.requiredRoleIds ?? []), ...(r.restrictedRoleIds ?? [])].map((id) => [id, `<@&${id}>`])),
      applications: Object.fromEntries(apps.map((a) => [a.id, a.name])),
      ranks: Object.fromEntries(ranks.map((x) => [x.id, x.name])),
      teams: Object.fromEntries(teams.map((x) => [x.id, x.name])),
    },
  };
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
