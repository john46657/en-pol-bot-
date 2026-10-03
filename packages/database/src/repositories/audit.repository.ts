import type { AuditActorType, Prisma } from '@prisma/client';
import { prisma } from '../client.js';
import { assertGuildId } from '../scoped.js';

export interface AuditInput {
  guildId: string;
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}

/** Audit-Logs werden nur angehängt – es gibt bewusst weder update noch delete. */
export const auditRepository = {
  async create(input: AuditInput) {
    return prisma.auditLog.create({
      data: { ...input, guildId: assertGuildId(input.guildId) },
    });
  },

  async list(
    guildId: string,
    opts: { action?: string; resourceType?: string; resourceId?: string; limit?: number } = {},
  ) {
    const { action, resourceType, resourceId, limit = 50 } = opts;
    return prisma.auditLog.findMany({
      where: {
        guildId: assertGuildId(guildId),
        ...(action ? { action } : {}),
        ...(resourceType ? { resourceType } : {}),
        ...(resourceId ? { resourceId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
  },
};
