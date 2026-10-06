import { z } from 'zod';
import { ApplicationsService } from './applications.service';
import type { Actor } from '../audit/audit.service';
declare const submit: z.ZodObject<{
    robloxUsername: z.ZodString;
    robloxUserId: z.ZodOptional<z.ZodString>;
    answers: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
}, "strip", z.ZodTypeAny, {
    robloxUsername: string;
    answers: Record<string, string | string[]>;
    robloxUserId?: string | undefined;
}, {
    robloxUsername: string;
    answers: Record<string, string | string[]>;
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
/** `OPEN` = alle noch nicht entschiedenen (eingereicht, Prüfung, Gespräch, Entscheidung offen). */
declare const listQ: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
} & {
    status: z.ZodOptional<z.ZodUnion<[z.ZodEnum<["SUBMITTED", "SCREENING", "INTERVIEW", "PENDING_DECISION", "ACCEPTED", "REJECTED", "WITHDRAWN"]>, z.ZodLiteral<"OPEN">]>>;
    guildId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    guildId?: string | undefined;
    status?: "SUBMITTED" | "REJECTED" | "SCREENING" | "OPEN" | "INTERVIEW" | "PENDING_DECISION" | "ACCEPTED" | "WITHDRAWN" | undefined;
    q?: string | undefined;
}, {
    guildId?: string | undefined;
    status?: "SUBMITTED" | "REJECTED" | "SCREENING" | "OPEN" | "INTERVIEW" | "PENDING_DECISION" | "ACCEPTED" | "WITHDRAWN" | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
declare const guildQ: z.ZodObject<{
    guildId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    guildId?: string | undefined;
}, {
    guildId?: string | undefined;
}>;
export declare class ApplicationsController {
    private readonly a;
    constructor(a: ApplicationsService);
    /** `?guildId=` – Formular eines Servers (für den Bot); ohne: das gemeinsame (Web-Seite /apply). */
    form(q: z.infer<typeof guildQ>): Promise<import("@enrp/shared").FormField[]>;
    submit(b: z.infer<typeof submit>): Promise<{
        number: string;
        status: string;
    }>;
    list(q: z.infer<typeof listQ>): Promise<{
        items: {
            decidedByName: string | null;
            number: string;
            id: string;
            createdAt: Date;
            discordId: string | null;
            robloxUserId: string | null;
            robloxUsername: string;
            updatedAt: Date;
            version: number;
            guildId: string | null;
            status: string;
            decidedById: string | null;
            decisionReason: string | null;
            source: string;
            answers: import("@prisma/client/runtime/library").JsonValue;
            grantRoleIds: string[];
            discordName: string | null;
            durationSec: number | null;
            joinedAt: Date | null;
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
        guildId: string | null;
        status: string;
        decidedById: string | null;
        decisionReason: string | null;
        source: string;
        answers: import("@prisma/client/runtime/library").JsonValue;
        grantRoleIds: string[];
        discordName: string | null;
        durationSec: number | null;
        joinedAt: Date | null;
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
        guildId: string | null;
        status: string;
        decidedById: string | null;
        decisionReason: string | null;
        source: string;
        answers: import("@prisma/client/runtime/library").JsonValue;
        grantRoleIds: string[];
        discordName: string | null;
        durationSec: number | null;
        joinedAt: Date | null;
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
        guildId: string | null;
        status: string;
        decidedById: string | null;
        decisionReason: string | null;
        source: string;
        answers: import("@prisma/client/runtime/library").JsonValue;
        grantRoleIds: string[];
        discordName: string | null;
        durationSec: number | null;
        joinedAt: Date | null;
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
