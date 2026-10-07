import { z } from 'zod';
import { PersonnelService } from './personnel.service';
import type { Actor } from '../audit/audit.service';
import { pageQuery } from '../common/pagination';
declare const create: z.ZodObject<{
    userId: z.ZodString;
    rank: z.ZodOptional<z.ZodString>;
    team: z.ZodOptional<z.ZodString>;
    office: z.ZodOptional<z.ZodString>;
    serviceNumber: z.ZodOptional<z.ZodString>;
    callsign: z.ZodOptional<z.ZodString>;
    qualifications: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    userId: string;
    serviceNumber?: string | undefined;
    qualifications?: string[] | undefined;
    team?: string | undefined;
    rank?: string | undefined;
    callsign?: string | undefined;
    office?: string | undefined;
}, {
    userId: string;
    serviceNumber?: string | undefined;
    qualifications?: string[] | undefined;
    team?: string | undefined;
    rank?: string | undefined;
    callsign?: string | undefined;
    office?: string | undefined;
}>;
declare const update: z.ZodObject<{
    team: z.ZodOptional<z.ZodString>;
    office: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    serviceNumber: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    callsign: z.ZodOptional<z.ZodString>;
    employmentStatus: z.ZodOptional<z.ZodEnum<["ACTIVE", "LOA", "SUSPENDED", "RESIGNED", "TERMINATED"]>>;
    qualifications: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    serviceNumber?: string | null | undefined;
    qualifications?: string[] | undefined;
    team?: string | undefined;
    callsign?: string | undefined;
    office?: string | null | undefined;
    employmentStatus?: "LOA" | "ACTIVE" | "RESIGNED" | "TERMINATED" | "SUSPENDED" | undefined;
}, {
    serviceNumber?: string | null | undefined;
    qualifications?: string[] | undefined;
    team?: string | undefined;
    callsign?: string | undefined;
    office?: string | null | undefined;
    employmentStatus?: "LOA" | "ACTIVE" | "RESIGNED" | "TERMINATED" | "SUSPENDED" | undefined;
}>;
declare const promote: z.ZodObject<{
    rank: z.ZodString;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
    rank: string;
}, {
    reason: string;
    rank: string;
}>;
declare const record: z.ZodObject<{
    type: z.ZodEnum<["AWARD", "DISCIPLINE", "NOTE"]>;
    summary: z.ZodString;
    details: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "NOTE" | "AWARD" | "DISCIPLINE";
    summary: string;
    details?: string | undefined;
}, {
    type: "NOTE" | "AWARD" | "DISCIPLINE";
    summary: string;
    details?: string | undefined;
}>;
export declare class PersonnelController {
    private readonly p;
    constructor(p: PersonnelService);
    list(q: z.infer<typeof pageQuery>): Promise<{
        items: ({
            user: {
                id: string;
                robloxUserId: string | null;
                displayName: string;
            };
        } & {
            serviceNumber: string | null;
            id: string;
            qualifications: string[];
            userId: string;
            updatedAt: Date;
            team: string | null;
            rank: string | null;
            callsign: string | null;
            office: string | null;
            employmentStatus: string;
            joinDate: Date;
            rankSince: Date;
            customChecks: import("@prisma/client/runtime/library").JsonValue;
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(a: Actor, id: string): Promise<{
        user: {
            id: string;
            robloxUserId: string | null;
            displayName: string;
            robloxUsername: string | null;
            lastLogin: Date | null;
        };
        academyEnrollments: ({
            course: {
                id: string;
                description: string | null;
                title: string;
                passScore: number;
                instructorId: string | null;
            };
            results: {
                id: string;
                createdAt: Date;
                score: number;
                passed: boolean;
                gradedById: string | null;
                enrollmentId: string;
            }[];
        } & {
            id: string;
            createdAt: Date;
            personnelId: string;
            courseId: string;
        })[];
        records: {
            data: import("@prisma/client/runtime/library").JsonValue | null;
            id: string;
            createdAt: Date;
            details: string | null;
            expiresAt: Date | null;
            updatedAt: Date;
            type: string;
            createdById: string;
            status: string | null;
            summary: string;
            attachments: string[];
            deletedAt: Date | null;
            personnelId: string;
        }[];
    } & {
        serviceNumber: string | null;
        id: string;
        qualifications: string[];
        userId: string;
        updatedAt: Date;
        team: string | null;
        rank: string | null;
        callsign: string | null;
        office: string | null;
        employmentStatus: string;
        joinDate: Date;
        rankSince: Date;
        customChecks: import("@prisma/client/runtime/library").JsonValue;
    }>;
    create(a: Actor, b: z.infer<typeof create>): Promise<{
        serviceNumber: string | null;
        id: string;
        qualifications: string[];
        userId: string;
        updatedAt: Date;
        team: string | null;
        rank: string | null;
        callsign: string | null;
        office: string | null;
        employmentStatus: string;
        joinDate: Date;
        rankSince: Date;
        customChecks: import("@prisma/client/runtime/library").JsonValue;
    }>;
    update(a: Actor, id: string, b: z.infer<typeof update>): Promise<{
        serviceNumber: string | null;
        id: string;
        qualifications: string[];
        userId: string;
        updatedAt: Date;
        team: string | null;
        rank: string | null;
        callsign: string | null;
        office: string | null;
        employmentStatus: string;
        joinDate: Date;
        rankSince: Date;
        customChecks: import("@prisma/client/runtime/library").JsonValue;
    }>;
    promote(a: Actor, id: string, b: z.infer<typeof promote>): Promise<{
        serviceNumber: string | null;
        id: string;
        qualifications: string[];
        userId: string;
        updatedAt: Date;
        team: string | null;
        rank: string | null;
        callsign: string | null;
        office: string | null;
        employmentStatus: string;
        joinDate: Date;
        rankSince: Date;
        customChecks: import("@prisma/client/runtime/library").JsonValue;
    }>;
    record(a: Actor, id: string, b: z.infer<typeof record>): Promise<{
        data: import("@prisma/client/runtime/library").JsonValue | null;
        id: string;
        createdAt: Date;
        details: string | null;
        expiresAt: Date | null;
        updatedAt: Date;
        type: string;
        createdById: string;
        status: string | null;
        summary: string;
        attachments: string[];
        deletedAt: Date | null;
        personnelId: string;
    }>;
}
export {};
