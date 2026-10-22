import { type PermissionKey } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PermissionService } from './permission.service';
export type DenyReason = 'UNKNOWN_SERVER' | 'SERVER_DISABLED' | 'NOT_MEMBER' | 'MODULE_DISABLED' | 'PERMISSION' | 'FOREIGN_RECORD';
export type Decision = {
    allowed: true;
} | {
    allowed: false;
    reason: DenyReason;
    message: string;
};
/** Zugriffskontext auf einen konkreten Datensatz bzw. eine serverübergreifende Aktion. */
export interface ResourceContext {
    /** Akten-Bereich des Datensatzes (Spalte `serverId`; `null` = gemeinsamer Bestand). `undefined` = kein Datensatzbezug. */
    space?: string | null;
}
export interface ServerRow {
    id: string;
    guildId: string;
    name: string;
    status: string;
    archivedAt: Date | null;
}
/**
 * Zentrale Zugriffsentscheidung für ALLE geschützten Aktionen (PermissionGuard, Server-/Verbindungs-APIs, Bot-Aufrufe):
 * authentifizierter Benutzer → Server registriert und aktiv → bestätigte Mitgliedschaft → Modul an → Berechtigung (höchste Rolle entscheidet, in einer Rolle DENY vor ALLOW)
 * → Datensatz im erlaubten Bereich → ggf. aktive Datenfreigabe. Standard ist „verweigert“.
 * Globale Systemadministratoren überspringen NUR die Mitgliedschaftsprüfung (Notfall-/Verwaltungszugang); Module und
 * Mandantengrenzen gelten auch für sie. Server-Administratoren haben Rechte nur auf ihrem Server (Rollen mit `guildId`).
 */
export declare class AuthorizationService {
    private readonly prisma;
    private readonly perms;
    private readonly audit;
    private servers;
    private modules;
    private deniedLog;
    constructor(prisma: PrismaService, perms: PermissionService, audit: AuditService);
    /** Nach Änderungen an Servern/Modulen (diese Instanz sofort, andere spätestens nach 5 s). */
    invalidate(): void;
    server(guildId: string): Promise<ServerRow | null>;
    /** Abgeschaltete Module eines Servers (ohne Eintrag = an; global ausgeschaltete immer). */
    disabledModules(serverId: string): Promise<Set<string>>;
    isMember(userId: string, serverId: string): Promise<boolean>;
    /** Server-/Mitgliedschafts-/Modulprüfung ohne Berechtigung (für Listen effektiver Rechte und eigene Prüfungen). */
    private gate;
    /**
     * authorize(user, server, permission, resourceContext). `guildId` = Server der Aktion (Header X-Guild-Id bzw. Pfad-Server),
     * `null` = „Alle Server“: dann gelten nur serverübergreifende, manuell vergebene Rollen und keine Modulprüfung.
     */
    authorize(userId: string, guildId: string | null, permission: string, resource?: ResourceContext): Promise<Decision>;
    /** Wie `authorize`, wirft aber `PERMISSION_DENIED`/`NOT_FOUND` und protokolliert die Verweigerung (gedrosselt). */
    assert(userId: string, guildId: string | null, permission: string, resource?: ResourceContext, meta?: {
        requestId?: string;
        ip?: string;
    }): Promise<void>;
    /** Verweigerte sicherheitsrelevante Zugriffe: SecurityEvent + Audit (DENIED), je Benutzer/Recht/Server höchstens einmal pro Minute. */
    recordDenied(userId: string, guildId: string | null, permission: string, reason: string, meta?: {
        requestId?: string;
        ip?: string;
    }): Promise<void>;
    /** Effektive Rechte auf einem Server – serverseitig berechnet (Rollen dieses Servers, Mitgliedschaft, Module). */
    effective(userId: string, guildId?: string | null): Promise<PermissionKey[]>;
    /** Effektive Rechte mit Begründung je Recht (für die Verwaltung). */
    explain(userId: string, guildId: string): Promise<{
        permission: PermissionKey;
        module: string;
        allowed: boolean;
        source: import("@enrp/shared").ResolutionSource;
        blockedBy: DenyReason | null;
    }[]>;
}
