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
    expiresAt?: Date | undefined;
    personId?: string | undefined;
    vehicleId?: string | undefined;
    priority?: "MEDIUM" | "LOW" | "HIGH" | "URGENT" | "CRITICAL" | undefined;
}, {
    reason: string;
    description?: string | undefined;
    expiresAt?: Date | undefined;
    personId?: string | undefined;
    vehicleId?: string | undefined;
    priority?: "MEDIUM" | "LOW" | "HIGH" | "URGENT" | "CRITICAL" | undefined;
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
    status?: "ACTIVE" | "ARCHIVED" | "CANCELLED" | "EXPIRED" | "CLEARED" | undefined;
    q?: string | undefined;
}, {
    status?: "ACTIVE" | "ARCHIVED" | "CANCELLED" | "EXPIRED" | "CLEARED" | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
export declare class WantedController {
    private readonly w;
    constructor(w: WantedService);
    list(q: z.infer<typeof listQ>): Promise<{
        items: {
            id: string;
            reason: string;
            createdById: string;
            createdAt: Date;
            description: string | null;
            expiresAt: Date | null;
            updatedAt: Date;
            version: number;
            status: string;
            personId: string | null;
            vehicleId: string | null;
            priority: string;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        wanted: {
            id: string;
            reason: string;
            createdById: string;
            createdAt: Date;
            description: string | null;
            expiresAt: Date | null;
            updatedAt: Date;
            version: number;
            status: string;
            personId: string | null;
            vehicleId: string | null;
            priority: string;
        };
        timeline: {
            id: string;
            createdAt: Date;
            action: string;
            entityType: string;
            entityId: string;
            summary: string;
            actorId: string | null;
        }[];
    }>;
    create(a: Actor, b: z.infer<typeof create>): Promise<{
        id: string;
        reason: string;
        createdById: string;
        createdAt: Date;
        description: string | null;
        expiresAt: Date | null;
        updatedAt: Date;
        version: number;
        status: string;
        personId: string | null;
        vehicleId: string | null;
        priority: string;
    }>;
    activate(a: Actor, id: string, b: z.infer<typeof reason>): Promise<{
        id: string;
        reason: string;
        createdById: string;
        createdAt: Date;
        description: string | null;
        expiresAt: Date | null;
        updatedAt: Date;
        version: number;
        status: string;
        personId: string | null;
        vehicleId: string | null;
        priority: string;
    }>;
    clear(a: Actor, id: string, b: z.infer<typeof reason>): Promise<{
        id: string;
        reason: string;
        createdById: string;
        createdAt: Date;
        description: string | null;
        expiresAt: Date | null;
        updatedAt: Date;
        version: number;
        status: string;
        personId: string | null;
        vehicleId: string | null;
        priority: string;
    }>;
    cancel(a: Actor, id: string, b: z.infer<typeof reason>): Promise<{
        id: string;
        reason: string;
        createdById: string;
        createdAt: Date;
        description: string | null;
        expiresAt: Date | null;
        updatedAt: Date;
        version: number;
        status: string;
        personId: string | null;
        vehicleId: string | null;
        priority: string;
    }>;
    archive(a: Actor, id: string, b: z.infer<typeof reason>): Promise<{
        id: string;
        reason: string;
        createdById: string;
        createdAt: Date;
        description: string | null;
        expiresAt: Date | null;
        updatedAt: Date;
        version: number;
        status: string;
        personId: string | null;
        vehicleId: string | null;
        priority: string;
    }>;
}
export {};
