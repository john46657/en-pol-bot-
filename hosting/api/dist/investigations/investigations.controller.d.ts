import { z } from 'zod';
import { InvestigationsService } from './investigations.service';
import type { Actor } from '../audit/audit.service';
declare const create: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    leadId: z.ZodOptional<z.ZodString>;
    persons: z.ZodOptional<z.ZodArray<z.ZodObject<{
        personId: z.ZodString;
        role: z.ZodEnum<["SUSPECT", "WITNESS", "VICTIM", "PERSON_OF_INTEREST"]>;
    }, "strip", z.ZodTypeAny, {
        role: "SUSPECT" | "WITNESS" | "VICTIM" | "PERSON_OF_INTEREST";
        personId: string;
    }, {
        role: "SUSPECT" | "WITNESS" | "VICTIM" | "PERSON_OF_INTEREST";
        personId: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    title: string;
    description?: string | undefined;
    leadId?: string | undefined;
    persons?: {
        role: "SUSPECT" | "WITNESS" | "VICTIM" | "PERSON_OF_INTEREST";
        personId: string;
    }[] | undefined;
}, {
    title: string;
    description?: string | undefined;
    leadId?: string | undefined;
    persons?: {
        role: "SUSPECT" | "WITNESS" | "VICTIM" | "PERSON_OF_INTEREST";
        personId: string;
    }[] | undefined;
}>;
declare const addPerson: z.ZodObject<{
    personId: z.ZodString;
    role: z.ZodEnum<["SUSPECT", "WITNESS", "VICTIM", "PERSON_OF_INTEREST"]>;
}, "strip", z.ZodTypeAny, {
    role: "SUSPECT" | "WITNESS" | "VICTIM" | "PERSON_OF_INTEREST";
    personId: string;
}, {
    role: "SUSPECT" | "WITNESS" | "VICTIM" | "PERSON_OF_INTEREST";
    personId: string;
}>;
declare const status: z.ZodObject<{
    status: z.ZodEffects<z.ZodEnum<["OPEN", "ACTIVE", "SUSPENDED", "CLOSED", "ARCHIVED"]>, "ACTIVE" | "OPEN" | "ARCHIVED" | "SUSPENDED", "ACTIVE" | "CLOSED" | "OPEN" | "ARCHIVED" | "SUSPENDED">;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "ACTIVE" | "OPEN" | "ARCHIVED" | "SUSPENDED";
    reason?: string | undefined;
}, {
    status: "ACTIVE" | "CLOSED" | "OPEN" | "ARCHIVED" | "SUSPENDED";
    reason?: string | undefined;
}>;
declare const update: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    leadId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    version: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    version?: number | undefined;
    title?: string | undefined;
    description?: string | null | undefined;
    leadId?: string | null | undefined;
}, {
    version?: number | undefined;
    title?: string | undefined;
    description?: string | null | undefined;
    leadId?: string | null | undefined;
}>;
declare const note: z.ZodObject<{
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    text: string;
}, {
    text: string;
}>;
declare const listQ: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
} & {
    status: z.ZodOptional<z.ZodEnum<["OPEN", "ACTIVE", "SUSPENDED", "CLOSED", "ARCHIVED"]>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    status?: "ACTIVE" | "CLOSED" | "OPEN" | "ARCHIVED" | "SUSPENDED" | undefined;
    q?: string | undefined;
}, {
    status?: "ACTIVE" | "CLOSED" | "OPEN" | "ARCHIVED" | "SUSPENDED" | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
export declare class InvestigationsController {
    private readonly i;
    constructor(i: InvestigationsService);
    list(q: z.infer<typeof listQ>): Promise<{
        items: {
            serverId: string | null;
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            title: string;
            description: string | null;
            caseNumber: string;
            leadId: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        investigation: {
            lead: {
                id: string;
                displayName: string;
            } | null;
            serverId: string | null;
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            title: string;
            description: string | null;
            caseNumber: string;
            leadId: string | null;
        };
        links: ({
            person: {
                id: string;
                robloxUsername: string;
            } | null;
        } & {
            role: string;
            id: string;
            createdAt: Date;
            personId: string | null;
            vehicleId: string | null;
            entityId: string;
            entityType: string;
        })[];
        evidence: {
            number: string;
            id: string;
            type: string;
            custodyState: string;
        }[];
        timeline: {
            actorName: string | null;
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
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        title: string;
        description: string | null;
        caseNumber: string;
        leadId: string | null;
    }>;
    update(a: Actor, id: string, b: z.infer<typeof update>): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        title: string;
        description: string | null;
        caseNumber: string;
        leadId: string | null;
    }>;
    addNote(a: Actor, id: string, b: z.infer<typeof note>): Promise<{
        ok: boolean;
    }>;
    addPerson(a: Actor, id: string, b: z.infer<typeof addPerson>): Promise<void>;
    setStatus(a: Actor, id: string, b: z.infer<typeof status>): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        title: string;
        description: string | null;
        caseNumber: string;
        leadId: string | null;
    }>;
    close(a: Actor, id: string, b: {
        reason: string;
    }): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        title: string;
        description: string | null;
        caseNumber: string;
        leadId: string | null;
    }>;
}
export {};
