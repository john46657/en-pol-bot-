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
            createdAt: Date;
            username: string;
            email: string | null;
            robloxUserId: string | null;
            displayName: string;
            robloxUsername: string | null;
            robloxStatus: string;
            robloxVerifiedAt: Date | null;
            active: boolean;
            lastLogin: Date | null;
            totpEnabledAt: Date | null;
            updatedAt: Date;
            roles: {
                role: {
                    id: string;
                    name: string;
                };
            }[];
            overrides: {
                reason: string | null;
                permissionKey: string;
                effect: string;
            }[];
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        id: string;
        createdAt: Date;
        username: string;
        email: string | null;
        robloxUserId: string | null;
        displayName: string;
        robloxUsername: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        active: boolean;
        lastLogin: Date | null;
        totpEnabledAt: Date | null;
        updatedAt: Date;
        roles: {
            role: {
                id: string;
                name: string;
            };
        }[];
        overrides: {
            reason: string | null;
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
        createdAt: Date;
        username: string;
        email: string | null;
        robloxUserId: string | null;
        displayName: string;
        robloxUsername: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        active: boolean;
        lastLogin: Date | null;
        totpEnabledAt: Date | null;
        updatedAt: Date;
        roles: {
            role: {
                id: string;
                name: string;
            };
        }[];
        overrides: {
            reason: string | null;
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
        createdAt: Date;
        username: string;
        email: string | null;
        robloxUserId: string | null;
        displayName: string;
        robloxUsername: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        active: boolean;
        lastLogin: Date | null;
        totpEnabledAt: Date | null;
        updatedAt: Date;
        roles: {
            role: {
                id: string;
                name: string;
            };
        }[];
        overrides: {
            reason: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    setActive(actor: Actor, id: string, active: boolean, reason?: string): Promise<{
        id: string;
        createdAt: Date;
        username: string;
        email: string | null;
        robloxUserId: string | null;
        displayName: string;
        robloxUsername: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        active: boolean;
        lastLogin: Date | null;
        totpEnabledAt: Date | null;
        updatedAt: Date;
        roles: {
            role: {
                id: string;
                name: string;
            };
        }[];
        overrides: {
            reason: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    /** Zwei-Faktor zurücksetzen (Handy verloren, keine Wiederherstellungscodes). Beendet alle Sessions des Benutzers. */
    resetTwoFactor(actor: Actor, id: string, reason?: string): Promise<{
        id: string;
        createdAt: Date;
        username: string;
        email: string | null;
        robloxUserId: string | null;
        displayName: string;
        robloxUsername: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        active: boolean;
        lastLogin: Date | null;
        totpEnabledAt: Date | null;
        updatedAt: Date;
        roles: {
            role: {
                id: string;
                name: string;
            };
        }[];
        overrides: {
            reason: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    setRoles(actor: Actor, id: string, roleIds: string[]): Promise<{
        id: string;
        createdAt: Date;
        username: string;
        email: string | null;
        robloxUserId: string | null;
        displayName: string;
        robloxUsername: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        active: boolean;
        lastLogin: Date | null;
        totpEnabledAt: Date | null;
        updatedAt: Date;
        roles: {
            role: {
                id: string;
                name: string;
            };
        }[];
        overrides: {
            reason: string | null;
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
        reason: string | null;
        createdAt: Date;
        userId: string;
        permissionKey: string;
        effect: string;
        createdById: string | null;
    }>;
    removeOverride(actor: Actor, id: string, permission: string): Promise<void>;
}
