import { z } from 'zod';
import { ERLCSyncService } from './erlc.sync';
import { ERLCWebhookService } from './erlc.webhook';
import { PrismaService } from '../prisma/prisma.service';
import type { AppRequest } from '../common/request-context';
declare const eventsQ: z.ZodObject<{
    take: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    take: number;
}, {
    take?: number | undefined;
}>;
export declare class ERLCController {
    private readonly sync;
    private readonly webhooks;
    private readonly prisma;
    constructor(sync: ERLCSyncService, webhooks: ERLCWebhookService, prisma: PrismaService);
    /** Connector-Health: enthält niemals Secrets, nur Status-Metadaten. */
    health(): Promise<{
        connector: {
            configured: boolean;
            serverStatus: string;
            serverId: string | null;
        };
        webhook: {
            eventsReceived: number;
        };
        capabilities: ({
            capability: "SERVER" | "PLAYERS" | "VEHICLES";
            available: boolean;
            reason: string | undefined;
            lastSuccessAt: Date | null;
            lastFailureAt: Date | null;
            lastError: string | null;
            latencyMs: number | null;
            rateLimitUntil: Date | null;
        } | {
            capability: string;
            available: boolean;
            reason: string | undefined;
            message: string | undefined;
        })[];
    }>;
    server(): Promise<{
        source: "ERLC_LIVE";
        fetchedAt: string;
        stale: boolean;
        data: unknown;
    }>;
    players(): Promise<{
        source: "ERLC_LIVE";
        fetchedAt: string;
        stale: boolean;
        data: unknown;
    }>;
    vehicles(): Promise<{
        source: "ERLC_LIVE";
        fetchedAt: string;
        stale: boolean;
        data: unknown;
    }>;
    positions(): void;
    events(q: z.infer<typeof eventsQ>): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        type: string;
        serverId: string | null;
        dedupeKey: string;
        payload: import("@prisma/client/runtime/library").JsonValue;
        receivedAt: Date;
        processedAt: Date | null;
    }[]>;
    /** Öffentlich erreichbar (ER:LC-Server ruft auf), aber ausschließlich per Ed25519-Signatur authentifiziert. */
    webhook(req: AppRequest & {
        rawBody?: Buffer;
    }, signature?: string, timestamp?: string): Promise<import("./erlc.webhook").WebhookResult>;
}
export {};
