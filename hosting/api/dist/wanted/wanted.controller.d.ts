import { z } from 'zod';
import { WantedService } from './wanted.service';
import type { Actor } from '../audit/audit.service';
declare const create: z.ZodObject<{
    personId: z.ZodOptional<z.ZodString>;
    vehicleId: z.ZodOptional<z.ZodString>;
    reason: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodEnum<["LOW", "MEDIUM", "HIGH", "URGENT", "CRITICAL"]>>;
    expiresAt: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    description?: string | undefined;
    personId?: string | undefined;
    vehicleId?: string | undefined;
    priority?: "MEDIUM" | "LOW" | "HIGH" | "URGENT" | "CRITICAL" | undefined;
    expiresAt?: Date | undefined;
}, {
    reason: string;
    description?: string | undefined;
    personId?: string | undefined;
    vehicleId?: string | undefined;
    priority?: "MEDIUM" | "LOW" | "HIGH" | "URGENT" | "CRITICAL" | undefined;
    expiresAt?: Date | undefined;
}>;
declare const reason: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
declare const listQ: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
} & {
    status: z.ZodOptional<z.ZodEnum<["ACTIVE", "CLEARED", "CANCELLED", "EXPIRED", "ARCHIVED"]>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    status?: "CANCELLED" | "ACTIVE" | "ARCHIVED" | "EXPIRED" | "CLEARED" | undefined;
    q?: string | undefined;
}, {
    status?: "CANCELLED" | "ACTIVE" | "ARCHIVED" | "EXPIRED" | "CLEARED" | undefined;
    q?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
}>;
export declare class WantedController {
    private readonly w;
    constructor(w: WantedService);
    list(q: z.infer<typeof listQ>): Promise<{
        items: {
            serverId: string | null;
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            description: string | null;
            personId: string | null;
            vehicleId: string | null;
            reason: string;
            priority: string;
            createdById: string;
            expiresAt: Date | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        wanted: {
            serverId: string | null;
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            description: string | null;
            personId: string | null;
            vehicleId: string | null;
            reason: string;
            priority: string;
            createdById: string;
            expiresAt: Date | null;
        };
        timeline: {
            id: string;
            createdAt: Date;
            entityType: string;
            entityId: string;
            summary: string;
            action: string;
            actorId: string | null;
        }[];
    }>;
    create(a: Actor, b: z.infer<typeof create>): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        personId: string | null;
        vehicleId: string | null;
        reason: string;
        priority: string;
        createdById: string;
        expiresAt: Date | null;
    }>;
    activate(a: Actor, id: string, b: z.infer<typeof reason>): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        personId: string | null;
        vehicleId: string | null;
        reason: string;
        priority: string;
        createdById: string;
        expiresAt: Date | null;
    }>;
    clear(a: Actor, id: string, b: z.infer<typeof reason>): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        personId: string | null;
        vehicleId: string | null;
        reason: string;
        priority: string;
        createdById: string;
        expiresAt: Date | null;
    }>;
    cancel(a: Actor, id: string, b: z.infer<typeof reason>): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        personId: string | null;
        vehicleId: string | null;
        reason: string;
        priority: string;
        createdById: string;
        expiresAt: Date | null;
    }>;
    archive(a: Actor, id: string, b: z.infer<typeof reason>): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        personId: string | null;
        vehicleId: string | null;
        reason: string;
        priority: string;
        createdById: string;
        expiresAt: Date | null;
    }>;
}
export {};
