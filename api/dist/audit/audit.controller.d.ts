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
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    module?: string | undefined;
    entityType?: string | undefined;
    entityId?: string | undefined;
    q?: string | undefined;
}, {
    module?: string | undefined;
    entityType?: string | undefined;
    entityId?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
/** Nur lesend. Es gibt bewusst keine Schreib-/Lösch-Endpunkte für Audit-Logs. */
export declare class AuditController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    list(f: z.infer<typeof q>): Promise<{
        items: {
            id: string;
            actorUserId: string | null;
            actorRobloxUserId: string | null;
            action: string;
            module: string;
            entityType: string | null;
            entityId: string | null;
            before: import("@prisma/client/runtime/library").JsonValue | null;
            after: import("@prisma/client/runtime/library").JsonValue | null;
            reason: string | null;
            requestId: string | null;
            createdAt: Date;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
}
export {};
