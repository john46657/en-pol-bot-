import { z } from 'zod';
import { ReportsService } from './reports.service';
import type { Actor } from '../audit/audit.service';
declare const create: z.ZodObject<{
    type: z.ZodEnum<["INCIDENT", "PATROL", "TRAFFIC", "ARREST", "CITATION", "COLLISION", "INVESTIGATION", "GENERAL"]>;
    title: z.ZodString;
    content: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    incidentId: z.ZodOptional<z.ZodString>;
    personIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    type: "INCIDENT" | "PATROL" | "TRAFFIC" | "ARREST" | "CITATION" | "COLLISION" | "INVESTIGATION" | "GENERAL";
    title: string;
    content: Record<string, unknown>;
    incidentId?: string | undefined;
    personIds?: string[] | undefined;
}, {
    type: "INCIDENT" | "PATROL" | "TRAFFIC" | "ARREST" | "CITATION" | "COLLISION" | "INVESTIGATION" | "GENERAL";
    title: string;
    content: Record<string, unknown>;
    incidentId?: string | undefined;
    personIds?: string[] | undefined;
}>;
declare const edit: z.ZodObject<{
    version: z.ZodNumber;
    title: z.ZodOptional<z.ZodString>;
    content: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    changeSummary: z.ZodString;
}, "strip", z.ZodTypeAny, {
    version: number;
    changeSummary: string;
    content: Record<string, unknown>;
    title?: string | undefined;
}, {
    version: number;
    changeSummary: string;
    content: Record<string, unknown>;
    title?: string | undefined;
}>;
declare const reason: z.ZodObject<{
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reason?: string | undefined;
}, {
    reason?: string | undefined;
}>;
declare const listQ: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
} & {
    status: z.ZodOptional<z.ZodEnum<["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "ARCHIVED"]>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    status?: "REJECTED" | "APPROVED" | "ARCHIVED" | "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | undefined;
    q?: string | undefined;
}, {
    status?: "REJECTED" | "APPROVED" | "ARCHIVED" | "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | undefined;
    q?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
}>;
export declare class ReportsController {
    private readonly r;
    constructor(r: ReportsService);
    list(a: Actor, q: z.infer<typeof listQ>): Promise<{
        items: {
            number: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            type: string;
            status: string;
            title: string;
            incidentId: string | null;
            authorId: string;
            currentVersion: number;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(a: Actor, id: string): Promise<{
        report: {
            versions: {
                id: string;
                createdAt: Date;
                version: number;
                authorId: string;
                reportId: string;
                changeSummary: string;
                content: import("@prisma/client/runtime/library").JsonValue;
                contentHash: string;
            }[];
        } & {
            number: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            type: string;
            status: string;
            title: string;
            incidentId: string | null;
            authorId: string;
            currentVersion: number;
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
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        status: string;
        title: string;
        incidentId: string | null;
        authorId: string;
        currentVersion: number;
    }>;
    edit(a: Actor, id: string, b: z.infer<typeof edit>): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        status: string;
        title: string;
        incidentId: string | null;
        authorId: string;
        currentVersion: number;
    }>;
    submit(a: Actor, id: string): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        status: string;
        title: string;
        incidentId: string | null;
        authorId: string;
        currentVersion: number;
    }>;
    review(a: Actor, id: string): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        status: string;
        title: string;
        incidentId: string | null;
        authorId: string;
        currentVersion: number;
    }>;
    approve(a: Actor, id: string): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        status: string;
        title: string;
        incidentId: string | null;
        authorId: string;
        currentVersion: number;
    }>;
    reject(a: Actor, id: string, b: z.infer<typeof reason>): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        status: string;
        title: string;
        incidentId: string | null;
        authorId: string;
        currentVersion: number;
    }>;
    archive(a: Actor, id: string): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        status: string;
        title: string;
        incidentId: string | null;
        authorId: string;
        currentVersion: number;
    }>;
}
export {};
