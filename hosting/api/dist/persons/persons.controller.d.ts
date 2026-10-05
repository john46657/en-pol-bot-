import { z } from 'zod';
import { PersonsService } from './persons.service';
import type { Actor } from '../audit/audit.service';
import { pageQuery } from '../common/pagination';
declare const create: z.ZodObject<{
    robloxUsername: z.ZodString;
    robloxUserId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    aliases: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    notes: z.ZodOptional<z.ZodString>;
    custom: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    robloxUsername: string;
    robloxUserId?: string | null | undefined;
    custom?: Record<string, unknown> | undefined;
    aliases?: string[] | undefined;
    notes?: string | undefined;
}, {
    robloxUsername: string;
    robloxUserId?: string | null | undefined;
    custom?: Record<string, unknown> | undefined;
    aliases?: string[] | undefined;
    notes?: string | undefined;
}>;
declare const update: z.ZodObject<{
    version: z.ZodNumber;
    robloxUsername: z.ZodOptional<z.ZodString>;
    aliases: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    custom: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    version: number;
    robloxUsername?: string | undefined;
    custom?: Record<string, unknown> | undefined;
    aliases?: string[] | undefined;
    notes?: string | null | undefined;
}, {
    version: number;
    robloxUsername?: string | undefined;
    custom?: Record<string, unknown> | undefined;
    aliases?: string[] | undefined;
    notes?: string | null | undefined;
}>;
declare const merge: z.ZodObject<{
    targetId: z.ZodString;
    confirm: z.ZodLiteral<true>;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
    targetId: string;
    confirm: true;
}, {
    reason: string;
    targetId: string;
    confirm: true;
}>;
declare const archive: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
export declare class PersonsController {
    private readonly persons;
    constructor(persons: PersonsService);
    list(q: z.infer<typeof pageQuery>): Promise<{
        items: {
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
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        person: {
            vehicles: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                version: number;
                status: string;
                custom: import("@prisma/client/runtime/library").JsonValue | null;
                serverId: string | null;
                notes: string | null;
                ownerId: string | null;
                plate: string;
                model: string | null;
                color: string | null;
                erlcReference: string | null;
            }[];
        } & {
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
        tickets: {
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
        }[];
        links: {
            role: string;
            id: string;
            createdAt: Date;
            entityType: string;
            entityId: string;
            personId: string | null;
            vehicleId: string | null;
        }[];
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
        possibleDuplicates: {
            id: string;
            robloxUserId: string | null;
            robloxUsername: string;
            status: string;
        }[];
    }>;
    update(a: Actor, id: string, b: z.infer<typeof update>): Promise<{
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
    }>;
    archive(a: Actor, id: string, b: z.infer<typeof archive>): Promise<{
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
    }>;
    merge(a: Actor, id: string, b: z.infer<typeof merge>): Promise<{
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
    }>;
}
export {};
