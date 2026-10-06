import { z } from 'zod';
import { ApplicationsService } from './applications.service';
import type { Actor } from '../audit/audit.service';
declare const submit: z.ZodObject<{
    robloxUsername: z.ZodString;
    robloxUserId: z.ZodOptional<z.ZodString>;
    answers: z.ZodRecord<z.ZodString, z.ZodString>;
}, "strip", z.ZodTypeAny, {
    robloxUsername: string;
    answers: Record<string, string>;
    robloxUserId?: string | undefined;
}, {
    robloxUsername: string;
    answers: Record<string, string>;
    robloxUserId?: string | undefined;
}>;
declare const move: z.ZodObject<{
    status: z.ZodEffects<z.ZodEnum<["SUBMITTED", "SCREENING", "INTERVIEW", "PENDING_DECISION", "ACCEPTED", "REJECTED", "WITHDRAWN"]>, "SUBMITTED" | "SCREENING" | "INTERVIEW" | "PENDING_DECISION" | "WITHDRAWN", "SUBMITTED" | "REJECTED" | "SCREENING" | "INTERVIEW" | "PENDING_DECISION" | "ACCEPTED" | "WITHDRAWN">;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "SUBMITTED" | "SCREENING" | "INTERVIEW" | "PENDING_DECISION" | "WITHDRAWN";
    reason?: string | undefined;
}, {
    status: "SUBMITTED" | "REJECTED" | "SCREENING" | "INTERVIEW" | "PENDING_DECISION" | "ACCEPTED" | "WITHDRAWN";
    reason?: string | undefined;
}>;
declare const listQ: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
} & {
    status: z.ZodOptional<z.ZodEnum<["SUBMITTED", "SCREENING", "INTERVIEW", "PENDING_DECISION", "ACCEPTED", "REJECTED", "WITHDRAWN"]>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    status?: "SUBMITTED" | "REJECTED" | "SCREENING" | "INTERVIEW" | "PENDING_DECISION" | "ACCEPTED" | "WITHDRAWN" | undefined;
    q?: string | undefined;
}, {
    status?: "SUBMITTED" | "REJECTED" | "SCREENING" | "INTERVIEW" | "PENDING_DECISION" | "ACCEPTED" | "WITHDRAWN" | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
export declare class ApplicationsController {
    private readonly a;
    constructor(a: ApplicationsService);
    form(): Promise<import("./applications.service").FormField[]>;
    submit(b: z.infer<typeof submit>): Promise<{
        number: string;
        status: string;
    }>;
    list(q: z.infer<typeof listQ>): Promise<{
        items: {
            number: string;
            id: string;
            createdAt: Date;
            discordId: string | null;
            robloxUserId: string | null;
            robloxUsername: string;
            updatedAt: Date;
            version: number;
            status: string;
            source: string;
            answers: import("@prisma/client/runtime/library").JsonValue;
            decidedById: string | null;
            discordName: string | null;
            durationSec: number | null;
            joinedAt: Date | null;
            decisionReason: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    history(q: {
        discordId: string;
    }): import("@prisma/client").Prisma.PrismaPromise<{
        number: string;
        id: string;
        createdAt: Date;
        status: string;
        decisionReason: string | null;
    }[]>;
    get(id: string): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        discordId: string | null;
        robloxUserId: string | null;
        robloxUsername: string;
        updatedAt: Date;
        version: number;
        status: string;
        source: string;
        answers: import("@prisma/client/runtime/library").JsonValue;
        decidedById: string | null;
        discordName: string | null;
        durationSec: number | null;
        joinedAt: Date | null;
        decisionReason: string | null;
    }>;
    /** Prüfschritte benötigen applications.review; Entscheidungen applications.decide. */
    move(a: Actor, id: string, b: z.infer<typeof move>): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        discordId: string | null;
        robloxUserId: string | null;
        robloxUsername: string;
        updatedAt: Date;
        version: number;
        status: string;
        source: string;
        answers: import("@prisma/client/runtime/library").JsonValue;
        decidedById: string | null;
        discordName: string | null;
        durationSec: number | null;
        joinedAt: Date | null;
        decisionReason: string | null;
    }>;
    decide(a: Actor, id: string, b: {
        accept: boolean;
        reason: string;
    }): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        discordId: string | null;
        robloxUserId: string | null;
        robloxUsername: string;
        updatedAt: Date;
        version: number;
        status: string;
        source: string;
        answers: import("@prisma/client/runtime/library").JsonValue;
        decidedById: string | null;
        discordName: string | null;
        durationSec: number | null;
        joinedAt: Date | null;
        decisionReason: string | null;
    }>;
    /** Annehmen/Ablehnen per Discord-Button (aus jedem offenen Status); optionaler Grund geht per DM an die Person. */
    discordDecide(a: Actor, id: string, b: {
        status: 'ACCEPTED' | 'REJECTED';
        reason?: string;
    }): Promise<{
        id: string;
        number: string;
        status: "REJECTED" | "ACCEPTED";
        decidedByName: string | null;
        reason: string | null;
    }>;
}
export {};
