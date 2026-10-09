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
    callsign?: string | undefined;
    rank?: string | undefined;
    team?: string | undefined;
    office?: string | undefined;
    qualifications?: string[] | undefined;
}, {
    userId: string;
    serviceNumber?: string | undefined;
    callsign?: string | undefined;
    rank?: string | undefined;
    team?: string | undefined;
    office?: string | undefined;
    qualifications?: string[] | undefined;
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
    callsign?: string | undefined;
    team?: string | undefined;
    office?: string | null | undefined;
    employmentStatus?: "LOA" | "ACTIVE" | "RESIGNED" | "TERMINATED" | "SUSPENDED" | undefined;
    qualifications?: string[] | undefined;
}, {
    serviceNumber?: string | null | undefined;
    callsign?: string | undefined;
    team?: string | undefined;
    office?: string | null | undefined;
    employmentStatus?: "LOA" | "ACTIVE" | "RESIGNED" | "TERMINATED" | "SUSPENDED" | undefined;
    qualifications?: string[] | undefined;
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
                displayName: string;
                robloxUserId: string | null;
            };
        } & {
            serviceNumber: string | null;
            id: string;
            updatedAt: Date;
            userId: string;
            callsign: string | null;
            rank: string | null;
            team: string | null;
            office: string | null;
            employmentStatus: string;
            joinDate: Date;
            qualifications: string[];
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
            displayName: string;
            robloxUserId: string | null;
            robloxUsername: string | null;
            lastLogin: Date | null;
        };
        academyEnrollments: ({
            course: {
                id: string;
                title: string;
                description: string | null;
                passScore: number;
                instructorId: string | null;
            };
            results: {
                id: string;
                createdAt: Date;
                enrollmentId: string;
                score: number;
                passed: boolean;
                gradedById: string | null;
            }[];
        } & {
            id: string;
            createdAt: Date;
            personnelId: string;
            courseId: string;
        })[];
        records: {
            id: string;
            type: string;
            status: string | null;
            createdAt: Date;
            updatedAt: Date;
            createdById: string;
            expiresAt: Date | null;
            personnelId: string;
            summary: string;
            details: string | null;
            data: import("@prisma/client/runtime/library").JsonValue | null;
            attachments: string[];
            deletedAt: Date | null;
        }[];
    } & {
        serviceNumber: string | null;
        id: string;
        updatedAt: Date;
        userId: string;
        callsign: string | null;
        rank: string | null;
        team: string | null;
        office: string | null;
        employmentStatus: string;
        joinDate: Date;
        qualifications: string[];
        rankSince: Date;
        customChecks: import("@prisma/client/runtime/library").JsonValue;
    }>;
    create(a: Actor, b: z.infer<typeof create>): Promise<{
        serviceNumber: string | null;
        id: string;
        updatedAt: Date;
        userId: string;
        callsign: string | null;
        rank: string | null;
        team: string | null;
        office: string | null;
        employmentStatus: string;
        joinDate: Date;
        qualifications: string[];
        rankSince: Date;
        customChecks: import("@prisma/client/runtime/library").JsonValue;
    }>;
    update(a: Actor, id: string, b: z.infer<typeof update>): Promise<{
        serviceNumber: string | null;
        id: string;
        updatedAt: Date;
        userId: string;
        callsign: string | null;
        rank: string | null;
        team: string | null;
        office: string | null;
        employmentStatus: string;
        joinDate: Date;
        qualifications: string[];
        rankSince: Date;
        customChecks: import("@prisma/client/runtime/library").JsonValue;
    }>;
    promote(a: Actor, id: string, b: z.infer<typeof promote>): Promise<{
        serviceNumber: string | null;
        id: string;
        updatedAt: Date;
        userId: string;
        callsign: string | null;
        rank: string | null;
        team: string | null;
        office: string | null;
        employmentStatus: string;
        joinDate: Date;
        qualifications: string[];
        rankSince: Date;
        customChecks: import("@prisma/client/runtime/library").JsonValue;
    }>;
    record(a: Actor, id: string, b: z.infer<typeof record>): Promise<{
        id: string;
        type: string;
        status: string | null;
        createdAt: Date;
        updatedAt: Date;
        createdById: string;
        expiresAt: Date | null;
        personnelId: string;
        summary: string;
        details: string | null;
        data: import("@prisma/client/runtime/library").JsonValue | null;
        attachments: string[];
        deletedAt: Date | null;
    }>;
}
export {};
