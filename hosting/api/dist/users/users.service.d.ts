import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { PermissionService } from '../authz/permission.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PageQuery } from '../common/pagination';
export declare class UsersService {
    private readonly prisma;
    private readonly audit;
    private readonly auth;
    private readonly perms;
    private readonly rt;
    constructor(prisma: PrismaService, audit: AuditService, auth: AuthService, perms: PermissionService, rt: RealtimeService);
    /** Rollen-/Rechteänderungen an sich selbst sind verboten (Vier-Augen-Prinzip, verhindert Selbst-Eskalation). */
    private assertNotSelf;
    /** Mindestens ein aktiver System Administrator muss bestehen bleiben. */
    private assertAdminRemains;
    list(p: PageQuery): Promise<{
        items: {
            id: string;
            robloxUserId: string | null;
            robloxUsername: string | null;
            createdAt: Date;
            updatedAt: Date;
            active: boolean;
            username: string;
            displayName: string;
            email: string | null;
            robloxStatus: string;
            robloxVerifiedAt: Date | null;
            lastLogin: Date | null;
            totpEnabledAt: Date | null;
            roles: {
                role: {
                    id: string;
                    guildId: string | null;
                    name: string;
                };
            }[];
            overrides: {
                reason: string | null;
                guildId: string | null;
                permissionKey: string;
                effect: string;
            }[];
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        discord: {
            discordId: string;
            linkedAt: Date;
        } | null;
        id: string;
        robloxUserId: string | null;
        robloxUsername: string | null;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        username: string;
        displayName: string;
        email: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        lastLogin: Date | null;
        totpEnabledAt: Date | null;
        roles: {
            role: {
                id: string;
                guildId: string | null;
                name: string;
            };
        }[];
        overrides: {
            reason: string | null;
            guildId: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    create(actor: Actor, d: {
        username: string;
        displayName: string;
        password: string;
        email?: string;
        roleIds?: string[];
    }): Promise<{
        id: string;
        robloxUserId: string | null;
        robloxUsername: string | null;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        username: string;
        displayName: string;
        email: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        lastLogin: Date | null;
        totpEnabledAt: Date | null;
        roles: {
            role: {
                id: string;
                guildId: string | null;
                name: string;
            };
        }[];
        overrides: {
            reason: string | null;
            guildId: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    /** Manuelle Roblox-ID-Hinterlegung durch Administratoren. Keine Identität wird geraten. */
    setRoblox(actor: Actor, id: string, d: {
        robloxUserId: string | null;
        robloxUsername?: string;
    }): Promise<{
        id: string;
        robloxUserId: string | null;
        robloxUsername: string | null;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        username: string;
        displayName: string;
        email: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        lastLogin: Date | null;
        totpEnabledAt: Date | null;
        roles: {
            role: {
                id: string;
                guildId: string | null;
                name: string;
            };
        }[];
        overrides: {
            reason: string | null;
            guildId: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    /** Anzeigename ändern – den eigenen immer, fremde nur unterhalb des eigenen Rangs (users.manage). */
    setName(actor: Actor, id: string, displayName: string): Promise<{
        id: string;
        robloxUserId: string | null;
        robloxUsername: string | null;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        username: string;
        displayName: string;
        email: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        lastLogin: Date | null;
        totpEnabledAt: Date | null;
        roles: {
            role: {
                id: string;
                guildId: string | null;
                name: string;
            };
        }[];
        overrides: {
            reason: string | null;
            guildId: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    /**
     * Konto endgültig löschen (users.manage): nicht das eigene, nur unterhalb des eigenen Rangs, der letzte aktive
     * System Administrator bleibt. Sitzungen, Rollen, Personalakte usw. gehen mit; im Audit-Log bleibt festgehalten, wer gelöscht wurde.
     */
    remove(actor: Actor, id: string): Promise<void>;
    setActive(actor: Actor, id: string, active: boolean, reason?: string): Promise<{
        id: string;
        robloxUserId: string | null;
        robloxUsername: string | null;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        username: string;
        displayName: string;
        email: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        lastLogin: Date | null;
        totpEnabledAt: Date | null;
        roles: {
            role: {
                id: string;
                guildId: string | null;
                name: string;
            };
        }[];
        overrides: {
            reason: string | null;
            guildId: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    /**
     * Rollen eines Benutzers setzen – NUR im Bereich der Anfrage: mit gewähltem Server die Rollen dieses Servers, unter
     * „Alle Server“ die serverübergreifenden. Rollen anderer Server bleiben unberührt (Server sind getrennt).
     */
    setRoles(actor: Actor, id: string, roleIds: string[]): Promise<{
        id: string;
        robloxUserId: string | null;
        robloxUsername: string | null;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        username: string;
        displayName: string;
        email: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        lastLogin: Date | null;
        totpEnabledAt: Date | null;
        roles: {
            role: {
                id: string;
                guildId: string | null;
                name: string;
            };
        }[];
        overrides: {
            reason: string | null;
            guildId: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    setOverride(actor: Actor, id: string, d: {
        permission: string;
        effect: 'ALLOW' | 'DENY';
        reason?: string;
    }): Promise<{
        id: string;
        createdById: string | null;
        createdAt: Date;
        reason: string | null;
        userId: string;
        guildId: string | null;
        permissionKey: string;
        effect: string;
    }>;
    removeOverride(actor: Actor, id: string, permission: string): Promise<void>;
}
