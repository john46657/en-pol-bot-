import { type ErlcServer } from '@prisma/client';
import { z } from 'zod';
import { type ErlcStatus } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ErlcClient, type ErlcResult } from './erlc-client';
import { CadNotifyService } from './cad-notify.service';
export declare const erlcServerInput: z.ZodObject<{
    name: z.ZodString;
    serverRef: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    logoUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    guildId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    active: z.ZodDefault<z.ZodBoolean>;
    key: z.ZodOptional<z.ZodString>;
    pollSeconds: z.ZodDefault<z.ZodEffects<z.ZodNumber, number, number>>;
    features: z.ZodDefault<z.ZodArray<z.ZodEnum<["players", "staff", "queue", "vehicles", "emergencyCalls", "modCalls", "joinLogs", "killLogs", "commandLogs", "commands", "webhook"]>, "many">>;
    webhookEnabled: z.ZodDefault<z.ZodBoolean>;
    settings: z.ZodOptional<z.ZodObject<{
        criticalCommands: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodString, "many">>>;
        blockedCommands: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodString, "many">>>;
    }, "strip", z.ZodTypeAny, {
        criticalCommands?: string[] | undefined;
        blockedCommands?: string[] | undefined;
    }, {
        criticalCommands?: string[] | undefined;
        blockedCommands?: string[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    active: boolean;
    pollSeconds: number;
    features: ("vehicles" | "players" | "staff" | "queue" | "emergencyCalls" | "modCalls" | "joinLogs" | "killLogs" | "commandLogs" | "commands" | "webhook")[];
    webhookEnabled: boolean;
    settings?: {
        criticalCommands?: string[] | undefined;
        blockedCommands?: string[] | undefined;
    } | undefined;
    key?: string | undefined;
    guildId?: string | null | undefined;
    description?: string | null | undefined;
    serverRef?: string | null | undefined;
    logoUrl?: string | null | undefined;
}, {
    name: string;
    active?: boolean | undefined;
    settings?: {
        criticalCommands?: string[] | undefined;
        blockedCommands?: string[] | undefined;
    } | undefined;
    key?: string | undefined;
    guildId?: string | null | undefined;
    description?: string | null | undefined;
    serverRef?: string | null | undefined;
    logoUrl?: string | null | undefined;
    pollSeconds?: number | undefined;
    features?: ("vehicles" | "players" | "staff" | "queue" | "emergencyCalls" | "modCalls" | "joinLogs" | "killLogs" | "commandLogs" | "commands" | "webhook")[] | undefined;
    webhookEnabled?: boolean | undefined;
}>;
export type ErlcServerInput = z.infer<typeof erlcServerInput>;
export interface ErlcPlayer {
    name: string;
    id: string | null;
    team: string | null;
    callsign: string | null;
    permission: string | null;
    wantedStars: number;
    location: {
        x: number;
        z: number;
        postal: string | null;
        street: string | null;
        building: string | null;
    } | null;
}
export interface ErlcSnapshot {
    fetchedAt: string;
    server: {
        name: string;
        currentPlayers: number;
        maxPlayers: number;
        joinKey: string | null;
        accVerifiedReq: string | null;
        teamBalance: boolean | null;
    };
    players?: ErlcPlayer[];
    staff?: {
        admins: {
            id: string;
            name: string;
        }[];
        mods: {
            id: string;
            name: string;
        }[];
        helpers: {
            id: string;
            name: string;
        }[];
    };
    queue?: string[];
    vehicles?: {
        name: string;
        owner: string;
        plate: string | null;
        texture: string | null;
        colorHex: string | null;
        colorName: string | null;
    }[];
    emergencyCalls?: {
        callNumber: number;
        team: string | null;
        caller: string | null;
        players: string[];
        x: number | null;
        z: number | null;
        startedAt: number;
        description: string | null;
        positionDescriptor: string | null;
    }[];
    modCalls?: {
        caller: string;
        callerId: string | null;
        moderator: string | null;
        timestamp: number;
    }[];
    joinLogs?: {
        join: boolean;
        player: string;
        playerId: string | null;
        timestamp: number;
    }[];
    killLogs?: {
        killed: string;
        killer: string;
        timestamp: number;
    }[];
    commandLogs?: {
        player: string;
        command: string;
        timestamp: number;
    }[];
    webhookEvents?: {
        at: string;
        summary: string;
    }[];
}
/** Antwort von GET /v2/server → einheitliches, geheimnisfreies Format für Dashboard/CAD. */
export declare function normalizeSnapshot(raw: Record<string, unknown>, features: string[]): ErlcSnapshot;
/** Fehler der ER:LC-API → Verbindungsstatus. */
export declare function statusFor(r: Extract<ErlcResult<unknown>, {
    ok: false;
}>): {
    status: ErlcStatus;
    pause: boolean;
    message: string;
};
export declare class ErlcService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    private readonly realtime;
    private readonly notify;
    private readonly log;
    readonly client: ErlcClient;
    private readonly rt;
    private webhookKey;
    private readonly seen;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, realtime: RealtimeService, notify: CadNotifyService);
    /** Nur für Tests: andere Gegenstelle/Signaturschlüssel. */
    useClient(c: ErlcClient): void;
    useWebhookKey(spkiBase64: string): void;
    private runtime;
    /** Geheimnisfreie Darstellung – der Key wird nie ausgeliefert, nur maskiert. */
    view(s: ErlcServer, withSecrets?: boolean): {
        id: string;
        name: string;
        serverRef: string | null;
        description: string | null;
        logoUrl: string | null;
        guildId: string | null;
        active: boolean;
        pollSeconds: number;
        features: string[];
        webhookEnabled: boolean;
        settings: {
            criticalCommands: string[];
            blockedCommands: string[];
        };
        status: string;
        statusLabel: string;
        lastSyncAt: Date | null;
        lastError: string | null;
        lastErrorAt: Date | null;
        latencyMs: number | null;
        rateLimit: {
            blockedUntil: number | null;
            buckets: import("./erlc-client").RateState[];
        };
        hasKey: boolean;
        keyMasked: string;
        webhookPath: string | null;
        paused: boolean;
        createdAt: Date;
        updatedAt: Date;
    };
    list(withSecrets?: boolean): Promise<{
        id: string;
        name: string;
        serverRef: string | null;
        description: string | null;
        logoUrl: string | null;
        guildId: string | null;
        active: boolean;
        pollSeconds: number;
        features: string[];
        webhookEnabled: boolean;
        settings: {
            criticalCommands: string[];
            blockedCommands: string[];
        };
        status: string;
        statusLabel: string;
        lastSyncAt: Date | null;
        lastError: string | null;
        lastErrorAt: Date | null;
        latencyMs: number | null;
        rateLimit: {
            blockedUntil: number | null;
            buckets: import("./erlc-client").RateState[];
        };
        hasKey: boolean;
        keyMasked: string;
        webhookPath: string | null;
        paused: boolean;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    private load;
    create(actor: Actor, d: ErlcServerInput): Promise<{
        id: string;
        name: string;
        serverRef: string | null;
        description: string | null;
        logoUrl: string | null;
        guildId: string | null;
        active: boolean;
        pollSeconds: number;
        features: string[];
        webhookEnabled: boolean;
        settings: {
            criticalCommands: string[];
            blockedCommands: string[];
        };
        status: string;
        statusLabel: string;
        lastSyncAt: Date | null;
        lastError: string | null;
        lastErrorAt: Date | null;
        latencyMs: number | null;
        rateLimit: {
            blockedUntil: number | null;
            buckets: import("./erlc-client").RateState[];
        };
        hasKey: boolean;
        keyMasked: string;
        webhookPath: string | null;
        paused: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(actor: Actor, id: string, d: Partial<ErlcServerInput>): Promise<{
        id: string;
        name: string;
        serverRef: string | null;
        description: string | null;
        logoUrl: string | null;
        guildId: string | null;
        active: boolean;
        pollSeconds: number;
        features: string[];
        webhookEnabled: boolean;
        settings: {
            criticalCommands: string[];
            blockedCommands: string[];
        };
        status: string;
        statusLabel: string;
        lastSyncAt: Date | null;
        lastError: string | null;
        lastErrorAt: Date | null;
        latencyMs: number | null;
        rateLimit: {
            blockedUntil: number | null;
            buckets: import("./erlc-client").RateState[];
        };
        hasKey: boolean;
        keyMasked: string;
        webhookPath: string | null;
        paused: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(actor: Actor, id: string): Promise<void>;
    /** Verbindung testen bzw. neu herstellen: Backoff/Pause zurücksetzen und sofort abrufen. */
    reconnect(actor: Actor, id: string, action: 'test' | 'reconnect'): Promise<{
        server: {
            id: string;
            name: string;
            serverRef: string | null;
            description: string | null;
            logoUrl: string | null;
            guildId: string | null;
            active: boolean;
            pollSeconds: number;
            features: string[];
            webhookEnabled: boolean;
            settings: {
                criticalCommands: string[];
                blockedCommands: string[];
            };
            status: string;
            statusLabel: string;
            lastSyncAt: Date | null;
            lastError: string | null;
            lastErrorAt: Date | null;
            latencyMs: number | null;
            rateLimit: {
                blockedUntil: number | null;
                buckets: import("./erlc-client").RateState[];
            };
            hasKey: boolean;
            keyMasked: string;
            webhookPath: string | null;
            paused: boolean;
            createdAt: Date;
            updatedAt: Date;
        };
        ok: boolean;
        status: ErlcStatus;
        message?: string;
        latencyMs?: number;
    }>;
    /** Planer (jede Sekunde aus dem Modul): fällige Server abrufen. Kein Server blockiert die anderen. */
    tick(): Promise<void>;
    /** Ein Abruf von GET /v2/server mit allen freigegebenen Datenarten. */
    poll(id: string, manual?: boolean): Promise<{
        ok: boolean;
        status: ErlcStatus;
        message?: string;
        latencyMs?: number;
    }>;
    /** Notrufe übernehmen (idempotent je Server + Notrufnummer + Startzeit). Neue Notrufe → CAD + Discord. */
    syncCalls(s: Pick<ErlcServer, 'id' | 'name' | 'guildId'>, calls: NonNullable<ErlcSnapshot['emergencyCalls']>, source: 'API' | 'WEBHOOK'): Promise<number>;
    /** Live-Daten (letzter Stand bleibt bei API-Ausfall sichtbar). */
    live(id: string): Promise<{
        server: {
            id: string;
            name: string;
            serverRef: string | null;
            description: string | null;
            logoUrl: string | null;
            guildId: string | null;
            active: boolean;
            pollSeconds: number;
            features: string[];
            webhookEnabled: boolean;
            settings: {
                criticalCommands: string[];
                blockedCommands: string[];
            };
            status: string;
            statusLabel: string;
            lastSyncAt: Date | null;
            lastError: string | null;
            lastErrorAt: Date | null;
            latencyMs: number | null;
            rateLimit: {
                blockedUntil: number | null;
                buckets: import("./erlc-client").RateState[];
            };
            hasKey: boolean;
            keyMasked: string;
            webhookPath: string | null;
            paused: boolean;
            createdAt: Date;
            updatedAt: Date;
        };
        snapshot: ErlcSnapshot | null;
        stale: boolean;
    }>;
    runCommand(actor: Actor & {
        discordId?: string | null;
    }, id: string, raw: string, confirm: boolean): Promise<{
        ok: true;
        result: string | null;
        critical: boolean;
        logId: string;
    }>;
    commandLog(id: string, take?: number): Promise<{
        userName: string | null;
        error: string | null;
        id: string;
        createdAt: Date;
        result: string | null;
        userId: string | null;
        discordId: string | null;
        command: string;
        ok: boolean;
        serverId: string;
        critical: boolean;
    }[]>;
    verifySignature(raw: Buffer, timestamp: string | undefined, sigHex: string | undefined): boolean;
    /** Webhook-Ereignis: Notrufe sofort ins CAD, sonst als Ereignis vermerken; danach zeitnah normal abrufen. */
    webhook(id: string, token: string, raw: Buffer | undefined, timestamp?: string, signature?: string): Promise<{
        ok: boolean;
        duplicate: boolean;
        ignored?: undefined;
        calls?: undefined;
        events?: undefined;
    } | {
        ok: boolean;
        ignored: boolean;
        duplicate?: undefined;
        calls?: undefined;
        events?: undefined;
    } | {
        ok: boolean;
        calls: number;
        events: number;
        duplicate?: undefined;
        ignored?: undefined;
    }>;
}
