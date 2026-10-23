import { z } from 'zod';
import type { Actor } from '../audit/audit.service';
import { ServersService } from './servers.service';
declare const createServer: z.ZodObject<{
    guildId: z.ZodString;
    name: z.ZodString;
}, "strict", z.ZodTypeAny, {
    guildId: string;
    name: string;
}, {
    guildId: string;
    name: string;
}>;
declare const patchServer: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["ACTIVE", "DISABLED"]>>;
    version: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    version: number;
    status?: "ACTIVE" | "DISABLED" | undefined;
    name?: string | undefined;
}, {
    version: number;
    status?: "ACTIVE" | "DISABLED" | undefined;
    name?: string | undefined;
}>;
declare const member: z.ZodObject<{
    userId: z.ZodString;
    member: z.ZodBoolean;
}, "strict", z.ZodTypeAny, {
    userId: string;
    member: boolean;
}, {
    userId: string;
    member: boolean;
}>;
declare const patchModule: z.ZodObject<{
    enabled: z.ZodOptional<z.ZodBoolean>;
    settings: z.ZodOptional<z.ZodUnknown>;
    version: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    version: number;
    enabled?: boolean | undefined;
    settings?: unknown;
}, {
    version: number;
    enabled?: boolean | undefined;
    settings?: unknown;
}>;
declare const createRole: z.ZodObject<{
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    color: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    icon: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    active: z.ZodOptional<z.ZodBoolean>;
    priority: z.ZodOptional<z.ZodNumber>;
    discordRoleIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    name: z.ZodString;
}, "strict", z.ZodTypeAny, {
    name: string;
    color?: string | null | undefined;
    description?: string | null | undefined;
    priority?: number | undefined;
    active?: boolean | undefined;
    icon?: string | null | undefined;
    discordRoleIds?: string[] | undefined;
}, {
    name: string;
    color?: string | null | undefined;
    description?: string | null | undefined;
    priority?: number | undefined;
    active?: boolean | undefined;
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
}, "strict", z.ZodTypeAny, {
    color?: string | null | undefined;
    description?: string | null | undefined;
    priority?: number | undefined;
    active?: boolean | undefined;
    name?: string | undefined;
    icon?: string | null | undefined;
    discordRoleIds?: string[] | undefined;
}, {
    color?: string | null | undefined;
    description?: string | null | undefined;
    priority?: number | undefined;
    active?: boolean | undefined;
    name?: string | undefined;
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
}, "strict", z.ZodTypeAny, {
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
declare const mappings: z.ZodObject<{
    mappings: z.ZodArray<z.ZodObject<{
        discordRoleId: z.ZodString;
        roleId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        discordRoleId: string;
        roleId: string;
    }, {
        discordRoleId: string;
        roleId: string;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    mappings: {
        discordRoleId: string;
        roleId: string;
    }[];
}, {
    mappings: {
        discordRoleId: string;
        roleId: string;
    }[];
}>;
declare const auditQuery: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
} & {
    action: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    action?: string | undefined;
    q?: string | undefined;
}, {
    action?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
/**
 * Server, Module, Rollen & Rechte je Server. Autorisierung im Service gegen den Server aus dem PFAD
 * (AuthorizationService: Mitgliedschaft, Modul, Recht) – Header oder Body können ihn nicht übersteuern.
 */
export declare class ServersController {
    private readonly s;
    constructor(s: ServersService);
    list(a: Actor): Promise<{
        guildId: string;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        name: string;
        archivedAt: Date | null;
        rolesInitializedAt: Date | null;
    }[]>;
    create(a: Actor, b: z.infer<typeof createServer>): Promise<{
        guildId: string;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        name: string;
        archivedAt: Date | null;
        rolesInitializedAt: Date | null;
    }>;
    get(a: Actor, id: string): Promise<{
        guildId: string;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        name: string;
        archivedAt: Date | null;
        rolesInitializedAt: Date | null;
    }>;
    patch(a: Actor, id: string, b: z.infer<typeof patchServer>): Promise<{
        guildId: string;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        name: string;
        archivedAt: Date | null;
        rolesInitializedAt: Date | null;
    }>;
    remove(a: Actor, id: string): Promise<{
        guildId: string;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        name: string;
        archivedAt: Date | null;
        rolesInitializedAt: Date | null;
    }>;
    members(a: Actor, id: string): Promise<({
        user: {
            id: string;
            username: string;
            displayName: string;
        };
    } & {
        serverId: string;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        source: string;
        userId: string;
        discordRoleIds: string[];
        lastVerifiedAt: Date | null;
    })[]>;
    setMember(a: Actor, id: string, b: z.infer<typeof member>): Promise<{
        serverId: string;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        source: string;
        userId: string;
        discordRoleIds: string[];
        lastVerifiedAt: Date | null;
    }>;
    modules(a: Actor, id: string): Promise<{
        key: string;
        name: string;
        description: string;
        system: boolean;
        dependsOn: string[];
        enabled: boolean;
        settings: Record<string, unknown>;
        version: number;
        updatedAt: Date | null;
        updatedById: string | null;
    }[]>;
    module(a: Actor, id: string, key: string): Promise<{
        key: string;
        name: string;
        description: string;
        system: boolean;
        dependsOn: string[];
        enabled: boolean;
        settings: Record<string, unknown>;
        version: number;
        updatedAt: Date | null;
        updatedById: string | null;
    }>;
    patchModule(a: Actor, id: string, key: string, b: z.infer<typeof patchModule>): Promise<{
        key: string;
        enabled: boolean;
        settings: import("@prisma/client/runtime/library").JsonValue;
        version: number;
        updatedAt: Date;
    }>;
    roles(a: Actor, id: string): Promise<({
        _count: {
            users: number;
        };
        permissions: {
            permissionKey: string;
            effect: string;
        }[];
    } & {
        guildId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: string | null;
        description: string | null;
        priority: number;
        active: boolean;
        name: string;
        icon: string | null;
        discordRoleIds: string[];
        system: boolean;
    })[]>;
    createRole(a: Actor, id: string, b: z.infer<typeof createRole>): Promise<{
        _count: {
            users: number;
        };
        permissions: {
            permissionKey: string;
            effect: string;
        }[];
    } & {
        guildId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: string | null;
        description: string | null;
        priority: number;
        active: boolean;
        name: string;
        icon: string | null;
        discordRoleIds: string[];
        system: boolean;
    }>;
    updateRole(a: Actor, id: string, roleId: string, b: z.infer<typeof updateRole>): Promise<{
        _count: {
            users: number;
        };
        permissions: {
            permissionKey: string;
            effect: string;
        }[];
    } & {
        guildId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: string | null;
        description: string | null;
        priority: number;
        active: boolean;
        name: string;
        icon: string | null;
        discordRoleIds: string[];
        system: boolean;
    }>;
    deleteRole(a: Actor, id: string, roleId: string): Promise<void>;
    permissions(a: Actor, id: string): Promise<{
        key: import("@enrp/shared").PermissionKey;
        module: string;
        moduleEnabled: boolean;
    }[]>;
    rolePermissions(a: Actor, id: string, roleId: string): Promise<{
        permission: string;
        effect: string;
    }[]>;
    setRolePermissions(a: Actor, id: string, roleId: string, b: z.infer<typeof grants>): Promise<{
        permission: string;
        effect: string;
    }[]>;
    effective(a: Actor, id: string, userId: string): Promise<{
        serverId: string;
        guildId: string;
        userId: string;
        globalAdmin: boolean;
        membership: {
            status: string;
            source: string;
            lastVerifiedAt: Date | null;
        } | null;
        allowed: import("@enrp/shared").PermissionKey[];
        details: {
            permission: import("@enrp/shared").PermissionKey;
            module: string;
            allowed: boolean;
            source: import("@enrp/shared").ResolutionSource;
            blockedBy: import("../authz/authorization.service").DenyReason | null;
        }[];
    }>;
    roleMappings(a: Actor, id: string): Promise<({
        role: {
            guildId: string | null;
            id: string;
            name: string;
        };
    } & {
        serverId: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        discordRoleId: string;
        roleId: string;
    })[]>;
    setRoleMappings(a: Actor, id: string, b: z.infer<typeof mappings>): Promise<({
        role: {
            guildId: string | null;
            id: string;
            name: string;
        };
    } & {
        serverId: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        discordRoleId: string;
        roleId: string;
    })[]>;
    audit(a: Actor, id: string, q: z.infer<typeof auditQuery>): Promise<{
        items: {
            serverId: string | null;
            result: string;
            id: string;
            createdAt: Date;
            reason: string | null;
            entityId: string | null;
            module: string;
            entityType: string | null;
            action: string;
            actorUserId: string | null;
            actorRobloxUserId: string | null;
            before: import("@prisma/client/runtime/library").JsonValue | null;
            after: import("@prisma/client/runtime/library").JsonValue | null;
            requestId: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
}
/** Für den Bot: abgeschaltete Module eines Servers (Befehle werden je Server danach registriert). Nur per Bot-Token. */
export declare class BotServersController {
    private readonly s;
    constructor(s: ServersService);
    modules(guildId: string): Promise<{
        registered: boolean;
        status: string;
        disabled: string[];
    }>;
}
export {};
