import { z } from 'zod';
import { UsersService } from './users.service';
import { TwoFactorService } from '../auth/two-factor.service';
import type { Actor } from '../audit/audit.service';
import { pageQuery } from '../common/pagination';
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
    list(q: z.infer<typeof pageQuery>): Promise<{
        items: {
            robloxUserId: string | null;
            id: string;
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
                    name: string;
                    id: string;
                    guildId: string | null;
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
        robloxUserId: string | null;
        id: string;
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
                name: string;
                id: string;
                guildId: string | null;
            };
        }[];
        overrides: {
            reason: string | null;
            guildId: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    create(a: Actor, b: z.infer<typeof createUser>): Promise<{
        robloxUserId: string | null;
        id: string;
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
                name: string;
                id: string;
                guildId: string | null;
            };
        }[];
        overrides: {
            reason: string | null;
            guildId: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    setRoblox(a: Actor, id: string, b: z.infer<typeof roblox>): Promise<{
        robloxUserId: string | null;
        id: string;
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
                name: string;
                id: string;
                guildId: string | null;
            };
        }[];
        overrides: {
            reason: string | null;
            guildId: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    setActive(a: Actor, id: string, b: z.infer<typeof active>): Promise<{
        robloxUserId: string | null;
        id: string;
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
                name: string;
                id: string;
                guildId: string | null;
            };
        }[];
        overrides: {
            reason: string | null;
            guildId: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    /** Zwei-Faktor eines Kontos zurücksetzen (Handy verloren, keine Wiederherstellungscodes). */
    resetTwoFactor(a: Actor, id: string): Promise<void>;
    remove(a: Actor, id: string): Promise<void>;
    setName(a: Actor, id: string, b: z.infer<typeof nameBody>): Promise<{
        robloxUserId: string | null;
        id: string;
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
                name: string;
                id: string;
                guildId: string | null;
            };
        }[];
        overrides: {
            reason: string | null;
            guildId: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    setRoles(a: Actor, id: string, b: z.infer<typeof roles>): Promise<{
        robloxUserId: string | null;
        id: string;
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
                name: string;
                id: string;
                guildId: string | null;
            };
        }[];
        overrides: {
            reason: string | null;
            guildId: string | null;
            permissionKey: string;
            effect: string;
        }[];
    }>;
    setOverride(a: Actor, id: string, b: z.infer<typeof override>): Promise<{
        userId: string;
        id: string;
        createdById: string | null;
        createdAt: Date;
        reason: string | null;
        guildId: string | null;
        permissionKey: string;
        effect: string;
    }>;
    removeOverride(a: Actor, id: string, p: string): Promise<void>;
}
export {};
