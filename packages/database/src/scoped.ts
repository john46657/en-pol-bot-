import { prisma } from './client.js';

/**
 * Guild-Isolation (§113): ABSOLUT KRITISCH.
 *
 * Guild A darf niemals Daten von Guild B sehen. Daher existieren hier keine
 * Zugriffsfunktionen ohne guildId. Der Compiler + Runtime-Guard erzwingen den
 * Guild Context auf jeder Query-Ebene.
 */
export class GuildContextError extends Error {
  constructor(message = 'Guild Context fehlt – Abfrage abgelehnt.') {
    super(message);
    this.name = 'GuildContextError';
  }
}

export function assertGuildId(guildId: string | undefined | null): string {
  if (!guildId || typeof guildId !== 'string' || guildId.trim().length === 0) {
    throw new GuildContextError();
  }
  return guildId;
}

// --- Submissions -----------------------------------------------------------

export async function getSubmissionById(guildId: string, submissionId: string) {
  return prisma.applicationSubmission.findFirst({
    where: { id: submissionId, guildId: assertGuildId(guildId) },
    include: {
      application: true,
      version: true,
      answers: true,
      notes: { orderBy: { createdAt: 'desc' } },
      attachments: true,
      reviewers: { orderBy: { assignedAt: 'desc' } },
      dmState: true,
    },
  });
}

export async function listSubmissions(
  guildId: string,
  options: {
    applicationId?: string;
    status?: string;
    reviewerId?: string;
    userId?: string;
    cursor?: string;
    limit?: number;
  } = {},
) {
  const { applicationId, status, reviewerId, userId, cursor, limit = 25 } = options;
  return prisma.applicationSubmission.findMany({
    where: {
      guildId: assertGuildId(guildId),
      ...(applicationId ? { applicationId } : {}),
      ...(status ? { status: { equals: status as never } } : {}),
      ...(reviewerId ? { reviewerUserId: reviewerId } : {}),
      ...(userId ? { userId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: { application: true },
  });
}

export async function countSubmissionsByStatus(guildId: string, applicationId?: string) {
  return prisma.applicationSubmission.groupBy({
    by: ['status'],
    where: { guildId: assertGuildId(guildId), ...(applicationId ? { applicationId } : {}) },
    _count: true,
  });
}

// --- Applications -----------------------------------------------------------

export async function getApplicationById(guildId: string, applicationId: string) {
  return prisma.application.findFirst({
    where: { id: applicationId, guildId: assertGuildId(guildId) },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
  });
}

export async function getApplicationBySlug(guildId: string, slug: string) {
  return prisma.application.findFirst({
    where: { slug, guildId: assertGuildId(guildId) },
  });
}

// --- Aktive Bewerbungen (§52) ------------------------------------------------

export async function countActiveSubmissions(
  guildId: string,
  userId: string,
  applicationId?: string,
): Promise<number> {
  return prisma.applicationSubmission.count({
    where: {
      guildId: assertGuildId(guildId),
      userId,
      status: { in: ['STARTED', 'IN_PROGRESS', 'PAUSED', 'SUBMITTED', 'UNDER_REVIEW', 'ON_HOLD'] },
      ...(applicationId ? { applicationId } : {}),
    },
  });
}

// --- Audit Events (§34) ------------------------------------------------------

export async function createAuditEvent(input: {
  guildId: string;
  submissionId?: string;
  applicationId?: string;
  actorType: 'USER' | 'SYSTEM' | 'BOT' | 'AUTOMATION';
  actorId?: string;
  action: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}) {
  assertGuildId(input.guildId);
  return prisma.applicationAuditEvent.create({
    data: {
      guildId: input.guildId,
      submissionId: input.submissionId ?? null,
      applicationId: input.applicationId ?? null,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      before: (input.before as never) ?? null,
      after: (input.after as never) ?? null,
      metadata: (input.metadata as never) ?? null,
    },
  });
}

// --- Cooldowns (§51) ----------------------------------------------------------

export async function getActiveCooldown(guildId: string, applicationId: string, userId: string) {
  return prisma.applicationCooldown.findFirst({
    where: {
      guildId: assertGuildId(guildId),
      applicationId,
      userId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { expiresAt: 'desc' },
  });
}
