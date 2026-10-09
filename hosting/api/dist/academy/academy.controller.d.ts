import { z } from 'zod';
import { AcademyService, type AcademyConfig, type Announce } from './academy.service';
import type { Actor } from '../audit/audit.service';
declare const course: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    passScore: z.ZodOptional<z.ZodNumber>;
    instructorId: z.ZodOptional<z.ZodString>;
    announce: z.ZodOptional<z.ZodObject<{
        channelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        pingRoleIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        when: z.ZodOptional<z.ZodDate>;
        location: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        location?: string | undefined;
        channelId?: string | null | undefined;
        pingRoleIds?: string[] | undefined;
        when?: Date | undefined;
    }, {
        location?: string | undefined;
        channelId?: string | null | undefined;
        pingRoleIds?: string[] | undefined;
        when?: Date | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    description?: string | undefined;
    passScore?: number | undefined;
    instructorId?: string | undefined;
    announce?: {
        location?: string | undefined;
        channelId?: string | null | undefined;
        pingRoleIds?: string[] | undefined;
        when?: Date | undefined;
    } | undefined;
}, {
    title: string;
    description?: string | undefined;
    passScore?: number | undefined;
    instructorId?: string | undefined;
    announce?: {
        location?: string | undefined;
        channelId?: string | null | undefined;
        pingRoleIds?: string[] | undefined;
        when?: Date | undefined;
    } | undefined;
}>;
export declare class AcademyController {
    private readonly a;
    constructor(a: AcademyService);
    courses(): import("@prisma/client").Prisma.PrismaPromise<({
        _count: {
            enrollments: number;
        };
    } & {
        id: string;
        title: string;
        description: string | null;
        passScore: number;
        instructorId: string | null;
    })[]>;
    create(ac: Actor, b: z.infer<typeof course>): Promise<{
        announced: {
            channelId: string | null;
            pingRoleIds: string[];
        } | null;
        id: string;
        title: string;
        description: string | null;
        passScore: number;
        instructorId: string | null;
    }>;
    /** Standard-Kanal und Ping-Rollen für Ankündigungen. */
    config(): Promise<{
        channelId: string | null;
        pingRoleIds: string[];
    }>;
    saveConfig(ac: Actor, b: AcademyConfig): Promise<{
        channelId: string | null;
        pingRoleIds: string[];
    }>;
    announce(ac: Actor, id: string, b: Announce): Promise<{
        channelId: string | null;
        pingRoleIds: string[];
    }>;
    enroll(ac: Actor, id: string, b: {
        personnelId: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        personnelId: string;
        courseId: string;
    }>;
    grade(ac: Actor, id: string, b: {
        score: number;
    }): Promise<{
        id: string;
        createdAt: Date;
        enrollmentId: string;
        score: number;
        passed: boolean;
        gradedById: string | null;
    }>;
}
export {};
