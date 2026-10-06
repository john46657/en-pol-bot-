import { z } from 'zod';
import { TicketsService } from './tickets.service';
import type { Actor } from '../audit/audit.service';
declare const create: z.ZodObject<{
    personId: z.ZodString;
    legalCodeId: z.ZodOptional<z.ZodString>;
    reason: z.ZodString;
    amount: z.ZodOptional<z.ZodNumber>;
    notes: z.ZodOptional<z.ZodString>;
    reportId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    personId: string;
    notes?: string | undefined;
    legalCodeId?: string | undefined;
    amount?: number | undefined;
    reportId?: string | undefined;
}, {
    reason: string;
    personId: string;
    notes?: string | undefined;
    legalCodeId?: string | undefined;
    amount?: number | undefined;
    reportId?: string | undefined;
}>;
declare const voidSchema: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
declare const listQuery: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
} & {
    personId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    q?: string | undefined;
    personId?: string | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
    personId?: string | undefined;
}>;
export declare class TicketsController {
    private readonly tickets;
    constructor(tickets: TicketsService);
    list(q: z.infer<typeof listQuery>): Promise<{
        items: ({
            person: {
                id: string;
                robloxUsername: string;
            };
        } & {
            number: string;
            id: string;
            reason: string;
            updatedAt: Date;
            version: number;
            status: string;
            notes: string | null;
            personId: string;
            officerId: string;
            legalCodeId: string | null;
            amount: import("@prisma/client/runtime/library").Decimal;
            reportId: string | null;
            voidReason: string | null;
            voidedById: string | null;
            issuedAt: Date;
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        ticket: {
            person: {
                id: string;
                createdById: string | null;
                createdAt: Date;
                robloxUserId: string | null;
                robloxUsername: string;
                updatedAt: Date;
                version: number;
                status: string;
                custom: import("@prisma/client/runtime/library").JsonValue | null;
                aliases: string[];
                serverId: string | null;
                notes: string | null;
            };
            legalCode: {
                code: string;
                id: string;
                description: string | null;
                category: string;
                expiresAt: Date | null;
                active: boolean;
                title: string;
                penalty: import("@prisma/client/runtime/library").JsonValue;
                effectiveDate: Date;
            } | null;
        } & {
            number: string;
            id: string;
            reason: string;
            updatedAt: Date;
            version: number;
            status: string;
            notes: string | null;
            personId: string;
            officerId: string;
            legalCodeId: string | null;
            amount: import("@prisma/client/runtime/library").Decimal;
            reportId: string | null;
            voidReason: string | null;
            voidedById: string | null;
            issuedAt: Date;
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
        number: string;
        id: string;
        reason: string;
        updatedAt: Date;
        version: number;
        status: string;
        notes: string | null;
        personId: string;
        officerId: string;
        legalCodeId: string | null;
        amount: import("@prisma/client/runtime/library").Decimal;
        reportId: string | null;
        voidReason: string | null;
        voidedById: string | null;
        issuedAt: Date;
    }>;
    void(a: Actor, id: string, b: z.infer<typeof voidSchema>): Promise<{
        number: string;
        id: string;
        reason: string;
        updatedAt: Date;
        version: number;
        status: string;
        notes: string | null;
        personId: string;
        officerId: string;
        legalCodeId: string | null;
        amount: import("@prisma/client/runtime/library").Decimal;
        reportId: string | null;
        voidReason: string | null;
        voidedById: string | null;
        issuedAt: Date;
    }>;
}
export {};
