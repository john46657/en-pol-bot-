import { PrismaService } from '../prisma/prisma.service';
import { ERLCClient } from './erlc.client';
/** Cache + Synchronisation (ERLCCacheService / ERLCSyncService). Daten sind immer als LIVE ER:LC gekennzeichnet. */
export declare class ERLCSyncService {
    private readonly prisma;
    private readonly client;
    private readonly cache;
    private readonly inflight;
    private readonly env;
    constructor(prisma: PrismaService, client: ERLCClient);
    private serverRow;
    private state;
    /** Liefert gecachte Daten oder synchronisiert (max. alle 15 s, Single-Flight, respektiert Rate-Limit-Sperre). */
    fetch<T>(cap: 'SERVER' | 'PLAYERS' | 'VEHICLES'): Promise<{
        source: 'ERLC_LIVE';
        fetchedAt: string;
        stale: boolean;
        data: T;
    }>;
    private fallback;
    private sync;
    private normalize;
    /** Connector-Gesundheit und Capabilities für das Admin-Dashboard. */
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
}
