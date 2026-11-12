import { ModuleRef } from '@nestjs/core';
import { z } from 'zod';
import type { Actor } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordLiveService } from '../discord/discord-live.service';
import { MonitorService, type MonitorConfig } from './monitor.service';
declare const eventsQ: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["OPEN", "RESOLVED"]>>;
    source: z.ZodOptional<z.ZodEnum<["ERLC", "ERLC_STEP", "BACKUP", "OUTBOX"]>>;
    take: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    take?: number | undefined;
    status?: "OPEN" | "RESOLVED" | undefined;
    source?: "ERLC" | "ERLC_STEP" | "BACKUP" | "OUTBOX" | undefined;
}, {
    take?: number | undefined;
    status?: "OPEN" | "RESOLVED" | undefined;
    source?: "ERLC" | "ERLC_STEP" | "BACKUP" | "OUTBOX" | undefined;
}>;
export declare class IntegrationsController {
    private readonly monitor;
    private readonly prisma;
    private readonly live;
    private readonly moduleRef;
    constructor(monitor: MonitorService, prisma: PrismaService, live: DiscordLiveService, moduleRef: ModuleRef);
    overview(): Promise<{
        checkedAt: string;
        erlc: {
            status: "DISABLED" | "UNKNOWN" | "CONNECTED" | "LIMITED" | "OFFLINE" | "ERROR";
            statusLabel: string;
            stale: boolean;
            staleAfterSeconds: number;
            id: string;
            active: boolean;
            name: string;
            pollSeconds: number;
            features: string[];
            webhookEnabled: boolean;
            lastSyncAt: Date | null;
            lastError: string | null;
            lastErrorAt: Date | null;
            latencyMs: number | null;
            rateLimit: import("@prisma/client/runtime/library").JsonValue;
            failingSince: Date | null;
            failureCount: number;
        }[];
        bot: {
            lastReportAt: Date | null;
            online: boolean;
            outboxPending: number;
            outboxOldestPendingAt: Date | null;
            outboxFailed24h: number;
        };
        backups: {
            last: {
                startedAt: Date;
                status: string;
                fileName: string;
            } | null;
            lastSuccess: {
                startedAt: Date;
                status: string;
                fileName: string;
            } | null;
            lastVerify: {
                startedAt: Date | null;
                status: string;
                fileName: string;
            } | null;
        };
        openIncidents: number;
        config: {
            alertAfterMinutes: number;
            alertAfterFailures: number;
            outboxStaleMinutes: number;
        };
    }>;
    events(q: z.infer<typeof eventsQ>): Promise<{
        acknowledgedByName: string | null;
        message: string;
        details: import("@prisma/client/runtime/library").JsonValue | null;
        count: number;
        id: string;
        status: string;
        source: string;
        sourceId: string | null;
        acknowledgedById: string | null;
        acknowledgedAt: Date | null;
        resolvedAt: Date | null;
        step: string | null;
        sourceName: string | null;
        firstAt: Date;
        lastAt: Date;
        alertedAt: Date | null;
    }[]>;
    acknowledge(a: Actor, id: string): Promise<{
        message: string;
        details: import("@prisma/client/runtime/library").JsonValue | null;
        count: number;
        id: string;
        status: string;
        source: string;
        sourceId: string | null;
        acknowledgedById: string | null;
        acknowledgedAt: Date | null;
        resolvedAt: Date | null;
        step: string | null;
        sourceName: string | null;
        firstAt: Date;
        lastAt: Date;
        alertedAt: Date | null;
    }>;
    saveConfig(a: Actor, b: MonitorConfig): Promise<{
        alertAfterMinutes: number;
        alertAfterFailures: number;
        outboxStaleMinutes: number;
    }>;
    /** Kontrollierte Wiederverbindung: Backoff zurücksetzen und sofort einmal abrufen (Rate-Limits gelten weiter). */
    retry(a: Actor, id: string): Promise<{
        ok: boolean;
        status: "DISABLED" | "UNKNOWN" | "CONNECTED" | "LIMITED" | "OFFLINE" | "ERROR";
        message: string | null;
    }>;
}
export {};
