import { z } from 'zod';
import { RolesService } from './roles.service';
import type { Actor } from '../audit/audit.service';
declare const createRole: z.ZodObject<{
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    color: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    icon: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    active: z.ZodOptional<z.ZodBoolean>;
    priority: z.ZodOptional<z.ZodNumber>;
    discordRoleIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    name: z.ZodString;
    guildId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    active?: boolean | undefined;
    guildId?: string | null | undefined;
    description?: string | null | undefined;
    priority?: number | undefined;
    color?: string | null | undefined;
    icon?: string | null | undefined;
    discordRoleIds?: string[] | undefined;
}, {
    name: string;
    active?: boolean | undefined;
    guildId?: string | null | undefined;
    description?: string | null | undefined;
    priority?: number | undefined;
    color?: string | null | undefined;
    icon?: string | null | undefined;
    discordRoleIds?: string[] | undefined;
}>;
declare const updateRole: z.ZodObject<{
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    color: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    icon: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    active: z.ZodOptional<z.ZodBoolean>;
    priority: z.ZodOptional<z.ZodNumber>;
    discordRoleIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    name: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    active?: boolean | undefined;
    description?: string | null | undefined;
    priority?: number | undefined;
    color?: string | null | undefined;
    icon?: string | null | undefined;
    discordRoleIds?: string[] | undefined;
}, {
    name?: string | undefined;
    active?: boolean | undefined;
    description?: string | null | undefined;
    priority?: number | undefined;
    color?: string | null | undefined;
    icon?: string | null | undefined;
    discordRoleIds?: string[] | undefined;
}>;
declare const grants: z.ZodObject<{
    grants: z.ZodArray<z.ZodObject<{
        permission: z.ZodString;
        effect: z.ZodEnum<["ALLOW", "DENY"]>;
    }, "strip", z.ZodTypeAny, {
        permission: string;
        effect: "DENY" | "ALLOW";
    }, {
        permission: string;
        effect: "DENY" | "ALLOW";
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    grants: {
        permission: string;
        effect: "DENY" | "ALLOW";
    }[];
}, {
    grants: {
        permission: string;
        effect: "DENY" | "ALLOW";
    }[];
}>;
declare const single: z.ZodObject<{
    permission: z.ZodString;
    effect: z.ZodEnum<["ALLOW", "DENY", "NONE"]>;
}, "strip", z.ZodTypeAny, {
    permission: string;
    effect: "DENY" | "ALLOW" | "NONE";
}, {
    permission: string;
    effect: "DENY" | "ALLOW" | "NONE";
}>;
declare const order: z.ZodObject<{
    ids: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    ids: string[];
}, {
    ids: string[];
}>;
declare const dup: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
}, {
    name?: string | undefined;
}>;
export declare class RolesController {
    private readonly roles;
    constructor(roles: RolesService);
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
        name: string;
        active: boolean;
        updatedAt: Date;
        guildId: string | null;
        description: string | null;
        system: boolean;
        priority: number;
        color: string | null;
        icon: string | null;
        discordRoleIds: string[];
    })[]>;
    myRank(a: Actor): Promise<{
        rank: number;
    }>;
    catalog(): readonly import("@enrp/shared").PermissionKey[];
    create(a: Actor, b: z.infer<typeof createRole>): Promise<{
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
        name: string;
        active: boolean;
        updatedAt: Date;
        guildId: string | null;
        description: string | null;
        system: boolean;
        priority: number;
        color: string | null;
        icon: string | null;
        discordRoleIds: string[];
    }>;
    reorder(a: Actor, b: z.infer<typeof order>): Promise<({
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
        name: string;
        active: boolean;
        updatedAt: Date;
        guildId: string | null;
        description: string | null;
        system: boolean;
        priority: number;
        color: string | null;
        icon: string | null;
        discordRoleIds: string[];
    })[]>;
    update(a: Actor, id: string, b: z.infer<typeof updateRole>): Promise<{
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
        name: string;
        active: boolean;
        updatedAt: Date;
        guildId: string | null;
        description: string | null;
        system: boolean;
        priority: number;
        color: string | null;
        icon: string | null;
        discordRoleIds: string[];
    }>;
    remove(a: Actor, id: string): Promise<void>;
    duplicate(a: Actor, id: string, b: z.infer<typeof dup>): Promise<{
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
        name: string;
        active: boolean;
        updatedAt: Date;
        guildId: string | null;
        description: string | null;
        system: boolean;
        priority: number;
        color: string | null;
        icon: string | null;
        discordRoleIds: string[];
    }>;
    setPermissions(a: Actor, id: string, b: z.infer<typeof grants>): Promise<{
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
        name: string;
        active: boolean;
        updatedAt: Date;
        guildId: string | null;
        description: string | null;
        system: boolean;
        priority: number;
        color: string | null;
        icon: string | null;
        discordRoleIds: string[];
    }>;
    setPermission(a: Actor, id: string, b: z.infer<typeof single>): Promise<{
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
        name: string;
        active: boolean;
        updatedAt: Date;
        guildId: string | null;
        description: string | null;
        system: boolean;
        priority: number;
        color: string | null;
        icon: string | null;
        discordRoleIds: string[];
    }>;
}
export {};
