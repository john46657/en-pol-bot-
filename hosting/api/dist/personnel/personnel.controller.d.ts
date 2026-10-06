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
    qualifications?: string[] | undefined;
    team?: string | undefined;
    rank?: string | undefined;
    callsign?: string | undefined;
    office?: string | undefined;
    serviceNumber?: string | undefined;
}, {
    userId: string;
    qualifications?: string[] | undefined;
    team?: string | undefined;
    rank?: string | undefined;
    callsign?: string | undefined;
    office?: string | undefined;
    serviceNumber?: string | undefined;
}>;
declare const update: z.ZodObject<{
    team: z.ZodOptional<z.ZodString>;
    office: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    serviceNumber: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    callsign: z.ZodOptional<z.ZodString>;
    employmentStatus: z.ZodOptional<z.ZodEnum<["ACTIVE", "LOA", "SUSPENDED", "RESIGNED", "TERMINATED"]>>;
    qualifications: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    qualifications?: string[] | undefined;
    team?: string | undefined;
    callsign?: string | undefined;
    office?: string | null | undefined;
    serviceNumber?: string | null | undefined;
    employmentStatus?: "LOA" | "ACTIVE" | "RESIGNED" | "TERMINATED" | "SUSPENDED" | undefined;
}, {
    qualifications?: string[] | undefined;
    team?: string | undefined;
    callsign?: string | undefined;
    office?: string | null | undefined;
    serviceNumber?: string | null | undefined;
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
    type: "AWARD" | "DISCIPLINE" | "NOTE";
    summary: string;
    details?: string | undefined;
}, {
    type: "AWARD" | "DISCIPLINE" | "NOTE";
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
            id: string;
            qualifications: string[];
            userId: string;
            team: string | null;
            rank: string | null;
            callsign: string | null;
            office: string | null;
            serviceNumber: string | null;
            employmentStatus: string;
            joinDate: Date;
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
            id: string;
            createdAt: Date;
            details: string | null;
            type: string;
            createdById: string;
            summary: string;
            personnelId: string;
        }[];
    } & {
        id: string;
        qualifications: string[];
        userId: string;
        team: string | null;
        rank: string | null;
        callsign: string | null;
        office: string | null;
        serviceNumber: string | null;
        employmentStatus: string;
        joinDate: Date;
    }>;
    create(a: Actor, b: z.infer<typeof create>): Promise<{
        id: string;
        qualifications: string[];
        userId: string;
        team: string | null;
        rank: string | null;
        callsign: string | null;
        office: string | null;
        serviceNumber: string | null;
        employmentStatus: string;
        joinDate: Date;
    }>;
    update(a: Actor, id: string, b: z.infer<typeof update>): Promise<{
        id: string;
        qualifications: string[];
        userId: string;
        team: string | null;
        rank: string | null;
        callsign: string | null;
        office: string | null;
        serviceNumber: string | null;
        employmentStatus: string;
        joinDate: Date;
    }>;
    promote(a: Actor, id: string, b: z.infer<typeof promote>): Promise<{
        id: string;
        qualifications: string[];
        userId: string;
        team: string | null;
        rank: string | null;
        callsign: string | null;
        office: string | null;
        serviceNumber: string | null;
        employmentStatus: string;
        joinDate: Date;
    }>;
    record(a: Actor, id: string, b: z.infer<typeof record>): Promise<{
        id: string;
        createdAt: Date;
        details: string | null;
        type: string;
        createdById: string;
        summary: string;
        personnelId: string;
    }>;
}
export {};
