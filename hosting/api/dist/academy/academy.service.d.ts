import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { DiscordService } from '../discord/discord.service';
/** Standard für Ankündigungen in Discord (Kanal + Rollen, die gepingt werden). */
export declare const academyConfigSchema: z.ZodObject<{
    channelId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    pingRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    channelId: string | null;
    pingRoleIds: string[];
}, {
    channelId?: string | null | undefined;
    pingRoleIds?: string[] | undefined;
}>;
export type AcademyConfig = z.infer<typeof academyConfigSchema>;
/** Ankündigung eines Kurses: Kanal/Rollen (sonst der Standard), optional Termin und Ort. */
export declare const announceSchema: z.ZodObject<{
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
}>;
export type Announce = z.infer<typeof announceSchema>;
export declare class AcademyService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    private readonly discord;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService, discord: DiscordService);
    courses(): Prisma.PrismaPromise<({
        _count: {
            enrollments: number;
        };
    } & {
        id: string;
        title: string;
        description: string | null;
        instructorId: string | null;
        passScore: number;
    })[]>;
    config(): Promise<AcademyConfig>;
    saveConfig(actor: Actor, c: AcademyConfig): Promise<{
        channelId: string | null;
        pingRoleIds: string[];
    }>;
    createCourse(actor: Actor, d: {
        title: string;
        description?: string;
        passScore?: number;
        instructorId?: string;
    }, announce?: Announce): Promise<{
        announced: {
            channelId: string | null;
            pingRoleIds: string[];
        } | null;
        id: string;
        title: string;
        description: string | null;
        instructorId: string | null;
        passScore: number;
    }>;
    /** Kurs in Discord ankündigen (mit Rollen-Ping). Kanal/Rollen aus der Anfrage, sonst der gespeicherte Standard, sonst der Ankündigungs-Kanal. */
    announce(actor: Actor, id: string, a: Announce): Promise<{
        channelId: string | null;
        pingRoleIds: string[];
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
        passed: boolean;
        score: number;
        gradedById: string | null;
        enrollmentId: string;
    }>;
}
