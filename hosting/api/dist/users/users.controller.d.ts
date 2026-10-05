import { z } from 'zod';
import { UsersService } from './users.service';
import type { Actor } from '../audit/audit.service';
import { pageQuery } from '../common/pagination';
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
    constructor(users: UsersService);
    list(q: z.infer<typeof pageQuery>): Promise<{
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
    create(a: Actor, b: z.infer<typeof createUser>): Promise<{
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
    setRoblox(a: Actor, id: string, b: z.infer<typeof roblox>): Promise<{
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
    setActive(a: Actor, id: string, b: z.infer<typeof active>): Promise<{
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
    setRoles(a: Actor, id: string, b: z.infer<typeof roles>): Promise<{
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
    setOverride(a: Actor, id: string, b: z.infer<typeof override>): Promise<{
        id: string;
        userId: string;
        permissionKey: string;
        effect: string;
        reason: string | null;
        createdById: string | null;
        createdAt: Date;
    }>;
    removeOverride(a: Actor, id: string, p: string): Promise<void>;
}
export {};
