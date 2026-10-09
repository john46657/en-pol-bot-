import { z } from 'zod';
import { TicketsService } from './tickets.service';
import type { Actor } from '../audit/audit.service';
declare const create: z.ZodObject<{
    personId: z.ZodOptional<z.ZodString>;
    erlcPlayer: z.ZodOptional<z.ZodObject<{
        serverId: z.ZodString;
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        serverId: string;
        name: string;
    }, {
        serverId: string;
        name: string;
    }>>;
    notifyInGame: z.ZodOptional<z.ZodBoolean>;
    legalCodeId: z.ZodOptional<z.ZodString>;
    reason: z.ZodString;
    amount: z.ZodOptional<z.ZodNumber>;
    notes: z.ZodOptional<z.ZodString>;
    reportId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    personId?: string | undefined;
    notes?: string | undefined;
    legalCodeId?: string | undefined;
    amount?: number | undefined;
    reportId?: string | undefined;
    erlcPlayer?: {
        serverId: string;
        name: string;
    } | undefined;
    notifyInGame?: boolean | undefined;
}, {
    reason: string;
    personId?: string | undefined;
    notes?: string | undefined;
    legalCodeId?: string | undefined;
    amount?: number | undefined;
    reportId?: string | undefined;
    erlcPlayer?: {
        serverId: string;
        name: string;
    } | undefined;
    notifyInGame?: boolean | undefined;
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
    personId?: string | undefined;
    q?: string | undefined;
}, {
    personId?: string | undefined;
    q?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
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
            status: string;
            updatedAt: Date;
            version: number;
            officerId: string;
            personId: string;
            reason: string;
            notes: string | null;
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
    /** Spieler im Spiel (ER:LC) für „Strafzettel an Spieler im Spiel“. */
    erlcPlayers(): Promise<{
        serverId: string;
        serverName: string;
        name: string;
        robloxUserId: string | null;
        team: string | null;
        location: string | null;
        plates: string[];
        personId: string | null;
        canMessage: boolean;
    }[]>;
    get(id: string): Promise<{
        ticket: {
            person: {
                serverId: string | null;
                id: string;
                status: string;
                createdAt: Date;
                updatedAt: Date;
                version: number;
                createdById: string | null;
                robloxUserId: string | null;
                robloxUsername: string;
                aliases: string[];
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
            };
            legalCode: {
                id: string;
                title: string;
                category: string;
                description: string | null;
                expiresAt: Date | null;
                active: boolean;
                code: string;
                penalty: import("@prisma/client/runtime/library").JsonValue;
                effectiveDate: Date;
            } | null;
        } & {
            number: string;
            id: string;
            status: string;
            updatedAt: Date;
            version: number;
            officerId: string;
            personId: string;
            reason: string;
            notes: string | null;
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
            entityType: string;
            entityId: string;
            summary: string;
            action: string;
            actorId: string | null;
        }[];
    }>;
    create(a: Actor, b: z.infer<typeof create>): Promise<{
        inGame: {
            ok: boolean;
            message: string;
        } | null;
        number: string;
        id: string;
        status: string;
        updatedAt: Date;
        version: number;
        officerId: string;
        personId: string;
        reason: string;
        notes: string | null;
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
        status: string;
        updatedAt: Date;
        version: number;
        officerId: string;
        personId: string;
        reason: string;
        notes: string | null;
        legalCodeId: string | null;
        amount: import("@prisma/client/runtime/library").Decimal;
        reportId: string | null;
        voidReason: string | null;
        voidedById: string | null;
        issuedAt: Date;
    }>;
}
export {};
