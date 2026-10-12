import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { AuthorizationService } from '../authz/authorization.service';
import { PermissionService } from '../authz/permission.service';
import { SyncService } from './sync.service';
import { ServersService } from './servers.service';
/** Lesen synchronisierter Kopien braucht das Lese-Recht des zugehörigen Moduls auf dem Zielserver. */
export declare const SYNC_VIEW_PERMISSION: Record<string, string>;
/**
 * Serververbindungen und Datenfreigaben. Regeln:
 * - Verbindung verwalten = `connections.manage` auf JEDEM Mitgliedsserver (oder globaler Systemadministrator).
 * - Freigabe anlegen/ändern = `connections.manage` auf Quell- UND Zielserver; beide müssen Mitglied derselben Verbindung sein
 *   (zusätzlich per zusammengesetztem Fremdschlüssel in der Datenbank erzwungen).
 * - Eine Verbindung allein überträgt nichts; eine Freigabe überträgt nur lesende Kopien.
 */
export declare class ConnectionsService {
    private readonly prisma;
    private readonly audit;
    private readonly authz;
    private readonly perms;
    private readonly sync;
    private readonly servers;
    constructor(prisma: PrismaService, audit: AuditService, authz: AuthorizationService, perms: PermissionService, sync: SyncService, servers: ServersService);
    private loadConn;
    private allowedOn;
    /** Recht auf allen (`every`) bzw. mindestens einem Mitgliedsserver. Globale Systemadministratoren immer. */
    private assertOnConnection;
    private assertOnServerId;
    private record;
    list(actor: Actor): Promise<({
        _count: {
            policies: number;
        };
        members: ({
            server: {
                id: string;
                status: string;
                name: string;
                guildId: string;
                archivedAt: Date | null;
            };
        } & {
            serverId: string;
            id: string;
            createdAt: Date;
            connectionId: string;
        })[];
    } & {
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        createdById: string | null;
        name: string;
    })[]>;
    get(actor: Actor, id: string): Promise<{
        members: ({
            server: {
                id: string;
                status: string;
                name: string;
                guildId: string;
                archivedAt: Date | null;
            };
        } & {
            serverId: string;
            id: string;
            createdAt: Date;
            connectionId: string;
        })[];
    } & {
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        createdById: string | null;
        name: string;
    }>;
    create(actor: Actor, d: {
        name: string;
        serverIds: string[];
    }): Promise<{
        members: ({
            server: {
                id: string;
                status: string;
                createdAt: Date;
                updatedAt: Date;
                version: number;
                name: string;
                guildId: string;
                archivedAt: Date | null;
            };
        } & {
            serverId: string;
            id: string;
            createdAt: Date;
            connectionId: string;
        })[];
    } & {
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        createdById: string | null;
        name: string;
    }>;
    update(actor: Actor, id: string, d: {
        name?: string;
        status?: 'ACTIVE' | 'DISABLED';
        version: number;
    }): Promise<{
        members: ({
            server: {
                id: string;
                status: string;
                createdAt: Date;
                updatedAt: Date;
                version: number;
                name: string;
                guildId: string;
                archivedAt: Date | null;
            };
        } & {
            serverId: string;
            id: string;
            createdAt: Date;
            connectionId: string;
        })[];
    } & {
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        createdById: string | null;
        name: string;
    }>;
    /** Nur deaktivierte Verbindungen können entfernt werden. Synchronisierte Kopien bleiben gespeichert, sind aber ohne Freigabe nicht mehr lesbar. */
    remove(actor: Actor, id: string): Promise<void>;
    addMember(actor: Actor, id: string, serverId: string): Promise<{
        members: ({
            server: {
                id: string;
                status: string;
                name: string;
                guildId: string;
                archivedAt: Date | null;
            };
        } & {
            serverId: string;
            id: string;
            createdAt: Date;
            connectionId: string;
        })[];
    } & {
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        createdById: string | null;
        name: string;
    }>;
    /** Ein Server kann eine Verbindung mit `connections.manage` auf diesem Server verlassen; seine Freigaben enden (offene Ereignisse verworfen). */
    removeMember(actor: Actor, id: string, serverId: string): Promise<{
        members: ({
            server: {
                id: string;
                status: string;
                name: string;
                guildId: string;
                archivedAt: Date | null;
            };
        } & {
            serverId: string;
            id: string;
            createdAt: Date;
            connectionId: string;
        })[];
    } & {
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        createdById: string | null;
        name: string;
    }>;
    policies(actor: Actor, id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        settings: Prisma.JsonValue;
        enabled: boolean;
        connectionId: string;
        sourceServerId: string;
        targetServerId: string;
        dataType: string;
        direction: string;
    }[]>;
    createPolicy(actor: Actor, id: string, d: {
        sourceServerId: string;
        targetServerId: string;
        dataType: string;
        direction: string;
        enabled: boolean;
        settings: Record<string, unknown>;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        settings: Prisma.JsonValue;
        enabled: boolean;
        connectionId: string;
        sourceServerId: string;
        targetServerId: string;
        dataType: string;
        direction: string;
    }>;
    private loadPolicy;
    updatePolicy(actor: Actor, id: string, policyId: string, d: {
        direction?: string;
        enabled?: boolean;
        settings?: Record<string, unknown>;
        version: number;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        settings: Prisma.JsonValue;
        enabled: boolean;
        connectionId: string;
        sourceServerId: string;
        targetServerId: string;
        dataType: string;
        direction: string;
    }>;
    removePolicy(actor: Actor, id: string, policyId: string): Promise<void>;
    syncStatus(actor: Actor, id: string): Promise<{
        connectionId: string;
        status: string;
        counts: {
            [k: string]: number;
        };
        lastProcessedAt: Date | null;
        oldestPendingAt: Date | null;
    }>;
    /** Ereignisliste ohne Inhalte (Payload wird nicht ausgeliefert – nur Metadaten). */
    syncEvents(actor: Actor, id: string, q: {
        status?: string;
        page: number;
        pageSize: number;
    }): Promise<{
        items: {
            id: string;
            status: string;
            createdAt: Date;
            lastError: string | null;
            sourceServerId: string;
            targetServerId: string;
            dataType: string;
            eventType: string;
            sourceRecordId: string;
            sourceVersion: number;
            attemptCount: number;
            nextAttemptAt: Date;
            processedAt: Date | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    retryFailed(actor: Actor, id: string): Promise<{
        requeued: number;
    }>;
    auditLogs(actor: Actor, id: string, q: {
        page: number;
        pageSize: number;
    }): Promise<{
        items: {
            serverId: string | null;
            result: string;
            id: string;
            createdAt: Date;
            reason: string | null;
            module: string;
            entityType: string | null;
            entityId: string | null;
            action: string;
            actorUserId: string | null;
            actorRobloxUserId: string | null;
            before: Prisma.JsonValue | null;
            after: Prisma.JsonValue | null;
            requestId: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    /**
     * Nur lesend synchronisierte Daten anderer Server auf DIESEM Server. Voraussetzungen je Kopie: Lese-Recht des Moduls hier
     * UND die Freigabe von der Quelle hierher ist jetzt noch aktiv (sonst unsichtbar, aber nicht gelöscht).
     */
    synced(actor: Actor, serverId: string, dataType: string): Promise<{
        id: string;
        dataType: string;
        readOnly: boolean;
        source: {
            id: string;
            name: string;
            guildId: string;
        } | null;
        sourceRecordId: string;
        sourceVersion: number;
        data: Prisma.JsonValue;
        updatedAt: Date;
        targetGuildId: string;
    }[]>;
}
