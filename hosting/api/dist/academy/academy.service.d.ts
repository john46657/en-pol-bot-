import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
export declare class AcademyService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService);
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
    createCourse(actor: Actor, d: {
        title: string;
        description?: string;
        passScore?: number;
        instructorId?: string;
    }): Promise<{
        id: string;
        description: string | null;
        title: string;
        passScore: number;
        instructorId: string | null;
    }>;
    enroll(actor: Actor, courseId: string, personnelId: string): Promise<{
        id: string;
        createdAt: Date;
        personnelId: string;
        courseId: string;
    }>;
    /** Bestehen wird serverseitig aus Punkten und Kurs-Schwelle berechnet, nie vom Client vorgegeben. Bestandene Kurse werden zur Qualifikation. */
    grade(actor: Actor, enrollmentId: string, score: number): Promise<{
        id: string;
        createdAt: Date;
        score: number;
        passed: boolean;
        gradedById: string | null;
        enrollmentId: string;
    }>;
}
