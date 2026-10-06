import { z } from 'zod';
import { UNIT_STATUSES } from '@enrp/shared';
import { DispatchService } from './dispatch.service';
import type { Actor } from '../audit/audit.service';
declare const create: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodEnum<["LOW", "MEDIUM", "HIGH", "URGENT", "CRITICAL"]>>;
    location: z.ZodOptional<z.ZodString>;
    personIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    vehicleIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    title: string;
    description?: string | undefined;
    priority?: "MEDIUM" | "LOW" | "HIGH" | "URGENT" | "CRITICAL" | undefined;
    location?: string | undefined;
    personIds?: string[] | undefined;
    vehicleIds?: string[] | undefined;
}, {
    title: string;
    description?: string | undefined;
    priority?: "MEDIUM" | "LOW" | "HIGH" | "URGENT" | "CRITICAL" | undefined;
    location?: string | undefined;
    personIds?: string[] | undefined;
    vehicleIds?: string[] | undefined;
}>;
declare const update: z.ZodObject<{
    version: z.ZodNumber;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodEnum<["LOW", "MEDIUM", "HIGH", "URGENT", "CRITICAL"]>>;
    location: z.ZodOptional<z.ZodString>;
    supervisorId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    version: number;
    description?: string | undefined;
    priority?: "MEDIUM" | "LOW" | "HIGH" | "URGENT" | "CRITICAL" | undefined;
    title?: string | undefined;
    location?: string | undefined;
    supervisorId?: string | null | undefined;
}, {
    version: number;
    description?: string | undefined;
    priority?: "MEDIUM" | "LOW" | "HIGH" | "URGENT" | "CRITICAL" | undefined;
    title?: string | undefined;
    location?: string | undefined;
    supervisorId?: string | null | undefined;
}>;
declare const status: z.ZodObject<{
    status: z.ZodEffects<z.ZodEnum<["NEW", "ACKNOWLEDGED", "ASSIGNED", "EN_ROUTE", "ON_SCENE", "PROCESSING", "CLEARING", "CLOSED", "CANCELLED"]>, "CANCELLED" | "EN_ROUTE" | "ON_SCENE" | "NEW" | "ACKNOWLEDGED" | "ASSIGNED" | "PROCESSING" | "CLEARING", "CANCELLED" | "CLOSED" | "EN_ROUTE" | "ON_SCENE" | "NEW" | "ACKNOWLEDGED" | "ASSIGNED" | "PROCESSING" | "CLEARING">;
    note: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "CANCELLED" | "EN_ROUTE" | "ON_SCENE" | "NEW" | "ACKNOWLEDGED" | "ASSIGNED" | "PROCESSING" | "CLEARING";
    note?: string | undefined;
}, {
    status: "CANCELLED" | "CLOSED" | "EN_ROUTE" | "ON_SCENE" | "NEW" | "ACKNOWLEDGED" | "ASSIGNED" | "PROCESSING" | "CLEARING";
    note?: string | undefined;
}>;
declare const listQ: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
} & {
    status: z.ZodOptional<z.ZodEnum<["NEW", "ACKNOWLEDGED", "ASSIGNED", "EN_ROUTE", "ON_SCENE", "PROCESSING", "CLEARING", "CLOSED", "CANCELLED"]>>;
    active: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    active?: boolean | undefined;
    status?: "CANCELLED" | "CLOSED" | "EN_ROUTE" | "ON_SCENE" | "NEW" | "ACKNOWLEDGED" | "ASSIGNED" | "PROCESSING" | "CLEARING" | undefined;
    q?: string | undefined;
}, {
    active?: boolean | undefined;
    status?: "CANCELLED" | "CLOSED" | "EN_ROUTE" | "ON_SCENE" | "NEW" | "ACKNOWLEDGED" | "ASSIGNED" | "PROCESSING" | "CLEARING" | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
declare const attach: z.ZodObject<{
    personIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    vehicleIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    personIds?: string[] | undefined;
    vehicleIds?: string[] | undefined;
}, {
    personIds?: string[] | undefined;
    vehicleIds?: string[] | undefined;
}>;
declare const unit: z.ZodObject<{
    callsign: z.ZodString;
    vehicle: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    memberIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    callsign: string;
    vehicle?: string | undefined;
    notes?: string | undefined;
    memberIds?: string[] | undefined;
}, {
    callsign: string;
    vehicle?: string | undefined;
    notes?: string | undefined;
    memberIds?: string[] | undefined;
}>;
export declare class IncidentsController {
    private readonly d;
    constructor(d: DispatchService);
    list(q: z.infer<typeof listQ>): Promise<{
        items: ({
            units: ({
                unit: {
                    callsign: string;
                };
            } & {
                unitId: string;
                incidentId: string;
                assignedAt: Date;
                clearedAt: Date | null;
            })[];
        } & {
            number: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            description: string | null;
            priority: string;
            status: string;
            serverId: string | null;
            title: string;
            location: string | null;
            source: string;
            dispatcherId: string | null;
            supervisorId: string | null;
            closedAt: Date | null;
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        incident: {
            units: ({
                unit: {
                    vehicle: string | null;
                    id: string;
                    updatedAt: Date;
                    status: string;
                    callsign: string;
                    notes: string | null;
                };
            } & {
                unitId: string;
                incidentId: string;
                assignedAt: Date;
                clearedAt: Date | null;
            })[];
        } & {
            number: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            description: string | null;
            priority: string;
            status: string;
            serverId: string | null;
            title: string;
            location: string | null;
            source: string;
            dispatcherId: string | null;
            supervisorId: string | null;
            closedAt: Date | null;
        };
        links: {
            role: string;
            id: string;
            entityType: string;
            entityId: string;
            createdAt: Date;
            personId: string | null;
            vehicleId: string | null;
        }[];
        timeline: {
            id: string;
            action: string;
            entityType: string;
            entityId: string;
            createdAt: Date;
            summary: string;
            actorId: string | null;
        }[];
    }>;
    create(a: Actor, b: z.infer<typeof create>): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        priority: string;
        status: string;
        serverId: string | null;
        title: string;
        location: string | null;
        source: string;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
    }>;
    update(a: Actor, id: string, b: z.infer<typeof update>): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        priority: string;
        status: string;
        serverId: string | null;
        title: string;
        location: string | null;
        source: string;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
    }>;
    attach(a: Actor, id: string, b: z.infer<typeof attach>): Promise<void>;
}
export declare class DispatchController {
    private readonly d;
    constructor(d: DispatchService);
    units(): import("@prisma/client").Prisma.PrismaPromise<({
        members: {
            userId: string;
            unitId: string;
        }[];
    } & {
        vehicle: string | null;
        id: string;
        updatedAt: Date;
        status: string;
        callsign: string;
        notes: string | null;
    })[]>;
    createUnit(a: Actor, b: z.infer<typeof unit>): Promise<{
        vehicle: string | null;
        id: string;
        updatedAt: Date;
        status: string;
        callsign: string;
        notes: string | null;
    }>;
    unitStatus(a: Actor, id: string, b: {
        status: (typeof UNIT_STATUSES)[number];
    }): Promise<{
        vehicle: string | null;
        id: string;
        updatedAt: Date;
        status: string;
        callsign: string;
        notes: string | null;
    }>;
    members(a: Actor, id: string, b: {
        userIds: string[];
    }): Promise<{
        members: {
            userId: string;
            unitId: string;
        }[];
    } & {
        vehicle: string | null;
        id: string;
        updatedAt: Date;
        status: string;
        callsign: string;
        notes: string | null;
    }>;
    assign(a: Actor, id: string, b: {
        unitId: string;
    }): Promise<{
        units: {
            unitId: string;
            incidentId: string;
            assignedAt: Date;
            clearedAt: Date | null;
        }[];
    } & {
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        priority: string;
        status: string;
        serverId: string | null;
        title: string;
        location: string | null;
        source: string;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
    }>;
    setStatus(a: Actor, id: string, b: z.infer<typeof status>): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        priority: string;
        status: string;
        serverId: string | null;
        title: string;
        location: string | null;
        source: string;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
    }>;
    close(a: Actor, id: string): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        priority: string;
        status: string;
        serverId: string | null;
        title: string;
        location: string | null;
        source: string;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
    }>;
}
export {};
