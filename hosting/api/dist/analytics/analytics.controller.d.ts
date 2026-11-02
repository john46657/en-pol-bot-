import type { Response } from 'express';
import type { Actor } from '../audit/audit.service';
import { periodQ, statsConfigSchema, StatsService } from './stats.service';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import type { AuthUser } from '../common/request-context';
declare const q: z.ZodObject<{
    days: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    days: number;
}, {
    days?: number | undefined;
}>;
/** Jede Kennzahl wird nur ausgeliefert, wenn der Benutzer die zugehörige Fachpermission besitzt. */
export declare class AnalyticsController {
    private readonly prisma;
    private readonly perms;
    private readonly stats;
    constructor(prisma: PrismaService, perms: PermissionService, stats: StatsService);
    /** Eigene Statistik (jeder Angemeldete); mit `userId` eine andere Person – nur analytics.personal_all (im Service geprüft). */
    personal(a: Actor, q: z.infer<typeof periodQ> & {
        userId?: string;
    }): Promise<{
        from: Date;
        to: Date;
        stats: import("./stats.service").PersonStats | null;
    }>;
    team(a: Actor, q: z.infer<typeof periodQ>): Promise<{
        from: Date;
        to: Date;
        totals: {
            dutyHours: number;
            shifts: number;
            dutyReports: number;
            weeklyReports: number;
            trainings: number;
            exams: number;
            tickets: number;
            meetings: number;
            absenceDays: number;
            events: number;
            active: number;
            people: number;
        };
        series: {
            day: string;
            hours: number;
        }[];
        people: import("./stats.service").PersonStats[];
    }>;
    leaderboards(a: Actor, q: z.infer<typeof periodQ>): Promise<{
        from: Date;
        to: Date;
        boards: {
            key: "tickets" | "dutyReports" | "meetings" | "dutyMinutes" | "trainings";
            label: "Dienstzeit" | "Abgeschlossene Ausbildungen" | "Dienstberichte" | "Ticketbearbeitungen" | "Besprechungsteilnahmen";
            unit: "Tickets" | "Minuten" | "Ausbildungen" | "Berichte" | "Teilnahmen";
            rows: ({
                userId: string;
                name: string;
                value: number;
            } & {
                place: number;
            })[];
        }[];
    }>;
    export(a: Actor, q: z.infer<typeof periodQ>, res: Response): Promise<void>;
    config(): Promise<{
        size: number;
        leaderboards: ("tickets" | "dutyReports" | "meetings" | "dutyMinutes" | "trainings")[];
    }>;
    saveConfig(a: Actor, b: z.infer<typeof statsConfigSchema>): Promise<{
        size: number;
        leaderboards: ("tickets" | "dutyReports" | "meetings" | "dutyMinutes" | "trainings")[];
    }>;
    overview(u: AuthUser, f: z.infer<typeof q>): Promise<Record<string, unknown>>;
    /**
     * Tagesverlauf für Diagramme (Tage in Europe/Berlin). Gleiche Rechte wie die Übersicht – je Reihe die Fachpermission.
     * Über Prisma-Abfragen (nicht SQL), damit die Server-Trennung automatisch greift.
     */
    trend(u: AuthUser, f: z.infer<typeof q>): Promise<{
        days: string[];
        series: {
            key: string;
            label: string;
            unit: string;
            values: number[];
        }[];
    }>;
}
export {};
