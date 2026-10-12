import { type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { AuthorizationService } from '../authz/authorization.service';
import { PermissionService } from '../authz/permission.service';
import { DiscordAccessService } from '../authz/discord-access.service';
import { RolesService, type RoleInput } from '../users/roles.service';
/**
 * Server- und Mandantenverwaltung. Jede Methode autorisiert gegen den Server aus dem PFAD (nie gegen den Header):
 * Rechte eines Servers gelten nur dort. Registrieren, (De-)Aktivieren und Archivieren dürfen nur globale Systemadministratoren.
 */
export declare class ServersService implements OnModuleInit {
    private readonly prisma;
    private readonly audit;
    private readonly authz;
    private readonly perms;
    private readonly roles;
    private readonly access2;
    private readonly log;
    constructor(prisma: PrismaService, audit: AuditService, authz: AuthorizationService, perms: PermissionService, roles: RolesService, access2: DiscordAccessService);
    /** Modul-Katalog aus dem Code in die Datenbank übernehmen (Fremdschlüssel der Server-Einstellungen). */
    onModuleInit(): Promise<void>;
    /**
     * Einmalig beim Übergang auf „Server von Grund auf getrennt“: bisher gemeinsame Einstellungen bekommt jeder bestehende
     * Server als EIGENE Kopie (danach unabhängig). Server, die später dazukommen, starten mit Standardwerten.
     */
    splitSettings(): Promise<void>;
    load(serverId: string): Promise<{
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        guildId: string;
        name: string;
        archivedAt: Date | null;
        rolesInitializedAt: Date | null;
    }>;
    /** Server laden und Recht auf GENAU diesem Server prüfen (fremde Server: 404 statt Hinweis auf Existenz). */
    access(actor: Actor, serverId: string, permission: string): Promise<{
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        guildId: string;
        name: string;
        archivedAt: Date | null;
        rolesInitializedAt: Date | null;
    }>;
    /** Nur Mitgliedschaft (bzw. globaler Systemadministrator) – für Auskünfte über sich selbst. */
    accessAsMember(actor: Actor, serverId: string): Promise<{
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        guildId: string;
        name: string;
        archivedAt: Date | null;
        rolesInitializedAt: Date | null;
    }>;
    requireGlobalAdmin(actor: Actor, what: string): Promise<void>;
    /** Sichtbar: globale Systemadministratoren alle; sonst Server mit bestätigter Mitgliedschaft und `servers.view` dort. */
    list(actor: Actor): Promise<{
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        guildId: string;
        name: string;
        archivedAt: Date | null;
        rolesInitializedAt: Date | null;
    }[]>;
    create(actor: Actor, d: {
        guildId: string;
        name: string;
    }): Promise<{
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        guildId: string;
        name: string;
        archivedAt: Date | null;
        rolesInitializedAt: Date | null;
    }>;
    /** Name (servers.manage auf dem Server) bzw. Status (nur globale Systemadministratoren). Optimistisches Sperren über `version`. */
    update(actor: Actor, serverId: string, d: {
        name?: string;
        status?: 'ACTIVE' | 'DISABLED';
        version: number;
    }): Promise<{
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        guildId: string;
        name: string;
        archivedAt: Date | null;
        rolesInitializedAt: Date | null;
    }>;
    /** „Löschen“ = archivieren: nicht mehr wählbar, keine Synchronisierung, aber ALLE Fachdaten und Archive bleiben erhalten. */
    archive(actor: Actor, serverId: string): Promise<{
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        guildId: string;
        name: string;
        archivedAt: Date | null;
        rolesInitializedAt: Date | null;
    }>;
    /** Vom Bot gemeldete Server: bekannte aktualisieren (Name, Verbindungsfehler aufheben); neue werden DEAKTIVIERT angelegt und müssen freigeschaltet werden. */
    syncFromBot(guilds: {
        id: string;
        name: string;
    }[]): Promise<void>;
    /** Für die Befehlsregistrierung des Bots. Nicht registriert/deaktiviert: nur Grundsystem-Befehle. */
    botModules(guildId: string): Promise<{
        registered: boolean;
        status: string;
        disabled: string[];
    }>;
    members(actor: Actor, serverId: string): Promise<({
        user: {
            id: string;
            username: string;
            displayName: string;
        };
    } & {
        serverId: string;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        source: string;
        userId: string;
        discordRoleIds: string[];
        lastVerifiedAt: Date | null;
    })[]>;
    /** Manuelle Mitgliedschaft für Konten ohne Discord (z. B. Passwort-Konten). Discord-geprüfte Mitgliedschaften überschreibt der Abgleich. */
    setManualMember(actor: Actor, serverId: string, userId: string, member: boolean): Promise<{
        serverId: string;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        source: string;
        userId: string;
        discordRoleIds: string[];
        lastVerifiedAt: Date | null;
    }>;
    modules(actor: Actor, serverId: string): Promise<{
        key: string;
        name: string;
        description: string;
        system: boolean;
        dependsOn: string[];
        enabled: boolean;
        settings: Record<string, unknown>;
        version: number;
        updatedAt: Date | null;
        updatedById: string | null;
    }[]>;
    module(actor: Actor, serverId: string, key: string): Promise<{
        key: string;
        name: string;
        description: string;
        system: boolean;
        dependsOn: string[];
        enabled: boolean;
        settings: Record<string, unknown>;
        version: number;
        updatedAt: Date | null;
        updatedById: string | null;
    }>;
    /**
     * Modul an/aus bzw. Einstellungen ändern. `version` = gelesener Stand (0 = noch nie gespeichert); ein veralteter Stand wird mit 409
     * abgelehnt – eine alte Dashboard-Ansicht überschreibt nie unbemerkt neuere Einstellungen. Abhängigkeiten werden geprüft.
     */
    patchModule(actor: Actor, serverId: string, key: string, d: {
        enabled?: boolean;
        settings?: unknown;
        version: number;
    }): Promise<{
        key: string;
        enabled: boolean;
        settings: Prisma.JsonValue;
        version: number;
        updatedAt: Date;
    }>;
    /** Einstellungen eines Moduls lesen (ohne Rechteprüfung – für interne Dienste wie den Wochen-Reset). */
    moduleState(serverId: string, key: string): Promise<{
        enabled: boolean;
        settings: Record<string, unknown>;
    }>;
    private serverRole;
    listRoles(actor: Actor, serverId: string): Promise<({
        _count: {
            users: number;
        };
        permissions: {
            permissionKey: string;
            effect: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: string | null;
        description: string | null;
        priority: number;
        active: boolean;
        guildId: string | null;
        name: string;
        icon: string | null;
        discordRoleIds: string[];
        system: boolean;
    })[]>;
    createRole(actor: Actor, serverId: string, d: RoleInput & {
        name: string;
    }): Promise<{
        _count: {
            users: number;
        };
        permissions: {
            permissionKey: string;
            effect: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: string | null;
        description: string | null;
        priority: number;
        active: boolean;
        guildId: string | null;
        name: string;
        icon: string | null;
        discordRoleIds: string[];
        system: boolean;
    }>;
    updateRole(actor: Actor, serverId: string, roleId: string, d: RoleInput): Promise<{
        _count: {
            users: number;
        };
        permissions: {
            permissionKey: string;
            effect: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: string | null;
        description: string | null;
        priority: number;
        active: boolean;
        guildId: string | null;
        name: string;
        icon: string | null;
        discordRoleIds: string[];
        system: boolean;
    }>;
    deleteRole(actor: Actor, serverId: string, roleId: string): Promise<void>;
    permissionCatalog(actor: Actor, serverId: string): Promise<{
        key: import("@enrp/shared").PermissionKey;
        module: string;
        moduleEnabled: boolean;
    }[]>;
    rolePermissions(actor: Actor, serverId: string, roleId: string): Promise<{
        permission: string;
        effect: string;
    }[]>;
    /** Rechte einer Server-Rolle ersetzen. Delegationsregel (nur was man selbst auf DIESEM Server hat) und Rangfolge gelten. */
    setRolePermissions(actor: Actor, serverId: string, roleId: string, grants: {
        permission: string;
        effect: 'ALLOW' | 'DENY';
    }[]): Promise<{
        permission: string;
        effect: string;
    }[]>;
    /** Effektive Rechte eines Benutzers auf diesem Server – serverseitig berechnet. */
    effective(actor: Actor, serverId: string, userId: string): Promise<{
        serverId: string;
        guildId: string;
        userId: string;
        globalAdmin: boolean;
        membership: {
            status: string;
            source: string;
            lastVerifiedAt: Date | null;
        } | null;
        allowed: import("@enrp/shared").PermissionKey[];
        details: {
            permission: import("@enrp/shared").PermissionKey;
            module: string;
            allowed: boolean;
            source: import("@enrp/shared").ResolutionSource;
            blockedBy: import("../authz/authorization.service").DenyReason | null;
        }[];
    }>;
    roleMappings(actor: Actor, serverId: string): Promise<({
        role: {
            id: string;
            guildId: string | null;
            name: string;
        };
    } & {
        serverId: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        discordRoleId: string;
        roleId: string;
    })[]>;
    /**
     * Zuordnungen dieses Servers ersetzen. Zulässig: Rollen dieses Servers oder serverübergreifende Rollen – die Zuweisung gilt
     * trotzdem nur auf diesem Server. Nur Rollen unterhalb des eigenen Rangs.
     */
    setRoleMappings(actor: Actor, serverId: string, items: {
        discordRoleId: string;
        roleId: string;
    }[]): Promise<({
        role: {
            id: string;
            guildId: string | null;
            name: string;
        };
    } & {
        serverId: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        discordRoleId: string;
        roleId: string;
    })[]>;
    auditLogs(actor: Actor, serverId: string, q: {
        page: number;
        pageSize: number;
        action?: string;
    }): Promise<{
        items: {
            serverId: string | null;
            result: string;
            id: string;
            createdAt: Date;
            reason: string | null;
            entityId: string | null;
            module: string;
            entityType: string | null;
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
}
