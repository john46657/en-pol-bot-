import { z } from 'zod';
import type { Actor } from '../audit/audit.service';
import { WantedMatchService } from './wanted-match.service';
declare const listQ: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
} & {
    status: z.ZodOptional<z.ZodEnum<["CONFIRMED", "PENDING", "VERIFIED", "DISMISSED"]>>;
    matchType: z.ZodOptional<z.ZodEnum<["ROBLOX_ID", "NAME"]>>;
    wantedId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    status?: "PENDING" | "CONFIRMED" | "VERIFIED" | "DISMISSED" | undefined;
    wantedId?: string | undefined;
    matchType?: "ROBLOX_ID" | "NAME" | undefined;
    q?: string | undefined;
}, {
    status?: "PENDING" | "CONFIRMED" | "VERIFIED" | "DISMISSED" | undefined;
    wantedId?: string | undefined;
    matchType?: "ROBLOX_ID" | "NAME" | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
declare const review: z.ZodObject<{
    decision: z.ZodEnum<["VERIFIED", "DISMISSED"]>;
    note: z.ZodString;
    storeRobloxId: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    note: string;
    decision: "VERIFIED" | "DISMISSED";
    storeRobloxId?: boolean | undefined;
}, {
    note: string;
    decision: "VERIFIED" | "DISMISSED";
    storeRobloxId?: boolean | undefined;
}>;
declare const settings: z.ZodObject<{
    enabled: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    notifyDiscord: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    notifyPossible: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    channelId: z.ZodOptional<z.ZodDefault<z.ZodNullable<z.ZodString>>>;
}, "strict", z.ZodTypeAny, {
    enabled?: boolean | undefined;
    channelId?: string | null | undefined;
    notifyDiscord?: boolean | undefined;
    notifyPossible?: boolean | undefined;
}, {
    enabled?: boolean | undefined;
    channelId?: string | null | undefined;
    notifyDiscord?: boolean | undefined;
    notifyPossible?: boolean | undefined;
}>;
/** ER:LC-Fahndungstreffer (automatischer Abgleich). Alle Rechte werden serverseitig geprüft. */
export declare class WantedHitsController {
    private readonly m;
    constructor(m: WantedMatchService);
    list(q: z.infer<typeof listQ>): Promise<{
        items: {
            reference: string;
            wanted: {
                id: string;
                status: string;
                reason: string;
                priority: string;
            } | null;
            person: {
                id: string;
                robloxUserId: string | null;
                robloxUsername: string;
            } | null;
            session: {
                id: string;
                joinedAt: Date;
                lastSeenAt: Date;
                leftAt: Date | null;
            } | null;
            reviewedByName: string | null;
            delivery: string;
            deliveryError: string | null;
            serverId: string | null;
            id: string;
            robloxUserId: string | null;
            personId: string | null;
            wantedId: string;
            erlcServerId: string | null;
            erlcServerName: string | null;
            sessionId: string | null;
            playerName: string;
            matchType: string;
            reviewStatus: string;
            matchNote: string | null;
            wantedReason: string;
            wantedPriority: string;
            detectedAt: Date;
            reviewedById: string | null;
            reviewedAt: Date | null;
            reviewNote: string | null;
            notifyStatus: string;
            notifyOutboxId: string | null;
            notifyError: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    summary(): Promise<{
        pending: number;
        confirmed24h: number;
        total: number;
        settings: {
            enabled: boolean;
            channelId: string | null;
            notifyDiscord: boolean;
            notifyPossible: boolean;
        };
        servers: {
            id: string;
            name: string;
            active: boolean;
            status: string;
            lastSyncAt: Date | null;
            lastError: string | null;
            lastErrorAt: Date | null;
            playersEnabled: boolean;
            match: import("./wanted-match.service").ServerState | null;
        }[];
    }>;
    getSettings(): Promise<{
        enabled: boolean;
        channelId: string | null;
        notifyDiscord: boolean;
        notifyPossible: boolean;
    }>;
    putSettings(a: Actor, b: z.infer<typeof settings>): Promise<{
        enabled: boolean;
        channelId: string | null;
        notifyDiscord: boolean;
        notifyPossible: boolean;
    }>;
    get(id: string): Promise<{
        reference: string;
        wanted: {
            id: string;
            status: string;
            reason: string;
            priority: string;
        } | null;
        person: {
            id: string;
            robloxUserId: string | null;
            robloxUsername: string;
        } | null;
        session: {
            id: string;
            joinedAt: Date;
            lastSeenAt: Date;
            leftAt: Date | null;
        } | null;
        reviewedByName: string | null;
        delivery: string;
        deliveryError: string | null;
        serverId: string | null;
        id: string;
        robloxUserId: string | null;
        personId: string | null;
        wantedId: string;
        erlcServerId: string | null;
        erlcServerName: string | null;
        sessionId: string | null;
        playerName: string;
        matchType: string;
        reviewStatus: string;
        matchNote: string | null;
        wantedReason: string;
        wantedPriority: string;
        detectedAt: Date;
        reviewedById: string | null;
        reviewedAt: Date | null;
        reviewNote: string | null;
        notifyStatus: string;
        notifyOutboxId: string | null;
        notifyError: string | null;
    }>;
    review(a: Actor, id: string, b: z.infer<typeof review>): Promise<{
        id: string;
        reviewStatus: "VERIFIED" | "DISMISSED";
        robloxIdStored: boolean;
    }>;
}
export {};
