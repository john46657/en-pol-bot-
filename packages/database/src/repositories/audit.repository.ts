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

  /**
   * Kurzform für die Fachmodule: `actorId = null` → Automation (dann `automation` angeben), sonst Benutzer.
   * Hält die Felder einheitlich (wer · was · wann · Server · Datensatz · vorher/nachher · Berechtigung · Ergebnis).
   */
  async log(e: {
    guildId: string;
    actorId: string | null;
    action: string;
    resource?: readonly [type: string, id: string];
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
    permission?: string;
    automation?: string;
    reason?: string | null;
    result?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.auditLog.create({
      data: {
        guildId: assertGuildId(e.guildId),
        actorType: e.actorId ? 'USER' : 'AUTOMATION',
        actorId: e.actorId,
        action: e.action,
        ...(e.resource ? { resourceType: e.resource[0], resourceId: e.resource[1] } : {}),
        ...(e.before !== undefined ? { before: e.before } : {}),
        ...(e.after !== undefined ? { after: e.after } : {}),
        ...(e.metadata !== undefined ? { metadata: e.metadata } : {}),
        ...(e.permission ? { permission: e.permission } : {}),
        ...(e.automation ? { automation: e.automation } : {}),
        ...(e.reason ? { reason: e.reason } : {}),
        result: e.result ?? 'success',
      },
    });
  },

  /**
   * Spiegelt ein Fach-Ereignis (z. B. Schichtstart, Einsatz-Status, Ticket-Übernahme) ins zentrale Audit-Log.
   * Enthält `data` die Schlüssel `before` und `after`, werden sie als Vorher/Nachher übernommen.
   */
  async mirrorEvent(e: { guildId: string; area: string; resourceType: string; resourceId: string; type: string; actorId: string | null; data?: unknown; automation?: string }) {
    const d = e.data && typeof e.data === 'object' ? (e.data as Record<string, unknown>) : undefined;
    const pair = d && 'before' in d && 'after' in d;
    return auditRepository.log({
      guildId: e.guildId,
      actorId: e.actorId,
      action: `${e.area}.${e.type}`,
      resource: [e.resourceType, e.resourceId],
      ...(pair ? { before: (d.before ?? {}) as Prisma.InputJsonValue, after: (d.after ?? {}) as Prisma.InputJsonValue } : { after: (e.data !== undefined ? e.data : { event: e.type }) as Prisma.InputJsonValue }),
      ...(typeof d?.['reason'] === 'string' ? { reason: d['reason'] as string } : {}),
      ...(e.actorId === null ? { automation: e.automation ?? `${e.area}-system` } : {}),
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
