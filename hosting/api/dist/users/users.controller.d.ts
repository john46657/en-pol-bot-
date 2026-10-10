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
    email?: string | undefined;
    roleIds?: string[] | undefined;
}, {
    username: string;
    displayName: string;
    password: string;
    email?: string | undefined;
    roleIds?: string[] | undefined;
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
            id: string;
            createdAt: Date;
            updatedAt: Date;
            username: string;
            displayName: string;
            email: string | null;
            robloxUserId: string | null;
            robloxUsername: string | null;
            robloxStatus: string;
            robloxVerifiedAt: Date | null;
            active: boolean;
            lastLogin: Date | null;
            totpEnabledAt: Date | null;
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
        updatedAt: Date;
        username: string;
        displayName: string;
        email: string | null;
        robloxUserId: string | null;
        robloxUsername: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        active: boolean;
        lastLogin: Date | null;
        totpEnabledAt: Date | null;
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
    create(a: Actor, b: z.infer<typeof createUser>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        username: string;
        displayName: string;
        email: string | null;
        robloxUserId: string | null;
        robloxUsername: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        active: boolean;
        lastLogin: Date | null;
        totpEnabledAt: Date | null;
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
    setRoblox(a: Actor, id: string, b: z.infer<typeof roblox>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        username: string;
        displayName: string;
        email: string | null;
        robloxUserId: string | null;
        robloxUsername: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        active: boolean;
        lastLogin: Date | null;
        totpEnabledAt: Date | null;
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
    setActive(a: Actor, id: string, b: z.infer<typeof active>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        username: string;
        displayName: string;
        email: string | null;
        robloxUserId: string | null;
        robloxUsername: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        active: boolean;
        lastLogin: Date | null;
        totpEnabledAt: Date | null;
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
    /** Zwei-Faktor eines Kontos zurücksetzen (Handy verloren, keine Wiederherstellungscodes). */
    resetTwoFactor(a: Actor, id: string): Promise<void>;
    setName(a: Actor, id: string, b: z.infer<typeof nameBody>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        username: string;
        displayName: string;
        email: string | null;
        robloxUserId: string | null;
        robloxUsername: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        active: boolean;
        lastLogin: Date | null;
        totpEnabledAt: Date | null;
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
    setRoles(a: Actor, id: string, b: z.infer<typeof roles>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        username: string;
        displayName: string;
        email: string | null;
        robloxUserId: string | null;
        robloxUsername: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        active: boolean;
        lastLogin: Date | null;
        totpEnabledAt: Date | null;
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
    setOverride(a: Actor, id: string, b: z.infer<typeof override>): Promise<{
        id: string;
        createdAt: Date;
        reason: string | null;
        createdById: string | null;
        userId: string;
        permissionKey: string;
        effect: string;
    }>;
    removeOverride(a: Actor, id: string, p: string): Promise<void>;
}
export {};
