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
  /** success | partial | failed */
  result?: string;
  /** Verwendete Berechtigung (Schlüssel). */
  permission?: string;
  /** Auslösende Automation. */
  automation?: string;
  /** Begründung bzw. Fehlergrund. */
  reason?: string;
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
    opts: {
      action?: string;
      resourceType?: string;
      resourceId?: string;
      actorId?: string;
      limit?: number;
      /** ID des letzten Eintrags der vorherigen Seite. */
      cursor?: string;
    } = {},
  ) {
    const { action, resourceType, resourceId, actorId, limit = 50, cursor } = opts;
    return prisma.auditLog.findMany({
      where: {
        guildId: assertGuildId(guildId),
        ...(action ? { action } : {}),
        ...(resourceType ? { resourceType } : {}),
        ...(resourceId ? { resourceId } : {}),
        ...(actorId ? { actorId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: Math.min(Math.max(limit, 1), 200),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  },
};
