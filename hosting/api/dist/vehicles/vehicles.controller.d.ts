import { z } from 'zod';
import { VehiclesService } from './vehicles.service';
import type { Actor } from '../audit/audit.service';
import { pageQuery } from '../common/pagination';
declare const create: z.ZodObject<{
    plate: z.ZodString;
    model: z.ZodOptional<z.ZodString>;
    color: z.ZodOptional<z.ZodString>;
    ownerId: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    erlcReference: z.ZodOptional<z.ZodString>;
    custom: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    plate: string;
    color?: string | undefined;
    custom?: Record<string, unknown> | undefined;
    notes?: string | undefined;
    ownerId?: string | undefined;
    model?: string | undefined;
    erlcReference?: string | undefined;
}, {
    plate: string;
    color?: string | undefined;
    custom?: Record<string, unknown> | undefined;
    notes?: string | undefined;
    ownerId?: string | undefined;
    model?: string | undefined;
    erlcReference?: string | undefined;
}>;
declare const archive: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
export declare class VehiclesController {
    private readonly vehicles;
    constructor(vehicles: VehiclesService);
    list(q: z.infer<typeof pageQuery>): Promise<{
        items: ({
            owner: {
                id: string;
                robloxUsername: string;
            } | null;
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            color: string | null;
            status: string;
            custom: import("@prisma/client/runtime/library").JsonValue | null;
            serverId: string | null;
            notes: string | null;
            ownerId: string | null;
            plate: string;
            model: string | null;
            erlcReference: string | null;
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        vehicle: {
            owner: {
                id: string;
                createdAt: Date;
                robloxUserId: string | null;
                robloxUsername: string;
                updatedAt: Date;
                version: number;
                createdById: string | null;
                status: string;
                custom: import("@prisma/client/runtime/library").JsonValue | null;
                serverId: string | null;
                notes: string | null;
                aliases: string[];
            } | null;
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            color: string | null;
            status: string;
            custom: import("@prisma/client/runtime/library").JsonValue | null;
            serverId: string | null;
            notes: string | null;
            ownerId: string | null;
            plate: string;
            model: string | null;
            erlcReference: string | null;
        };
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
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        color: string | null;
        status: string;
        custom: import("@prisma/client/runtime/library").JsonValue | null;
        serverId: string | null;
        notes: string | null;
        ownerId: string | null;
        plate: string;
        model: string | null;
        erlcReference: string | null;
    }>;
    archive(a: Actor, id: string, b: z.infer<typeof archive>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        color: string | null;
        status: string;
        custom: import("@prisma/client/runtime/library").JsonValue | null;
        serverId: string | null;
        notes: string | null;
        ownerId: string | null;
        plate: string;
        model: string | null;
        erlcReference: string | null;
    }>;
}
export {};
