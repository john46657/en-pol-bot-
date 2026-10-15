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
    model?: string | undefined;
    notes?: string | undefined;
    custom?: Record<string, unknown> | undefined;
    color?: string | undefined;
    ownerId?: string | undefined;
    erlcReference?: string | undefined;
}, {
    plate: string;
    model?: string | undefined;
    notes?: string | undefined;
    custom?: Record<string, unknown> | undefined;
    color?: string | undefined;
    ownerId?: string | undefined;
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
            serverId: string | null;
            model: string | null;
            id: string;
            status: string;
            notes: string | null;
            custom: import("@prisma/client/runtime/library").JsonValue | null;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            plate: string;
            color: string | null;
            ownerId: string | null;
            erlcReference: string | null;
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        vehicle: {
            owner: {
                serverId: string | null;
                id: string;
                robloxUserId: string | null;
                robloxUsername: string;
                aliases: string[];
                status: string;
                notes: string | null;
                custom: import("@prisma/client/runtime/library").JsonValue | null;
                fullName: string | null;
                dateOfBirth: Date | null;
                gender: string | null;
                phone: string | null;
                job: string | null;
                nationality: string | null;
                address: string | null;
                appearance: import("@prisma/client/runtime/library").JsonValue | null;
                licenses: string[];
                flags: string[];
                photoId: string | null;
                createdById: string | null;
                createdAt: Date;
                updatedAt: Date;
                version: number;
            } | null;
        } & {
            serverId: string | null;
            model: string | null;
            id: string;
            status: string;
            notes: string | null;
            custom: import("@prisma/client/runtime/library").JsonValue | null;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            plate: string;
            color: string | null;
            ownerId: string | null;
            erlcReference: string | null;
        };
        timeline: {
            id: string;
            createdAt: Date;
            entityId: string;
            summary: string;
            entityType: string;
            action: string;
            actorId: string | null;
        }[];
    }>;
    create(a: Actor, b: z.infer<typeof create>): Promise<{
        serverId: string | null;
        model: string | null;
        id: string;
        status: string;
        notes: string | null;
        custom: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        plate: string;
        color: string | null;
        ownerId: string | null;
        erlcReference: string | null;
    }>;
    archive(a: Actor, id: string, b: z.infer<typeof archive>): Promise<{
        serverId: string | null;
        model: string | null;
        id: string;
        status: string;
        notes: string | null;
        custom: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        plate: string;
        color: string | null;
        ownerId: string | null;
        erlcReference: string | null;
    }>;
}
export {};
