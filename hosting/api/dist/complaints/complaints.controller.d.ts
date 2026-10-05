import { z } from 'zod';
import { ComplaintsService } from './complaints.service';
import type { Actor } from '../audit/audit.service';
declare const create: z.ZodObject<{
    complainantId: z.ZodOptional<z.ZodString>;
    subjectId: z.ZodOptional<z.ZodString>;
    officerId: z.ZodOptional<z.ZodString>;
    category: z.ZodString;
    description: z.ZodString;
}, "strip", z.ZodTypeAny, {
    description: string;
    category: string;
    officerId?: string | undefined;
    complainantId?: string | undefined;
    subjectId?: string | undefined;
}, {
    description: string;
    category: string;
    officerId?: string | undefined;
    complainantId?: string | undefined;
    subjectId?: string | undefined;
}>;
declare const assign: z.ZodObject<{
    investigatorId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    investigatorId: string;
}, {
    investigatorId: string;
}>;
declare const note: z.ZodObject<{
    findings: z.ZodOptional<z.ZodString>;
    internalNotes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    findings?: string | undefined;
    internalNotes?: string | undefined;
}, {
    findings?: string | undefined;
    internalNotes?: string | undefined;
}>;
declare const resolve: z.ZodObject<{
    resolution: z.ZodString;
    findings: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    resolution: string;
    findings?: string | undefined;
}, {
    resolution: string;
    findings?: string | undefined;
}>;
declare const listQ: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
} & {
    status: z.ZodOptional<z.ZodEnum<["RECEIVED", "SCREENING", "ASSIGNED", "INVESTIGATION", "REVIEW", "RESOLVED", "CLOSED"]>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    status?: "CLOSED" | "ASSIGNED" | "INVESTIGATION" | "RECEIVED" | "SCREENING" | "REVIEW" | "RESOLVED" | undefined;
    q?: string | undefined;
}, {
    status?: "CLOSED" | "ASSIGNED" | "INVESTIGATION" | "RECEIVED" | "SCREENING" | "REVIEW" | "RESOLVED" | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
export declare class ComplaintsController {
    private readonly c;
    constructor(c: ComplaintsService);
    list(a: Actor, q: z.infer<typeof listQ>): Promise<{
        items: ({
            number: string;
            id: string;
            createdAt: Date;
            description: string;
            updatedAt: Date;
            version: number;
            status: string;
            officerId: string | null;
            category: string;
            complainantId: string | null;
            subjectId: string | null;
            investigatorId: string | null;
            findings: string | null;
            resolution: string | null;
            internalNotes: string | null;
        } | {
            internalNotes: undefined;
            findings: undefined;
            number: string;
            id: string;
            createdAt: Date;
            description: string;
            updatedAt: Date;
            version: number;
            status: string;
            officerId: string | null;
            category: string;
            complainantId: string | null;
            subjectId: string | null;
            investigatorId: string | null;
            resolution: string | null;
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(a: Actor, id: string): Promise<{
        complaint: {
            number: string;
            id: string;
            createdAt: Date;
            description: string;
            updatedAt: Date;
            version: number;
            status: string;
            officerId: string | null;
            category: string;
            complainantId: string | null;
            subjectId: string | null;
            investigatorId: string | null;
            findings: string | null;
            resolution: string | null;
            internalNotes: string | null;
        } | {
            internalNotes: undefined;
            findings: undefined;
            number: string;
            id: string;
            createdAt: Date;
            description: string;
            updatedAt: Date;
            version: number;
            status: string;
            officerId: string | null;
            category: string;
            complainantId: string | null;
            subjectId: string | null;
            investigatorId: string | null;
            resolution: string | null;
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
        number: string;
        status: string;
    }>;
    screen(a: Actor, id: string): Promise<{
        id: string;
        status: string;
    }>;
    assign(a: Actor, id: string, b: z.infer<typeof assign>): Promise<{
        id: string;
        status: string;
    }>;
    investigate(a: Actor, id: string, b: z.infer<typeof note>): Promise<{
        id: string;
        status: string;
    }>;
    review(a: Actor, id: string, b: z.infer<typeof note>): Promise<{
        id: string;
        status: string;
    }>;
    resolve(a: Actor, id: string, b: z.infer<typeof resolve>): Promise<{
        id: string;
        status: string;
    }>;
    close(a: Actor, id: string): Promise<{
        id: string;
        status: string;
    }>;
}
export {};
