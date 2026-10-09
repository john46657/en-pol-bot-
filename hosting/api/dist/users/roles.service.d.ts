import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { RealtimeService } from '../realtime/realtime.service';
export declare const ADMIN_ROLE = "System Administrator";
type Effect = 'ALLOW' | 'DENY';
export interface RoleInput {
    guildId?: string | null;
    name?: string;
    description?: string | null;
    color?: string | null;
    icon?: string | null;
    active?: boolean;
    priority?: number;
    discordRoleIds?: string[];
}
/**
 * Rollen & Rechte. Grundregeln (serverseitig, unabhängig von der Oberfläche):
 * - nur Rollen strikt unterhalb des eigenen Rangs bearbeiten, vergeben, löschen, verschieben
 * - nur Rechte erlauben, die man selbst besitzt
 * - der Systemadministrator (Serverbesitzer) ist nicht über das Dashboard änderbar
 * Jede Rechteänderung wird einzeln im Audit-Log festgehalten (Modul `permissions`).
 */
export declare class RolesService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    private readonly rt;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, rt: RealtimeService);
    /** Nach jeder Änderung: alle Dashboards laden ihre Rechte neu (die API prüft ohnehin bei jeder Anfrage). */
    private changed;
    /** Im Server-Kontext: Rollen dieses Servers und serverübergreifende; unter „Alle Server“: alle. */
    list(): import("@prisma/client").Prisma.PrismaPromise<({
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
        description: string | null;
        priority: number;
        active: boolean;
        name: string;
        system: boolean;
        color: string | null;
        icon: string | null;
        discordRoleIds: string[];
        guildId: string | null;
    })[]>;
    catalog(): readonly import("@enrp/shared").PermissionKey[];
    /** Eigener Rang (für die Oberfläche: welche Rollen sind bearbeitbar). */
    myRank(userId: string): Promise<{
        rank: number;
    }>;
    private load;
    private guard;
    private assertPriority;
    private uniqueName;
    create(actor: Actor, d: RoleInput & {
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
        description: string | null;
        priority: number;
        active: boolean;
        name: string;
        system: boolean;
        color: string | null;
        icon: string | null;
        discordRoleIds: string[];
        guildId: string | null;
    }>;
    update(actor: Actor, id: string, d: RoleInput): Promise<{
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
        description: string | null;
        priority: number;
        active: boolean;
        name: string;
        system: boolean;
        color: string | null;
        icon: string | null;
        discordRoleIds: string[];
        guildId: string | null;
    }>;
    remove(actor: Actor, id: string): Promise<void>;
    /** Kopie einer Rolle (ohne Mitglieder und ohne Discord-Verknüpfung), direkt unterhalb des Originals. */
    duplicate(actor: Actor, id: string, name?: string): Promise<{
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
        description: string | null;
        priority: number;
        active: boolean;
        name: string;
        system: boolean;
        color: string | null;
        icon: string | null;
        discordRoleIds: string[];
        guildId: string | null;
    }>;
    /** Reihenfolge der eigenen, verwaltbaren Rollen setzen (oberste zuerst). Nicht genannte Rollen bleiben, wie sie sind. */
    reorder(actor: Actor, ids: string[]): Promise<({
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
        description: string | null;
        priority: number;
        active: boolean;
        name: string;
        system: boolean;
        color: string | null;
        icon: string | null;
        discordRoleIds: string[];
        guildId: string | null;
    })[]>;
    /** Alle Rechte einer Rolle auf einmal (Rollen-Editor). Geändert wird nur der Unterschied; jede Änderung einzeln protokolliert. */
    setPermissions(actor: Actor, id: string, grants: {
        permission: string;
        effect: Effect;
    }[]): Promise<{
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
        description: string | null;
        priority: number;
        active: boolean;
        name: string;
        system: boolean;
        color: string | null;
        icon: string | null;
        discordRoleIds: string[];
        guildId: string | null;
    }>;
    /** Ein einzelnes Recht setzen (Matrix, automatisches Speichern). `NONE` = nicht gesetzt. */
    setPermission(actor: Actor, id: string, permission: string, effect: Effect | 'NONE'): Promise<{
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
        description: string | null;
        priority: number;
        active: boolean;
        name: string;
        system: boolean;
        color: string | null;
        icon: string | null;
        discordRoleIds: string[];
        guildId: string | null;
    }>;
    private apply;
}
export {};
