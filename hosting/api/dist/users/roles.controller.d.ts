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
    description?: string | null | undefined;
    priority?: number | undefined;
    active?: boolean | undefined;
    color?: string | null | undefined;
    icon?: string | null | undefined;
    discordRoleIds?: string[] | undefined;
    guildId?: string | null | undefined;
}, {
    name: string;
    description?: string | null | undefined;
    priority?: number | undefined;
    active?: boolean | undefined;
    color?: string | null | undefined;
    icon?: string | null | undefined;
    discordRoleIds?: string[] | undefined;
    guildId?: string | null | undefined;
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
    description?: string | null | undefined;
    priority?: number | undefined;
    active?: boolean | undefined;
    name?: string | undefined;
    color?: string | null | undefined;
    icon?: string | null | undefined;
    discordRoleIds?: string[] | undefined;
}, {
    description?: string | null | undefined;
    priority?: number | undefined;
    active?: boolean | undefined;
    name?: string | undefined;
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
}
export {};
