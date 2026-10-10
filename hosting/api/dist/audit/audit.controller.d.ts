import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
declare const q: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
} & {
    module: z.ZodOptional<z.ZodString>;
    entityType: z.ZodOptional<z.ZodString>;
    entityId: z.ZodOptional<z.ZodString>;
    action: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    module?: string | undefined;
    entityType?: string | undefined;
    entityId?: string | undefined;
    action?: string | undefined;
    q?: string | undefined;
}, {
    module?: string | undefined;
    entityType?: string | undefined;
    entityId?: string | undefined;
    action?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
/** Lesbarer Satz für Rechteänderungen („Max hat der Rolle Moderator die Berechtigung ticket.delete entzogen.“). */
export declare function auditSummary(e: {
    action: string;
    before: unknown;
    after: unknown;
}, actor: string, target?: string | null): string | null;
/** Nur lesend. Es gibt bewusst keine Schreib-/Lösch-Endpunkte für Audit-Logs. */
export declare class AuditController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    list(f: z.infer<typeof q>): Promise<{
        items: {
            actor: {
                id: string;
                name: string | null;
                discordId: string | null;
            } | null;
            target: {
                id: string;
                name: string | null;
                discordId: string | null;
            } | null;
            summary: string | null;
            id: string;
            createdAt: Date;
            reason: string | null;
            module: string;
            entityType: string | null;
            entityId: string | null;
            action: string;
            actorUserId: string | null;
            actorRobloxUserId: string | null;
            before: import("@prisma/client/runtime/library").JsonValue | null;
            after: import("@prisma/client/runtime/library").JsonValue | null;
            requestId: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
}
export {};
