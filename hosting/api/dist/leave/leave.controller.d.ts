import { z } from 'zod';
import { LeaveService, type LeaveConfig } from './leave.service';
import type { Actor } from '../audit/audit.service';
declare const requestBody: z.ZodObject<{
    startsAt: z.ZodDate;
    endsAt: z.ZodDate;
    reason: z.ZodString;
    guildId: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodString>;
    comment: z.ZodOptional<z.ZodString>;
    forDiscordId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    startsAt: Date;
    endsAt: Date;
    type?: string | undefined;
    guildId?: string | undefined;
    comment?: string | undefined;
    forDiscordId?: string | undefined;
}, {
    reason: string;
    startsAt: Date;
    endsAt: Date;
    type?: string | undefined;
    guildId?: string | undefined;
    comment?: string | undefined;
    forDiscordId?: string | undefined;
}>;
declare const listQ: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["PENDING", "APPROVED", "DENIED", "CANCELLED", "ENDED", "ACTIVE", "UPCOMING", "CALENDAR", "ALL"]>>;
    mine: z.ZodOptional<z.ZodEnum<["true", "false"]>>;
    discordId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status?: "DENIED" | "PENDING" | "APPROVED" | "CANCELLED" | "ENDED" | "ACTIVE" | "UPCOMING" | "CALENDAR" | "ALL" | undefined;
    discordId?: string | undefined;
    mine?: "true" | "false" | undefined;
}, {
    status?: "DENIED" | "PENDING" | "APPROVED" | "CANCELLED" | "ENDED" | "ACTIVE" | "UPCOMING" | "CALENDAR" | "ALL" | undefined;
    discordId?: string | undefined;
    mine?: "true" | "false" | undefined;
}>;
declare const decision: z.ZodObject<{
    status: z.ZodEnum<["APPROVED", "DENIED"]>;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "DENIED" | "APPROVED";
    reason?: string | undefined;
}, {
    status: "DENIED" | "APPROVED";
    reason?: string | undefined;
}>;
/** Abmeldungen (Leave of Absences). Beantragen: leave.request · alle sehen: leave.view · entscheiden: leave.manage. */
export declare class LeaveController {
    private readonly s;
    constructor(s: LeaveService);
    config(): Promise<{
        roleIds: string[];
        enabled: boolean;
        maxDays: number;
        approvalChannelId?: string | null | undefined;
        logChannelId?: string | null | undefined;
    }>;
    saveConfig(a: Actor, b: LeaveConfig): Promise<{
        roleIds: string[];
        enabled: boolean;
        maxDays: number;
        approvalChannelId?: string | null | undefined;
        logChannelId?: string | null | undefined;
    }>;
    list(a: Actor, q: z.infer<typeof listQ>): Promise<{
        items: {
            id: string;
            number: string;
            userId: string;
            name: string;
            discordId: string | null;
            startsAt: Date;
            endsAt: Date;
            reason: string;
            type: string | null;
            comment: string | null;
            status: string;
            active: boolean;
            guildId: string | null;
            decidedAt: Date | null;
            decisionReason: string | null;
            decidedByName: string | null;
            endedAt: Date | null;
            createdAt: Date;
            days: number;
        }[];
        member?: {
            userId: string;
            name: string;
        } | undefined;
        all: boolean;
    }>;
    request(a: Actor, b: z.infer<typeof requestBody>): Promise<{
        id: string;
        number: string;
        userId: string;
        name: string;
        discordId: string | null;
        startsAt: Date;
        endsAt: Date;
        reason: string;
        type: string | null;
        comment: string | null;
        status: string;
        active: boolean;
        guildId: string | null;
        decidedAt: Date | null;
        decisionReason: string | null;
        decidedByName: string | null;
        endedAt: Date | null;
        createdAt: Date;
        days: number;
    }>;
    decide(a: Actor, id: string, b: z.infer<typeof decision>): Promise<{
        id: string;
        number: string;
        userId: string;
        name: string;
        discordId: string | null;
        startsAt: Date;
        endsAt: Date;
        reason: string;
        type: string | null;
        comment: string | null;
        status: string;
        active: boolean;
        guildId: string | null;
        decidedAt: Date | null;
        decisionReason: string | null;
        decidedByName: string | null;
        endedAt: Date | null;
        createdAt: Date;
        days: number;
    }>;
    /** Eigene zurückziehen; Leitung (leave.manage) kann jede beenden. */
    cancel(a: Actor, id: string): Promise<{
        id: string;
        number: string;
        userId: string;
        name: string;
        discordId: string | null;
        startsAt: Date;
        endsAt: Date;
        reason: string;
        type: string | null;
        comment: string | null;
        status: string;
        active: boolean;
        guildId: string | null;
        decidedAt: Date | null;
        decisionReason: string | null;
        decidedByName: string | null;
        endedAt: Date | null;
        createdAt: Date;
        days: number;
    }>;
}
export {};
