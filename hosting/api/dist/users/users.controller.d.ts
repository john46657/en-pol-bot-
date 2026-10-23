import { z } from 'zod';
import { UsersService } from './users.service';
import { TwoFactorService } from '../auth/two-factor.service';
import type { Actor } from '../audit/audit.service';
declare const passwordBody: z.ZodObject<{
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    password: string;
}, {
    password: string;
}>;
export declare const nameBody: z.ZodObject<{
    displayName: z.ZodString;
}, "strip", z.ZodTypeAny, {
    displayName: string;
}, {
    displayName: string;
}>;
declare const createUser: z.ZodObject<{
    username: z.ZodString;
    displayName: z.ZodString;
    password: z.ZodString;
    email: z.ZodOptional<z.ZodString>;
    roleIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    username: string;
    displayName: string;
    password: string;
    roleIds?: string[] | undefined;
    email?: string | undefined;
}, {
    username: string;
    displayName: string;
    password: string;
    roleIds?: string[] | undefined;
    email?: string | undefined;
}>;
declare const roblox: z.ZodObject<{
    robloxUserId: z.ZodNullable<z.ZodString>;
    robloxUsername: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    robloxUserId: string | null;
    robloxUsername?: string | undefined;
}, {
    robloxUserId: string | null;
    robloxUsername?: string | undefined;
}>;
declare const active: z.ZodObject<{
    active: z.ZodBoolean;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    active: boolean;
    reason?: string | undefined;
}, {
    active: boolean;
    reason?: string | undefined;
}>;
declare const roles: z.ZodObject<{
    roleIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    roleIds: string[];
}, {
    roleIds: string[];
}>;
declare const listQuery: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
} & {
    status: z.ZodOptional<z.ZodEnum<["active", "inactive"]>>;
    roleId: z.ZodOptional<z.ZodString>;
    linked: z.ZodOptional<z.ZodEnum<["yes", "no"]>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    status?: "active" | "inactive" | undefined;
    roleId?: string | undefined;
    q?: string | undefined;
    linked?: "yes" | "no" | undefined;
}, {
    status?: "active" | "inactive" | undefined;
    roleId?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
    linked?: "yes" | "no" | undefined;
}>;
declare const override: z.ZodObject<{
    permission: z.ZodString;
    effect: z.ZodEnum<["ALLOW", "DENY"]>;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    permission: string;
    effect: "DENY" | "ALLOW";
    reason?: string | undefined;
}, {
    permission: string;
    effect: "DENY" | "ALLOW";
    reason?: string | undefined;
}>;
export declare class UsersController {
    private readonly users;
    private readonly twoFactor;
    constructor(users: UsersService, twoFactor: TwoFactorService);
    list(q: z.infer<typeof listQuery>): Promise<{
        items: {
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
                    guildId: string | null;
                    id: string;
                    color: string | null;
                    priority: number;
                    active: boolean;
                    name: string;
                    icon: string | null;
                };
                guildIds: string[];
            }[];
            overrides: {
                guildId: string | null;
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
        discord: {
            discordId: string;
            linkedAt: Date;
        } | null;
        rank: number | null;
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
                guildId: string | null;
                id: string;
                color: string | null;
                priority: number;
                active: boolean;
                name: string;
                icon: string | null;
            };
            guildIds: string[];
        }[];
        overrides: {
            guildId: string | null;
            reason: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    /** Effektive Rechte im gewählten Server mit Herkunft (Sonderrecht / Rolle / Standard). */
    permissions(id: string): Promise<{
        roles: {
            id: string;
            color: string | null;
            priority: number;
            name: string;
            icon: string | null;
        }[];
        entries: {
            key: import("@enrp/shared").PermissionKey;
            allowed: boolean;
            source: import("@enrp/shared").ResolutionSource;
            via: string[];
        }[];
    }>;
    create(a: Actor, b: z.infer<typeof createUser>): Promise<{
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
                guildId: string | null;
                id: string;
                color: string | null;
                priority: number;
                active: boolean;
                name: string;
                icon: string | null;
            };
            guildIds: string[];
        }[];
        overrides: {
            guildId: string | null;
            reason: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    setRoblox(a: Actor, id: string, b: z.infer<typeof roblox>): Promise<{
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
                guildId: string | null;
                id: string;
                color: string | null;
                priority: number;
                active: boolean;
                name: string;
                icon: string | null;
            };
            guildIds: string[];
        }[];
        overrides: {
            guildId: string | null;
            reason: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    setPassword(a: Actor, id: string, b: z.infer<typeof passwordBody>): Promise<void>;
    setActive(a: Actor, id: string, b: z.infer<typeof active>): Promise<{
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
                guildId: string | null;
                id: string;
                color: string | null;
                priority: number;
                active: boolean;
                name: string;
                icon: string | null;
            };
            guildIds: string[];
        }[];
        overrides: {
            guildId: string | null;
            reason: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    /** Zwei-Faktor eines Kontos zurücksetzen (Handy verloren, keine Wiederherstellungscodes). */
    resetTwoFactor(a: Actor, id: string): Promise<void>;
    remove(a: Actor, id: string): Promise<void>;
    setName(a: Actor, id: string, b: z.infer<typeof nameBody>): Promise<{
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
                guildId: string | null;
                id: string;
                color: string | null;
                priority: number;
                active: boolean;
                name: string;
                icon: string | null;
            };
            guildIds: string[];
        }[];
        overrides: {
            guildId: string | null;
            reason: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    setRoles(a: Actor, id: string, b: z.infer<typeof roles>): Promise<{
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
                guildId: string | null;
                id: string;
                color: string | null;
                priority: number;
                active: boolean;
                name: string;
                icon: string | null;
            };
            guildIds: string[];
        }[];
        overrides: {
            guildId: string | null;
            reason: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    setOverride(a: Actor, id: string, b: z.infer<typeof override>): Promise<{
        guildId: string | null;
        id: string;
        createdById: string | null;
        createdAt: Date;
        reason: string | null;
        userId: string;
        permissionKey: string;
        effect: string;
    }>;
    removeOverride(a: Actor, id: string, p: string): Promise<void>;
}
export {};
