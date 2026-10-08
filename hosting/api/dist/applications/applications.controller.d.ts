import { z } from 'zod';
import { ApplicationsService } from './applications.service';
import { ApplicationsAnalyticsService } from './applications-analytics.service';
import type { Actor } from '../audit/audit.service';
import { RobloxService } from '../persons/roblox.service';
declare const submit: z.ZodObject<{
    robloxUsername: z.ZodString;
    robloxUserId: z.ZodOptional<z.ZodString>;
    answers: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
}, "strip", z.ZodTypeAny, {
    answers: Record<string, string | string[]>;
    robloxUsername: string;
    robloxUserId?: string | undefined;
}, {
    answers: Record<string, string | string[]>;
    robloxUsername: string;
    robloxUserId?: string | undefined;
}>;
declare const move: z.ZodObject<{
    status: z.ZodEffects<z.ZodEnum<["SUBMITTED", "SCREENING", "INTERVIEW", "PENDING_DECISION", "ACCEPTED", "REJECTED", "WITHDRAWN"]>, "WITHDRAWN" | "SUBMITTED" | "SCREENING" | "INTERVIEW" | "PENDING_DECISION", "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "SUBMITTED" | "SCREENING" | "INTERVIEW" | "PENDING_DECISION">;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "WITHDRAWN" | "SUBMITTED" | "SCREENING" | "INTERVIEW" | "PENDING_DECISION";
    reason?: string | undefined;
}, {
    status: "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "SUBMITTED" | "SCREENING" | "INTERVIEW" | "PENDING_DECISION";
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
    status?: "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "OPEN" | "SUBMITTED" | "SCREENING" | "INTERVIEW" | "PENDING_DECISION" | undefined;
    guildId?: string | undefined;
    q?: string | undefined;
}, {
    status?: "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "OPEN" | "SUBMITTED" | "SCREENING" | "INTERVIEW" | "PENDING_DECISION" | undefined;
    guildId?: string | undefined;
    q?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
}>;
declare const guildQ: z.ZodObject<{
    guildId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    guildId?: string | undefined;
}, {
    guildId?: string | undefined;
}>;
declare const analyticsQ: z.ZodObject<{
    type: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["APPROVED", "PENDING", "REJECTED"]>>;
    reviewer: z.ZodOptional<z.ZodString>;
    days: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    days: number;
    type?: string | undefined;
    status?: "REJECTED" | "PENDING" | "APPROVED" | undefined;
    reviewer?: string | undefined;
}, {
    type?: string | undefined;
    status?: "REJECTED" | "PENDING" | "APPROVED" | undefined;
    days?: number | undefined;
    reviewer?: string | undefined;
}>;
export declare class ApplicationsController {
    private readonly a;
    private readonly stats;
    private readonly roblox;
    constructor(a: ApplicationsService, stats: ApplicationsAnalyticsService, roblox: RobloxService);
    /** `?guildId=` – Formular eines Servers (für den Bot); ohne: das gemeinsame (Web-Seite /apply). */
    /** Frage „Roblox User“: Konto suchen (Name, Anzeigename, Bild – keine internen Daten). Öffentlich, begrenzt. */
    robloxLookup(q: {
        q: string;
    }): Promise<{
        profile: {
            id: string;
            name: string;
            displayName: string;
            avatarUrl: string | null;
        } | null;
    }>;
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
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            source: string;
            guildId: string | null;
            discordId: string | null;
            decidedAt: Date | null;
            answers: import("@prisma/client/runtime/library").JsonValue;
            robloxUserId: string | null;
            robloxUsername: string;
            decidedById: string | null;
            decisionReason: string | null;
            grantRoleIds: string[];
            discordName: string | null;
            durationSec: number | null;
            joinedAt: Date | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    /** Statistik (Filter: Name, Status, Prüfer; Zeitraum in Tagen, verglichen mit der Vorperiode). Server getrennt wie die Liste. */
    analytics(q: z.infer<typeof analyticsQ>): Promise<{
        days: number;
        kpis: {
            key: "total" | "pending" | "approvalRate" | "avgReviewMin" | "completionRate";
            value: number;
            change: number;
        }[];
        overTime: {
            date: string;
            count: number;
            avg7: number;
        }[];
        breakdown: {
            APPROVED: number;
            PENDING: number;
            REJECTED: number;
        };
        byType: {
            type: string;
            submitted: number;
            approvalRate: number;
            avgReviewMin: number;
        }[];
        reviewers: {
            id: string;
            name: string;
            reviewed: number;
            approvalRate: number;
            avgReviewMin: number;
        }[];
        heat: number[][];
        filters: {
            types: string[];
            reviewers: {
                id: string;
                name: string;
            }[];
        };
    }>;
    history(q: {
        discordId: string;
    }): import("@prisma/client").Prisma.PrismaPromise<{
        number: string;
        id: string;
        status: string;
        createdAt: Date;
        decisionReason: string | null;
    }[]>;
    get(id: string): Promise<{
        number: string;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        source: string;
        guildId: string | null;
        discordId: string | null;
        decidedAt: Date | null;
        answers: import("@prisma/client/runtime/library").JsonValue;
        robloxUserId: string | null;
        robloxUsername: string;
        decidedById: string | null;
        decisionReason: string | null;
        grantRoleIds: string[];
        discordName: string | null;
        durationSec: number | null;
        joinedAt: Date | null;
    }>;
    /** Prüfschritte benötigen applications.review; Entscheidungen applications.decide. */
    move(a: Actor, id: string, b: z.infer<typeof move>): Promise<{
        number: string;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        source: string;
        guildId: string | null;
        discordId: string | null;
        decidedAt: Date | null;
        answers: import("@prisma/client/runtime/library").JsonValue;
        robloxUserId: string | null;
        robloxUsername: string;
        decidedById: string | null;
        decisionReason: string | null;
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
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        source: string;
        guildId: string | null;
        discordId: string | null;
        decidedAt: Date | null;
        answers: import("@prisma/client/runtime/library").JsonValue;
        robloxUserId: string | null;
        robloxUsername: string;
        decidedById: string | null;
        decisionReason: string | null;
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
        status: "ACCEPTED" | "REJECTED";
        decidedByName: string | null;
        reason: string | null;
    }>;
    /** „Ticket mit Bewerber öffnen“ (wie der Discord-Button). */
    ticket(a: Actor, id: string): Promise<{
        queued: boolean;
        linked: boolean;
    }>;
}
export {};
