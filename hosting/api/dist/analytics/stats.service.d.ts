import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import { AuditService, type Actor } from '../audit/audit.service';
export declare const periodQ: z.ZodObject<{
    period: z.ZodDefault<z.ZodEnum<["today", "week", "month", "year", "custom"]>>;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    period: "custom" | "month" | "year" | "today" | "week";
    from?: string | undefined;
    to?: string | undefined;
}, {
    period?: "custom" | "month" | "year" | "today" | "week" | undefined;
    from?: string | undefined;
    to?: string | undefined;
}>;
export declare const statsConfigSchema: z.ZodObject<{
    /** Ranglisten an/aus; ausgeschaltete erscheinen nirgends */
    leaderboards: z.ZodDefault<z.ZodArray<z.ZodEnum<["tickets" | "dutyReports" | "meetings" | "dutyMinutes" | "trainings", ...("tickets" | "dutyReports" | "meetings" | "dutyMinutes" | "trainings")[]]>, "many">>;
    /** Plätze je Rangliste */
    size: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    size: number;
    leaderboards: ("tickets" | "dutyReports" | "meetings" | "dutyMinutes" | "trainings")[];
}, {
    size?: number | undefined;
    leaderboards?: ("tickets" | "dutyReports" | "meetings" | "dutyMinutes" | "trainings")[] | undefined;
}>;
type Range = {
    from: Date;
    to: Date;
};
export interface PersonStats {
    userId: string;
    name: string;
    dutyMinutes: number;
    shifts: number;
    dutyReports: number;
    weeklyReports: number;
    trainings: number;
    exams: number;
    tickets: number;
    meetings: number;
    absenceDays: number;
    events: number;
}
/**
 * Statistiken und Ranglisten – ausschließlich aus gespeicherten Daten (Stempeluhr, Schichtplan, Berichte, Ausbildungen, Prüfungen,
 * Tickets, Besprechungen, Abwesenheiten, Termine). Nur lesend: niemand kann Werte direkt setzen (auch nicht die eigenen).
 * Es gibt bewusst keine „Leistungs“-Kennzahl – nur Zählwerte. Server-Trennung über die Prisma-Erweiterung.
 */
export declare class StatsService {
    private readonly prisma;
    private readonly perms;
    private readonly audit;
    constructor(prisma: PrismaService, perms: PermissionService, audit: AuditService);
    config(): Promise<{
        size: number;
        leaderboards: ("tickets" | "dutyReports" | "meetings" | "dutyMinutes" | "trainings")[];
    }>;
    saveConfig(actor: Actor, c: z.infer<typeof statsConfigSchema>): Promise<{
        size: number;
        leaderboards: ("tickets" | "dutyReports" | "meetings" | "dutyMinutes" | "trainings")[];
    }>;
    range(q: z.infer<typeof periodQ>): Range;
    /** Kennzahlen je Person im Zeitraum (`userIds` leer = alle mit Personalakte auf diesem Server). */
    compute(r: Range, userIds?: string[]): Promise<PersonStats[]>;
    /** Eigene Statistik (jeder) bzw. einer anderen Person (analytics.personal_all). */
    personal(actor: Actor, q: z.infer<typeof periodQ>, userId?: string): Promise<{
        from: Date;
        to: Date;
        stats: PersonStats | null;
    }>;
    /** Team-Übersicht: Summen, Tagesverlauf Dienststunden, Tabelle je Person (analytics.view + personnel.view für Namen). */
    overview(actor: Actor, q: z.infer<typeof periodQ>): Promise<{
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
        people: PersonStats[];
    }>;
    /** Ranglisten (nur eingeschaltete Kennzahlen; Gleichstand = gleicher Platz; Nullwerte erscheinen nicht). */
    leaderboards(_actor: Actor, q: z.infer<typeof periodQ>): Promise<{
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
    exportCsv(actor: Actor, q: z.infer<typeof periodQ>): Promise<string>;
}
export {};
