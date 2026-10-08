import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';

export interface Actor {
  userId: string | null;
  robloxUserId?: string | null;
  requestId?: string;
}

export interface AuditEntry {
  action: string;
  module: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

const SENSITIVE = /password|secret|token|apikey|api_key|hash/i;
/** Entfernt Geheimnisse rekursiv, bevor Daten ins Audit-Log gelangen. */
export function redact(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value, (k, v) => (k && SENSITIVE.test(k) ? '[REDACTED]' : v))) as Prisma.InputJsonValue;
}

/** Weitere Verarbeitung je Audit-Eintrag (Logging → Discord), gesetzt vom LoggingService. Fehler stören nie den Fachprozess. */
type AuditSink = (db: Tx | PrismaService, actor: Actor, entry: AuditEntry) => Promise<void>;
let sink: AuditSink | null = null;
export const setAuditSink = (s: AuditSink | null) => { sink = s; };

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Schreibt innerhalb der übergebenen Transaktion (oder eigenständig, wenn keine übergeben wird). */
  async record(actor: Actor, entry: AuditEntry, tx?: Tx) {
    const db = tx ?? this.prisma;
    await db.auditLog.create({
      data: {
        actorUserId: actor.userId,
        actorRobloxUserId: actor.robloxUserId ?? null,
        requestId: actor.requestId,
        action: entry.action,
        module: entry.module,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: redact(entry.before),
        after: redact(entry.after),
        reason: entry.reason,
      },
    });
    if (sink) await sink(db, actor, { ...entry, before: redact(entry.before), after: redact(entry.after) }).catch((e) => console.error(`logging failed for ${entry.action}: ${e instanceof Error ? e.message : e}`));
  }
}
