import { z } from 'zod';
import { RolesService } from './roles.service';
import type { Actor } from '../audit/audit.service';
declare const createRole: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description?: string | undefined;
}, {
    name: string;
    description?: string | undefined;
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
export declare class RolesController {
    private readonly roles;
    constructor(roles: RolesService);
    list(): import("@prisma/client").Prisma.PrismaPromise<({
        permissions: {
            permissionKey: string;
            effect: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        description: string | null;
        system: boolean;
    })[]>;
    catalog(): readonly import("@enrp/shared").PermissionKey[];
    create(a: Actor, b: z.infer<typeof createRole>): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        description: string | null;
        system: boolean;
    }>;
    setPermissions(a: Actor, id: string, b: z.infer<typeof grants>): Promise<{
        permissions: {
            permissionKey: string;
            effect: string;
            roleId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        description: string | null;
        system: boolean;
    }>;
}
export {};
