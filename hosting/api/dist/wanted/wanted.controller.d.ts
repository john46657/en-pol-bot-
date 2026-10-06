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
    expiresAt?: Date | undefined;
    description?: string | undefined;
    priority?: "MEDIUM" | "LOW" | "HIGH" | "URGENT" | "CRITICAL" | undefined;
    personId?: string | undefined;
    vehicleId?: string | undefined;
}, {
    reason: string;
    expiresAt?: Date | undefined;
    description?: string | undefined;
    priority?: "MEDIUM" | "LOW" | "HIGH" | "URGENT" | "CRITICAL" | undefined;
    personId?: string | undefined;
    vehicleId?: string | undefined;
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
            createdAt: Date;
            expiresAt: Date | null;
            updatedAt: Date;
            version: number;
            description: string | null;
            priority: string;
            createdById: string;
            status: string;
            personId: string | null;
            vehicleId: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        wanted: {
            id: string;
            reason: string;
            createdAt: Date;
            expiresAt: Date | null;
            updatedAt: Date;
            version: number;
            description: string | null;
            priority: string;
            createdById: string;
            status: string;
            personId: string | null;
            vehicleId: string | null;
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
        reason: string;
        createdAt: Date;
        expiresAt: Date | null;
        updatedAt: Date;
        version: number;
        description: string | null;
        priority: string;
        createdById: string;
        status: string;
        personId: string | null;
        vehicleId: string | null;
    }>;
    activate(a: Actor, id: string, b: z.infer<typeof reason>): Promise<{
        id: string;
        reason: string;
        createdAt: Date;
        expiresAt: Date | null;
        updatedAt: Date;
        version: number;
        description: string | null;
        priority: string;
        createdById: string;
        status: string;
        personId: string | null;
        vehicleId: string | null;
    }>;
    clear(a: Actor, id: string, b: z.infer<typeof reason>): Promise<{
        id: string;
        reason: string;
        createdAt: Date;
        expiresAt: Date | null;
        updatedAt: Date;
        version: number;
        description: string | null;
        priority: string;
        createdById: string;
        status: string;
        personId: string | null;
        vehicleId: string | null;
    }>;
    cancel(a: Actor, id: string, b: z.infer<typeof reason>): Promise<{
        id: string;
        reason: string;
        createdAt: Date;
        expiresAt: Date | null;
        updatedAt: Date;
        version: number;
        description: string | null;
        priority: string;
        createdById: string;
        status: string;
        personId: string | null;
        vehicleId: string | null;
    }>;
    archive(a: Actor, id: string, b: z.infer<typeof reason>): Promise<{
        id: string;
        reason: string;
        createdAt: Date;
        expiresAt: Date | null;
        updatedAt: Date;
        version: number;
        description: string | null;
        priority: string;
        createdById: string;
        status: string;
        personId: string | null;
        vehicleId: string | null;
    }>;
}
export {};
