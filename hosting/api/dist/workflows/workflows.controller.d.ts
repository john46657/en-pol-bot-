import type { Actor } from '../audit/audit.service';
import { WorkflowsService, type WorkflowInput } from './workflows.service';
export declare class WorkflowsController {
    private readonly s;
    constructor(s: WorkflowsService);
    list(): import("@prisma/client").Prisma.PrismaPromise<({
        _count: {
            runs: number;
        };
        runs: {
            error: string | null;
            createdAt: Date;
            ok: boolean;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        name: string;
        enabled: boolean;
        trigger: string;
        conditions: import("@prisma/client/runtime/library").JsonValue;
        actions: import("@prisma/client/runtime/library").JsonValue;
        activeSince: Date;
    })[]>;
    runs(id: string): import("@prisma/client").Prisma.PrismaPromise<{
        error: string | null;
        id: string;
        createdAt: Date;
        entityId: string | null;
        action: string;
        ok: boolean;
        workflowId: string;
        auditId: string;
    }[]>;
    create(a: Actor, b: WorkflowInput): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        name: string;
        enabled: boolean;
        trigger: string;
        conditions: import("@prisma/client/runtime/library").JsonValue;
        actions: import("@prisma/client/runtime/library").JsonValue;
        activeSince: Date;
    }>;
    update(a: Actor, id: string, b: WorkflowInput): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        name: string;
        enabled: boolean;
        trigger: string;
        conditions: import("@prisma/client/runtime/library").JsonValue;
        actions: import("@prisma/client/runtime/library").JsonValue;
        activeSince: Date;
    }>;
    remove(a: Actor, id: string): Promise<void>;
}
