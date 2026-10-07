import { z } from 'zod';
import { EvidenceService } from './evidence.service';
import type { Actor } from '../audit/audit.service';
import { pageQuery } from '../common/pagination';
declare const create: z.ZodObject<{
    type: z.ZodString;
    description: z.ZodString;
    source: z.ZodOptional<z.ZodString>;
    caseRef: z.ZodOptional<z.ZodString>;
    storageLocation: z.ZodOptional<z.ZodString>;
    personIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    type: string;
    description: string;
    source?: string | undefined;
    personIds?: string[] | undefined;
    caseRef?: string | undefined;
    storageLocation?: string | undefined;
}, {
    type: string;
    description: string;
    source?: string | undefined;
    personIds?: string[] | undefined;
    caseRef?: string | undefined;
    storageLocation?: string | undefined;
}>;
declare const transfer: z.ZodObject<{
    to: z.ZodEffects<z.ZodEnum<["COLLECTED", "STORED", "TRANSFERRED", "REVIEWED", "RELEASED", "ARCHIVED"]>, "ARCHIVED" | "COLLECTED" | "STORED" | "TRANSFERRED" | "REVIEWED", "ARCHIVED" | "COLLECTED" | "STORED" | "TRANSFERRED" | "REVIEWED" | "RELEASED">;
    toUserId: z.ZodOptional<z.ZodString>;
    reason: z.ZodString;
    storageLocation: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    to: "ARCHIVED" | "COLLECTED" | "STORED" | "TRANSFERRED" | "REVIEWED";
    storageLocation?: string | undefined;
    toUserId?: string | undefined;
}, {
    reason: string;
    to: "ARCHIVED" | "COLLECTED" | "STORED" | "TRANSFERRED" | "REVIEWED" | "RELEASED";
    storageLocation?: string | undefined;
    toUserId?: string | undefined;
}>;
export declare class EvidenceController {
    private readonly e;
    constructor(e: EvidenceService);
    list(q: z.infer<typeof pageQuery>): Promise<{
        items: {
            number: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            type: string;
            description: string;
            ownerId: string | null;
            source: string | null;
            caseRef: string | null;
            storageLocation: string | null;
            custodyState: string;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        transfers: {
            id: string;
            reason: string;
            createdAt: Date;
            confirmed: boolean;
            fromUserId: string | null;
            toUserId: string | null;
            fromState: string;
            toState: string;
            evidenceId: string;
        }[];
    } & {
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        description: string;
        ownerId: string | null;
        source: string | null;
        caseRef: string | null;
        storageLocation: string | null;
        custodyState: string;
    }>;
    create(a: Actor, b: z.infer<typeof create>): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        description: string;
        ownerId: string | null;
        source: string | null;
        caseRef: string | null;
        storageLocation: string | null;
        custodyState: string;
    }>;
    transfer(a: Actor, id: string, b: z.infer<typeof transfer>): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        description: string;
        ownerId: string | null;
        source: string | null;
        caseRef: string | null;
        storageLocation: string | null;
        custodyState: string;
    }>;
    release(a: Actor, id: string, b: {
        reason: string;
    }): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        description: string;
        ownerId: string | null;
        source: string | null;
        caseRef: string | null;
        storageLocation: string | null;
        custodyState: string;
    }>;
    confirm(a: Actor, id: string): Promise<{
        confirmed: boolean;
    }>;
}
export {};
