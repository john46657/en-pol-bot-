import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
export declare class RolesService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    list(): import("@prisma/client").Prisma.PrismaPromise<({
        permissions: {
            permissionKey: string;
            effect: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        name: string;
        description: string | null;
        updatedAt: Date;
        system: boolean;
    })[]>;
    catalog(): readonly import("@enrp/shared").PermissionKey[];
    create(actor: Actor, d: {
        name: string;
        description?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        description: string | null;
        updatedAt: Date;
        system: boolean;
    }>;
    setPermissions(actor: Actor, id: string, grants: {
        permission: string;
        effect: 'ALLOW' | 'DENY';
    }[]): Promise<{
        permissions: {
            permissionKey: string;
            effect: string;
            roleId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        name: string;
        description: string | null;
        updatedAt: Date;
        system: boolean;
    }>;
}
