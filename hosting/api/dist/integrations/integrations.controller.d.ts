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
/**
 * Administration → Systemstatus: ER:LC-API (Status, letzte erfolgreiche Synchronisierung, Rate-Limit, Fehlerserie), Verarbeitungsschritte,
 * Discord-Bot/-Ausgang, Backups und das Störungsprotokoll. Zugangsdaten werden nie ausgeliefert.
 */
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
                error: string | null;
                id: string;
                status: string;
                createdById: string | null;
                startedAt: Date;
                kind: string | null;
                finishedAt: Date | null;
                details: import("@prisma/client/runtime/library").JsonValue | null;
                size: number | null;
                action: string;
                fileName: string | null;
                rows: number | null;
            } | null;
            lastSuccess: {
                error: string | null;
                id: string;
                status: string;
                createdById: string | null;
                startedAt: Date;
                kind: string | null;
                finishedAt: Date | null;
                details: import("@prisma/client/runtime/library").JsonValue | null;
                size: number | null;
                action: string;
                fileName: string | null;
                rows: number | null;
            } | null;
            lastVerify: {
                error: string | null;
                id: string;
                status: string;
                createdById: string | null;
                startedAt: Date;
                kind: string | null;
                finishedAt: Date | null;
                details: import("@prisma/client/runtime/library").JsonValue | null;
                size: number | null;
                action: string;
                fileName: string | null;
                rows: number | null;
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
        count: number;
        message: string;
        id: string;
        status: string;
        source: string;
        acknowledgedById: string | null;
        acknowledgedAt: Date | null;
        details: import("@prisma/client/runtime/library").JsonValue | null;
        sourceId: string | null;
        sourceName: string | null;
        step: string | null;
        firstAt: Date;
        lastAt: Date;
        resolvedAt: Date | null;
        alertedAt: Date | null;
    }[]>;
    acknowledge(a: Actor, id: string): Promise<{
        count: number;
        message: string;
        id: string;
        status: string;
        source: string;
        acknowledgedById: string | null;
        acknowledgedAt: Date | null;
        details: import("@prisma/client/runtime/library").JsonValue | null;
        sourceId: string | null;
        sourceName: string | null;
        step: string | null;
        firstAt: Date;
        lastAt: Date;
        resolvedAt: Date | null;
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
