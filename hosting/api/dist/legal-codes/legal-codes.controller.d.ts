import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
declare const create: z.ZodObject<{
    code: z.ZodString;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    category: z.ZodString;
    penalty: z.ZodObject<{
        fine: z.ZodOptional<z.ZodNumber>;
        jailMinutes: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        fine?: number | undefined;
        jailMinutes?: number | undefined;
    }, {
        fine?: number | undefined;
        jailMinutes?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    code: string;
    category: string;
    title: string;
    penalty: {
        fine?: number | undefined;
        jailMinutes?: number | undefined;
    };
    description?: string | undefined;
}, {
    code: string;
    category: string;
    title: string;
    penalty: {
        fine?: number | undefined;
        jailMinutes?: number | undefined;
    };
    description?: string | undefined;
}>;
/** Gesetzeskatalog liegt in der Datenbank – nie im Frontend hartcodiert. */
export declare class LegalCodesController {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    list(): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        code: string;
        category: string;
        expiresAt: Date | null;
        active: boolean;
        description: string | null;
        title: string;
        penalty: import("@prisma/client/runtime/library").JsonValue;
        effectiveDate: Date;
    }[]>;
    create(a: Actor, b: z.infer<typeof create>): Promise<{
        id: string;
        code: string;
        category: string;
        expiresAt: Date | null;
        active: boolean;
        description: string | null;
        title: string;
        penalty: import("@prisma/client/runtime/library").JsonValue;
        effectiveDate: Date;
    }>;
}
export {};
