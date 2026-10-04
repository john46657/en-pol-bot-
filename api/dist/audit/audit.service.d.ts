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
/** Entfernt Geheimnisse rekursiv, bevor Daten ins Audit-Log gelangen. */
export declare function redact(value: unknown): Prisma.InputJsonValue | undefined;
export declare class AuditService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    /** Schreibt innerhalb der übergebenen Transaktion (oder eigenständig, wenn keine übergeben wird). */
    record(actor: Actor, entry: AuditEntry, tx?: Tx): Promise<void>;
}
