import { z } from 'zod';
import { PersonnelService } from './personnel.service';
import type { Actor } from '../audit/audit.service';
import { pageQuery } from '../common/pagination';
declare const create: z.ZodObject<{
    userId: z.ZodString;
    rank: z.ZodOptional<z.ZodString>;
    team: z.ZodOptional<z.ZodString>;
    callsign: z.ZodOptional<z.ZodString>;
    qualifications: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    userId: string;
    team?: string | undefined;
    qualifications?: string[] | undefined;
    callsign?: string | undefined;
    rank?: string | undefined;
}, {
    userId: string;
    team?: string | undefined;
    qualifications?: string[] | undefined;
    callsign?: string | undefined;
    rank?: string | undefined;
}>;
declare const update: z.ZodObject<{
    team: z.ZodOptional<z.ZodString>;
    callsign: z.ZodOptional<z.ZodString>;
    employmentStatus: z.ZodOptional<z.ZodEnum<["ACTIVE", "LOA", "SUSPENDED", "RESIGNED", "TERMINATED"]>>;
    qualifications: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    team?: string | undefined;
    qualifications?: string[] | undefined;
    callsign?: string | undefined;
    employmentStatus?: "ACTIVE" | "SUSPENDED" | "LOA" | "RESIGNED" | "TERMINATED" | undefined;
}, {
    team?: string | undefined;
    qualifications?: string[] | undefined;
    callsign?: string | undefined;
    employmentStatus?: "ACTIVE" | "SUSPENDED" | "LOA" | "RESIGNED" | "TERMINATED" | undefined;
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
    summary: string;
    type: "AWARD" | "DISCIPLINE" | "NOTE";
    details?: string | undefined;
}, {
    summary: string;
    type: "AWARD" | "DISCIPLINE" | "NOTE";
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
            userId: string;
            team: string | null;
            qualifications: string[];
            callsign: string | null;
            rank: string | null;
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
            details: string | null;
            id: string;
            createdById: string;
            createdAt: Date;
            summary: string;
            type: string;
            personnelId: string;
        }[];
    } & {
        id: string;
        userId: string;
        team: string | null;
        qualifications: string[];
        callsign: string | null;
        rank: string | null;
        employmentStatus: string;
        joinDate: Date;
    }>;
    create(a: Actor, b: z.infer<typeof create>): Promise<{
        id: string;
        userId: string;
        team: string | null;
        qualifications: string[];
        callsign: string | null;
        rank: string | null;
        employmentStatus: string;
        joinDate: Date;
    }>;
    update(a: Actor, id: string, b: z.infer<typeof update>): Promise<{
        id: string;
        userId: string;
        team: string | null;
        qualifications: string[];
        callsign: string | null;
        rank: string | null;
        employmentStatus: string;
        joinDate: Date;
    }>;
    promote(a: Actor, id: string, b: z.infer<typeof promote>): Promise<{
        id: string;
        userId: string;
        team: string | null;
        qualifications: string[];
        callsign: string | null;
        rank: string | null;
        employmentStatus: string;
        joinDate: Date;
    }>;
    record(a: Actor, id: string, b: z.infer<typeof record>): Promise<{
        details: string | null;
        id: string;
        createdById: string;
        createdAt: Date;
        summary: string;
        type: string;
        personnelId: string;
    }>;
}
export {};
