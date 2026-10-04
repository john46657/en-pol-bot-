import { z } from 'zod';
import { AdminService } from './admin.service';
import type { Actor } from '../audit/audit.service';
declare const layout: z.ZodObject<{
    layout: z.ZodNullable<z.ZodArray<z.ZodUnknown, "many">>;
}, "strip", z.ZodTypeAny, {
    layout: unknown[] | null;
}, {
    layout: unknown[] | null;
}>;
declare const evQ: z.ZodObject<{
    take: z.ZodDefault<z.ZodNumber>;
    type: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    take: number;
    type?: string | undefined;
}, {
    take?: number | undefined;
    type?: string | undefined;
}>;
export declare class AdminController {
    private readonly a;
    constructor(a: AdminService);
    settings(): Promise<{
        settings: {
            [k: string]: import("@prisma/client/runtime/library").JsonValue;
        };
        allowedKeys: string[];
    }>;
    set(ac: Actor, key: string, b: {
        value: unknown;
    }): Promise<{
        key: string;
        value: import("@prisma/client/runtime/library").JsonValue;
    }>;
    events(q: z.infer<typeof evQ>): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        userId: string | null;
        createdAt: Date;
        requestId: string | null;
        type: string;
        ip: string | null;
        detail: string | null;
    }[]>;
    retention(ac: Actor): Promise<{
        sessions: number;
        loginHistory: number;
        notifications: number;
    }>;
    getLayout(ac: Actor): Promise<{
        layout: string | number | boolean | import("@prisma/client/runtime/library").JsonObject | import("@prisma/client/runtime/library").JsonArray | null;
        isDefault: boolean;
    }>;
    setLayout(ac: Actor, b: z.infer<typeof layout>): Promise<{
        layout: string | number | boolean | import("@prisma/client/runtime/library").JsonObject | import("@prisma/client/runtime/library").JsonArray | null;
        isDefault: boolean;
    }>;
}
export {};
