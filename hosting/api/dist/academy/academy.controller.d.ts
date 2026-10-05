import { z } from 'zod';
import { AcademyService } from './academy.service';
import type { Actor } from '../audit/audit.service';
declare const course: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    passScore: z.ZodOptional<z.ZodNumber>;
    instructorId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    title: string;
    description?: string | undefined;
    passScore?: number | undefined;
    instructorId?: string | undefined;
}, {
    title: string;
    description?: string | undefined;
    passScore?: number | undefined;
    instructorId?: string | undefined;
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
        description: string | null;
        title: string;
        passScore: number;
        instructorId: string | null;
    })[]>;
    create(ac: Actor, b: z.infer<typeof course>): Promise<{
        id: string;
        description: string | null;
        title: string;
        passScore: number;
        instructorId: string | null;
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
        score: number;
        passed: boolean;
        gradedById: string | null;
        enrollmentId: string;
    }>;
}
export {};
