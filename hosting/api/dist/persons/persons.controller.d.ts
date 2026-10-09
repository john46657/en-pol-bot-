import { z } from 'zod';
import { PersonsService } from './persons.service';
import { RobloxService } from './roblox.service';
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
    aliases?: string[] | undefined;
    notes?: string | undefined;
    custom?: Record<string, unknown> | undefined;
}, {
    robloxUsername: string;
    robloxUserId?: string | null | undefined;
    aliases?: string[] | undefined;
    notes?: string | undefined;
    custom?: Record<string, unknown> | undefined;
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
    aliases?: string[] | undefined;
    notes?: string | null | undefined;
    custom?: Record<string, unknown> | undefined;
}, {
    version: number;
    robloxUsername?: string | undefined;
    aliases?: string[] | undefined;
    notes?: string | null | undefined;
    custom?: Record<string, unknown> | undefined;
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
declare const robloxQ: z.ZodObject<{
    q: z.ZodString;
}, "strip", z.ZodTypeAny, {
    q: string;
}, {
    q: string;
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
    private readonly roblox;
    constructor(persons: PersonsService, roblox: RobloxService);
    list(q: z.infer<typeof pageQuery>): Promise<{
        items: {
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
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    /** Roblox-Konto per Name, ID oder Profil-Link nachschlagen (mit Avatar und vorhandener Akte); nicht gefunden → `null`. */
    robloxLookup(q: z.infer<typeof robloxQ>): Promise<{
        profile: import("./roblox.service").RobloxProfile | null;
    }>;
    get(id: string): Promise<{
        person: {
            vehicles: {
                serverId: string | null;
                model: string | null;
                id: string;
                status: string;
                createdAt: Date;
                updatedAt: Date;
                version: number;
                ownerId: string | null;
                color: string | null;
                notes: string | null;
                custom: import("@prisma/client/runtime/library").JsonValue | null;
                plate: string;
                erlcReference: string | null;
            }[];
        } & {
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
        };
        tickets: {
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
        }[];
        links: {
            role: string;
            id: string;
            createdAt: Date;
            personId: string | null;
            vehicleId: string | null;
            entityType: string;
            entityId: string;
        }[];
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
        };
        possibleDuplicates: {
            id: string;
            status: string;
            robloxUserId: string | null;
            robloxUsername: string;
        }[];
    }>;
    update(a: Actor, id: string, b: z.infer<typeof update>): Promise<{
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
    }>;
    archive(a: Actor, id: string, b: z.infer<typeof archive>): Promise<{
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
    }>;
    merge(a: Actor, id: string, b: z.infer<typeof merge>): Promise<{
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
    }>;
}
export {};
