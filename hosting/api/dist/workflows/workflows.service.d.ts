import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { NotifyService } from '../notifications/notify.service';
export declare const workflowInput: z.ZodObject<{
    name: z.ZodString;
    enabled: z.ZodDefault<z.ZodBoolean>;
    /** Audit-Aktion, optional mit `*` am Ende (z. B. `report.*`). */
    trigger: z.ZodString;
    conditions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        field: z.ZodString;
        op: z.ZodEnum<["eq", "neq", "contains", "in", "exists", "not_exists"]>;
        value: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        field: string;
        op: "in" | "contains" | "eq" | "neq" | "exists" | "not_exists";
        value?: string | undefined;
    }, {
        field: string;
        op: "in" | "contains" | "eq" | "neq" | "exists" | "not_exists";
        value?: string | undefined;
    }>, "many">>;
    actions: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"notify_permission">;
        permission: z.ZodEffects<z.ZodString, string, string>;
        title: z.ZodString;
        body: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        permission: string;
        type: "notify_permission";
        title: string;
        body?: string | undefined;
    }, {
        permission: string;
        type: "notify_permission";
        title: string;
        body?: string | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"notify_role">;
        roleId: z.ZodString;
        title: z.ZodString;
        body: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "notify_role";
        title: string;
        roleId: string;
        body?: string | undefined;
    }, {
        type: "notify_role";
        title: string;
        roleId: string;
        body?: string | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"discord">;
        channelIds: z.ZodArray<z.ZodString, "many">;
        pingRoleIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        title: z.ZodString;
        text: z.ZodOptional<z.ZodString>;
        color: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "discord";
        title: string;
        channelIds: string[];
        color?: string | undefined;
        text?: string | undefined;
        pingRoleIds?: string[] | undefined;
    }, {
        type: "discord";
        title: string;
        channelIds: string[];
        color?: string | undefined;
        text?: string | undefined;
        pingRoleIds?: string[] | undefined;
    }>]>, "many">;
}, "strip", z.ZodTypeAny, {
    name: string;
    enabled: boolean;
    trigger: string;
    conditions: {
        field: string;
        op: "in" | "contains" | "eq" | "neq" | "exists" | "not_exists";
        value?: string | undefined;
    }[];
    actions: ({
        permission: string;
        type: "notify_permission";
        title: string;
        body?: string | undefined;
    } | {
        type: "notify_role";
        title: string;
        roleId: string;
        body?: string | undefined;
    } | {
        type: "discord";
        title: string;
        channelIds: string[];
        color?: string | undefined;
        text?: string | undefined;
        pingRoleIds?: string[] | undefined;
    })[];
}, {
    name: string;
    trigger: string;
    actions: ({
        permission: string;
        type: "notify_permission";
        title: string;
        body?: string | undefined;
    } | {
        type: "notify_role";
        title: string;
        roleId: string;
        body?: string | undefined;
    } | {
        type: "discord";
        title: string;
        channelIds: string[];
        color?: string | undefined;
        text?: string | undefined;
        pingRoleIds?: string[] | undefined;
    })[];
    enabled?: boolean | undefined;
    conditions?: {
        field: string;
        op: "in" | "contains" | "eq" | "neq" | "exists" | "not_exists";
        value?: string | undefined;
    }[] | undefined;
}>;
export type WorkflowInput = z.infer<typeof workflowInput>;
/**
 * Studio-Workflows: liest neue Einträge des Audit-Protokolls (nur bestätigte Änderungen) und führt passende Regeln aus.
 * Aktionen erzeugen keine Audit-Einträge → keine Endlosschleifen.
 */
export declare class WorkflowsService {
    private readonly prisma;
    private readonly audit;
    private readonly notify;
    private readonly log;
    constructor(prisma: PrismaService, audit: AuditService, notify: NotifyService);
    list(): Prisma.PrismaPromise<({
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
        conditions: Prisma.JsonValue;
        actions: Prisma.JsonValue;
        activeSince: Date;
    })[]>;
    runs(id: string): Prisma.PrismaPromise<{
        error: string | null;
        id: string;
        createdAt: Date;
        action: string;
        entityId: string | null;
        ok: boolean;
        workflowId: string;
        auditId: string;
    }[]>;
    private checkRoles;
    create(actor: Actor, d: WorkflowInput): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        name: string;
        enabled: boolean;
        trigger: string;
        conditions: Prisma.JsonValue;
        actions: Prisma.JsonValue;
        activeSince: Date;
    }>;
    update(actor: Actor, id: string, d: WorkflowInput): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        name: string;
        enabled: boolean;
        trigger: string;
        conditions: Prisma.JsonValue;
        actions: Prisma.JsonValue;
        activeSince: Date;
    }>;
    remove(actor: Actor, id: string): Promise<void>;
    /** Ein Durchlauf: neue Audit-Einträge holen, passende Workflows ausführen. */
    tick(now?: Date): Promise<number>;
    private matches;
    private run;
    private act;
}
