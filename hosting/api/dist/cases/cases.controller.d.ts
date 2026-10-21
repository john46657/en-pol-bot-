import { z } from 'zod';
import type { Actor } from '../audit/audit.service';
import { CasesService } from './cases.service';
declare const linkType: z.ZodEnum<["INCIDENT", "CALL", "REPORT", "WANTED", "PERSON", "VEHICLE", "TICKET", "COMPLAINT", "UNIT", "OFFICER", "HR_REQUEST", "PERSONNEL_RECORD"]>;
declare const link: z.ZodObject<{
    entityType: z.ZodEnum<["INCIDENT", "CALL", "REPORT", "WANTED", "PERSON", "VEHICLE", "TICKET", "COMPLAINT", "UNIT", "OFFICER", "HR_REQUEST", "PERSONNEL_RECORD"]>;
    entityId: z.ZodString;
    role: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    note: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    entityId: string;
    entityType: "INCIDENT" | "REPORT" | "WANTED" | "CALL" | "PERSON" | "VEHICLE" | "TICKET" | "COMPLAINT" | "UNIT" | "OFFICER" | "HR_REQUEST" | "PERSONNEL_RECORD";
    role?: string | null | undefined;
    note?: string | null | undefined;
}, {
    entityId: string;
    entityType: "INCIDENT" | "REPORT" | "WANTED" | "CALL" | "PERSON" | "VEHICLE" | "TICKET" | "COMPLAINT" | "UNIT" | "OFFICER" | "HR_REQUEST" | "PERSONNEL_RECORD";
    role?: string | null | undefined;
    note?: string | null | undefined;
}>;
declare const listQ: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["OPEN", "IN_PROGRESS", "CLOSED"]>>;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
    incidentNumber: z.ZodOptional<z.ZodString>;
    entityType: z.ZodOptional<z.ZodEnum<["INCIDENT", "CALL", "REPORT", "WANTED", "PERSON", "VEHICLE", "TICKET", "COMPLAINT", "UNIT", "OFFICER", "HR_REQUEST", "PERSONNEL_RECORD"]>>;
    entityId: z.ZodOptional<z.ZodString>;
    page: z.ZodOptional<z.ZodNumber>;
    pageSize: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    status?: "OPEN" | "CLOSED" | "IN_PROGRESS" | undefined;
    entityId?: string | undefined;
    entityType?: "INCIDENT" | "REPORT" | "WANTED" | "CALL" | "PERSON" | "VEHICLE" | "TICKET" | "COMPLAINT" | "UNIT" | "OFFICER" | "HR_REQUEST" | "PERSONNEL_RECORD" | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
    from?: string | undefined;
    incidentNumber?: string | undefined;
    to?: string | undefined;
}, {
    status?: "OPEN" | "CLOSED" | "IN_PROGRESS" | undefined;
    entityId?: string | undefined;
    entityType?: "INCIDENT" | "REPORT" | "WANTED" | "CALL" | "PERSON" | "VEHICLE" | "TICKET" | "COMPLAINT" | "UNIT" | "OFFICER" | "HR_REQUEST" | "PERSONNEL_RECORD" | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
    from?: string | undefined;
    incidentNumber?: string | undefined;
    to?: string | undefined;
}>;
declare const createB: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    links: z.ZodOptional<z.ZodArray<z.ZodObject<{
        entityType: z.ZodEnum<["INCIDENT", "CALL", "REPORT", "WANTED", "PERSON", "VEHICLE", "TICKET", "COMPLAINT", "UNIT", "OFFICER", "HR_REQUEST", "PERSONNEL_RECORD"]>;
        entityId: z.ZodString;
        role: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        note: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        entityId: string;
        entityType: "INCIDENT" | "REPORT" | "WANTED" | "CALL" | "PERSON" | "VEHICLE" | "TICKET" | "COMPLAINT" | "UNIT" | "OFFICER" | "HR_REQUEST" | "PERSONNEL_RECORD";
        role?: string | null | undefined;
        note?: string | null | undefined;
    }, {
        entityId: string;
        entityType: "INCIDENT" | "REPORT" | "WANTED" | "CALL" | "PERSON" | "VEHICLE" | "TICKET" | "COMPLAINT" | "UNIT" | "OFFICER" | "HR_REQUEST" | "PERSONNEL_RECORD";
        role?: string | null | undefined;
        note?: string | null | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    title: string;
    links?: {
        entityId: string;
        entityType: "INCIDENT" | "REPORT" | "WANTED" | "CALL" | "PERSON" | "VEHICLE" | "TICKET" | "COMPLAINT" | "UNIT" | "OFFICER" | "HR_REQUEST" | "PERSONNEL_RECORD";
        role?: string | null | undefined;
        note?: string | null | undefined;
    }[] | undefined;
    description?: string | null | undefined;
}, {
    title: string;
    links?: {
        entityId: string;
        entityType: "INCIDENT" | "REPORT" | "WANTED" | "CALL" | "PERSON" | "VEHICLE" | "TICKET" | "COMPLAINT" | "UNIT" | "OFFICER" | "HR_REQUEST" | "PERSONNEL_RECORD";
        role?: string | null | undefined;
        note?: string | null | undefined;
    }[] | undefined;
    description?: string | null | undefined;
}>;
declare const updateB: z.ZodObject<{
    version: z.ZodNumber;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodEnum<["OPEN", "IN_PROGRESS", "CLOSED"]>>;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    version: number;
    status?: "OPEN" | "CLOSED" | "IN_PROGRESS" | undefined;
    title?: string | undefined;
    description?: string | null | undefined;
    reason?: string | undefined;
}, {
    version: number;
    status?: "OPEN" | "CLOSED" | "IN_PROGRESS" | undefined;
    title?: string | undefined;
    description?: string | null | undefined;
    reason?: string | undefined;
}>;
declare const decideB: z.ZodObject<{
    keepId: z.ZodString;
    otherId: z.ZodString;
    decision: z.ZodEnum<["NOT_DUPLICATE", "MERGE"]>;
    note: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    decision: "NOT_DUPLICATE" | "MERGE";
    keepId: string;
    otherId: string;
    note?: string | undefined;
}, {
    decision: "NOT_DUPLICATE" | "MERGE";
    keepId: string;
    otherId: string;
    note?: string | undefined;
}>;
export declare class CasesController {
    private readonly s;
    constructor(s: CasesService);
    list(a: Actor, q: z.infer<typeof listQ>): Promise<{
        items: {
            id: string;
            number: string;
            title: string;
            status: string;
            statusLabel: string;
            createdAt: Date;
            updatedAt: Date;
            links: number;
            mergedIntoId: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    duplicates(): Promise<{
        a: {
            id: string;
            number: string;
            title: string;
        };
        b: {
            id: string;
            number: string;
            title: string;
        };
        strength: "STRONG" | "WEAK";
        reasons: string[];
    }[]>;
    decide(a: Actor, b: z.infer<typeof decideB>): Promise<{
        decision: "NOT_DUPLICATE" | "MERGE";
        moved: number;
    }>;
    forEntity(type: z.infer<typeof linkType>, id: string): Promise<{
        statusLabel: string;
        linkedAt: Date;
        linkedAtLabel: string;
        number: string;
        id: string;
        status: string;
        createdAt: Date;
        title: string;
    }[]>;
    get(a: Actor, id: string): Promise<{
        id: string;
        number: string;
        title: string;
        description: string | null;
        status: string;
        statusLabel: string;
        version: number;
        createdAt: Date;
        updatedAt: Date;
        closedAt: Date | null;
        createdBy: string;
        mergedIntoId: string | null;
        links: {
            id: string;
            entityType: string;
            typeLabel: string;
            entityId: string | null;
            role: string | null;
            note: string | null;
            label: string;
            visible: boolean;
            gone: boolean;
            status: string | null;
            occurredAt: Date | null;
            addedAt: Date;
            addedBy: string;
            removedAt: Date | null;
            removedBy: string | null;
            removeReason: string | null;
        }[];
        removedLinks: {
            id: string;
            entityType: string;
            typeLabel: string;
            entityId: string | null;
            role: string | null;
            note: string | null;
            label: string;
            visible: boolean;
            gone: boolean;
            status: string | null;
            occurredAt: Date | null;
            addedAt: Date;
            addedBy: string;
            removedAt: Date | null;
            removedBy: string | null;
            removeReason: string | null;
        }[];
        events: {
            at: Date;
            kind: string;
            text: string;
            actor: string | null;
            source: string;
        }[];
    }>;
    create(a: Actor, b: z.infer<typeof createB>): Promise<{
        number: string;
        serverId: string | null;
        id: string;
        status: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        title: string;
        description: string | null;
        closedAt: Date | null;
        mergedIntoId: string | null;
    }>;
    update(a: Actor, id: string, b: z.infer<typeof updateB>): Promise<{
        number: string;
        serverId: string | null;
        id: string;
        status: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        title: string;
        description: string | null;
        closedAt: Date | null;
        mergedIntoId: string | null;
    }>;
    addLink(a: Actor, id: string, b: z.infer<typeof link>): Promise<{
        role: string | null;
        id: string;
        note: string | null;
        addedById: string;
        occurredAt: Date | null;
        entityId: string;
        entityType: string;
        label: string;
        caseId: string;
        addedAt: Date;
        removedById: string | null;
        removedAt: Date | null;
        removeReason: string | null;
    }>;
    removeLink(a: Actor, id: string, linkId: string, b: {
        reason: string;
    }): Promise<void>;
}
export {};
