import { z } from 'zod';
import { GalaxyService } from './galaxy.service';
import type { Actor } from '../audit/audit.service';
declare const summarize: z.ZodObject<{
    kind: z.ZodEnum<["incident", "report", "complaint", "investigation"]>;
    id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "incident" | "report" | "complaint" | "investigation";
}, {
    id: string;
    kind: "incident" | "report" | "complaint" | "investigation";
}>;
declare const draft: z.ZodObject<{
    notes: z.ZodString;
}, "strip", z.ZodTypeAny, {
    notes: string;
}, {
    notes: string;
}>;
export declare class GalaxyController {
    private readonly g;
    constructor(g: GalaxyService);
    status(): {
        enabled: boolean;
        capability: string;
    };
    summarize(a: Actor, b: z.infer<typeof summarize>): Promise<{
        aiGenerated: true;
        label: string;
        text: string;
        proposals: ({
            id: string;
            action: string;
            params: import("@prisma/client/runtime/library").JsonValue;
            rationale: string | null;
            status: string;
        } | null)[];
    }>;
    draft(a: Actor, b: z.infer<typeof draft>): Promise<{
        aiGenerated: true;
        label: string;
        text: string;
        proposals: ({
            id: string;
            action: string;
            params: import("@prisma/client/runtime/library").JsonValue;
            rationale: string | null;
            status: string;
        } | null)[];
    }>;
    shift(a: Actor): Promise<{
        aiGenerated: true;
        label: string;
        text: string;
        proposals: ({
            id: string;
            action: string;
            params: import("@prisma/client/runtime/library").JsonValue;
            rationale: string | null;
            status: string;
        } | null)[];
    }>;
    proposals(a: Actor): Promise<{
        params: import("@prisma/client/runtime/library").JsonValue;
        id: string;
        createdAt: Date;
        action: string;
        status: string;
        decidedById: string | null;
        requesterId: string;
        rationale: string | null;
        decidedAt: Date | null;
    }[]>;
    confirm(a: Actor, id: string): Promise<{
        status: string;
    }>;
    reject(a: Actor, id: string): Promise<{
        status: string;
    }>;
}
export {};
