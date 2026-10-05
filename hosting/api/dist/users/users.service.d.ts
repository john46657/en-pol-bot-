import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { PermissionService } from '../authz/permission.service';
import { PageQuery } from '../common/pagination';
export declare class UsersService {
    private readonly prisma;
    private readonly audit;
    private readonly auth;
    private readonly perms;
    constructor(prisma: PrismaService, audit: AuditService, auth: AuthService, perms: PermissionService);
    /** Rollen-/Rechteänderungen an sich selbst sind verboten (Vier-Augen-Prinzip, verhindert Selbst-Eskalation). */
    private assertNotSelf;
    /** Mindestens ein aktiver System Administrator muss bestehen bleiben. */
    private assertAdminRemains;
    list(p: PageQuery): Promise<{
        items: {
            id: string;
            createdAt: Date;
            roles: {
                role: {
                    id: string;
                    name: string;
                };
            }[];
            overrides: {
                permissionKey: string;
                effect: string;
                reason: string | null;
            }[];
            username: string;
            email: string | null;
            robloxUserId: string | null;
            displayName: string;
            robloxUsername: string | null;
            robloxStatus: string;
            robloxVerifiedAt: Date | null;
            active: boolean;
            lastLogin: Date | null;
            updatedAt: Date;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        id: string;
        createdAt: Date;
        roles: {
            role: {
                id: string;
                name: string;
            };
        }[];
        overrides: {
            permissionKey: string;
            effect: string;
            reason: string | null;
        }[];
        username: string;
        email: string | null;
        robloxUserId: string | null;
        displayName: string;
        robloxUsername: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        active: boolean;
        lastLogin: Date | null;
        updatedAt: Date;
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
        roles: {
            role: {
                id: string;
                name: string;
            };
        }[];
        overrides: {
            permissionKey: string;
            effect: string;
            reason: string | null;
        }[];
        username: string;
        email: string | null;
        robloxUserId: string | null;
        displayName: string;
        robloxUsername: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        active: boolean;
        lastLogin: Date | null;
        updatedAt: Date;
    }>;
    /** Manuelle Roblox-ID-Hinterlegung durch Administratoren. Keine Identität wird geraten. */
    setRoblox(actor: Actor, id: string, d: {
        robloxUserId: string | null;
        robloxUsername?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        roles: {
            role: {
                id: string;
                name: string;
            };
        }[];
        overrides: {
            permissionKey: string;
            effect: string;
            reason: string | null;
        }[];
        username: string;
        email: string | null;
        robloxUserId: string | null;
        displayName: string;
        robloxUsername: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        active: boolean;
        lastLogin: Date | null;
        updatedAt: Date;
    }>;
    setActive(actor: Actor, id: string, active: boolean, reason?: string): Promise<{
        id: string;
        createdAt: Date;
        roles: {
            role: {
                id: string;
                name: string;
            };
        }[];
        overrides: {
            permissionKey: string;
            effect: string;
            reason: string | null;
        }[];
        username: string;
        email: string | null;
        robloxUserId: string | null;
        displayName: string;
        robloxUsername: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        active: boolean;
        lastLogin: Date | null;
        updatedAt: Date;
    }>;
    setRoles(actor: Actor, id: string, roleIds: string[]): Promise<{
        id: string;
        createdAt: Date;
        roles: {
            role: {
                id: string;
                name: string;
            };
        }[];
        overrides: {
            permissionKey: string;
            effect: string;
            reason: string | null;
        }[];
        username: string;
        email: string | null;
        robloxUserId: string | null;
        displayName: string;
        robloxUsername: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        active: boolean;
        lastLogin: Date | null;
        updatedAt: Date;
    }>;
    setOverride(actor: Actor, id: string, d: {
        permission: string;
        effect: 'ALLOW' | 'DENY';
        reason?: string;
    }): Promise<{
        id: string;
        userId: string;
        permissionKey: string;
        effect: string;
        reason: string | null;
        createdById: string | null;
        createdAt: Date;
    }>;
    removeOverride(actor: Actor, id: string, permission: string): Promise<void>;
}
