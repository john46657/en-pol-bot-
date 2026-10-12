import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { RealtimeService } from '../realtime/realtime.service';
export declare const weeklyResetConfigSchema: z.ZodObject<{
    /** Wochen-Reset aktiv (Archiv + Rangliste + Zähler auf null) */
    enabled: z.ZodDefault<z.ZodBoolean>;
    /** Discord-Kanal der Rangliste; leer = Dienst-Kanal aus den Einstellungen */
    channelId: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    /** so viele Plätze in der Discord-Rangliste */
    topN: z.ZodDefault<z.ZodNumber>;
    /** Beamte in der Rangliste mit Discord-Erwähnung (ohne Ping) */
    mention: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    channelId: string | null;
    enabled: boolean;
    topN: number;
    mention: boolean;
}, {
    channelId?: string | null | undefined;
    enabled?: boolean | undefined;
    topN?: number | undefined;
    mention?: boolean | undefined;
}>;
export type WeeklyResetConfig = z.infer<typeof weeklyResetConfigSchema>;
export interface RankingEntry {
    place: number;
    userId: string;
    name: string;
    rank: string | null;
    callsign: string | null;
    discordId: string | null;
    minutes: number;
    breakMinutes: number;
    byStatus: Record<string, number>;
    sessions: number;
}
/**
 * Automatischer Wochen-Reset: jeden Montag 00:00 (Europe/Berlin, Sommer-/Winterzeit automatisch) wird die abgelaufene Woche
 * archiviert, die Rangliste in Discord veröffentlicht und erst danach der Wochenzähler auf die neue Woche gesetzt.
 * Gelöscht wird dabei nichts – der Zähler ist nur der Beginn der laufenden Woche; alle Schichten bleiben in `DutySession`.
 * Doppelte Resets verhindern Advisory-Lock + eindeutiges `weekStart` + Archiv/Discord/Zähler in EINER Transaktion.
 */
export declare class WeeklyResetService {
    private readonly prisma;
    private readonly audit;
    private readonly discord;
    private readonly rt;
    constructor(prisma: PrismaService, audit: AuditService, discord: DiscordService, rt: RealtimeService);
    config(): Promise<WeeklyResetConfig>;
    saveConfig(actor: Actor, input: WeeklyResetConfig): Promise<{
        channelId: string | null;
        enabled: boolean;
        topN: number;
        mention: boolean;
    }>;
    private state;
    private setState;
    /**
     * Prüft (jede halbe Minute und beim Start), ob ein Montag 00:00 überschritten ist, und holt jeden fälligen Reset genau einmal nach.
     * Ältere verpasste Wochen werden still archiviert; nur die zuletzt abgeschlossene Woche wird in Discord veröffentlicht.
     */
    tick(now?: Date): Promise<{
        archived: string[];
        posted: number;
    }>;
    /** Archiv der Woche [start, end) anlegen; bei der zuletzt abgeschlossenen Woche die Rangliste in die Discord-Warteschlange stellen. */
    private archiveWeek;
    private rank;
    private message;
    /** Laufende Woche fürs Dashboard: Zähler seit dem letzten Reset und der nächste Reset-Zeitpunkt. */
    current(now?: Date): Promise<{
        enabled: boolean;
        timezone: string;
        weekStart: Date;
        weekKey: string;
        label: string;
        nextResetAt: Date | null;
        overdue: boolean;
        lastResetAt: string | null;
        lastArchive: {
            id: string;
            createdAt: Date;
            weekKey: string;
            label: string;
            discordChannelId: string | null;
            catchUp: boolean;
        } | null;
        totalMinutes: number;
        users: {
            place: number;
            userId: string;
            name: string;
            rank: string | null;
            callsign: string | null;
            minutes: number;
            breakMinutes: number;
            byStatus: Record<string, number>;
            sessions: number;
        }[];
    }>;
    archives(): Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        timezone: string;
        weekStart: Date;
        weekEnd: Date;
        weekKey: string;
        label: string;
        totalMinutes: number;
        activeUsers: number;
        shiftCount: number;
        ranking: Prisma.JsonValue;
        discordChannelId: string | null;
        catchUp: boolean;
    }[]>;
    archive(id: string): Promise<{
        id: string;
        createdAt: Date;
        timezone: string;
        weekStart: Date;
        weekEnd: Date;
        weekKey: string;
        label: string;
        totalMinutes: number;
        activeUsers: number;
        shiftCount: number;
        ranking: Prisma.JsonValue;
        sessions: Prisma.JsonValue;
        discordChannelId: string | null;
        catchUp: boolean;
    }>;
}
export declare class WeeklyResetController {
    private readonly s;
    constructor(s: WeeklyResetService);
    /** Laufende Woche (Zähler, Rangliste, nächster Reset). */
    current(): Promise<{
        enabled: boolean;
        timezone: string;
        weekStart: Date;
        weekKey: string;
        label: string;
        nextResetAt: Date | null;
        overdue: boolean;
        lastResetAt: string | null;
        lastArchive: {
            id: string;
            createdAt: Date;
            weekKey: string;
            label: string;
            discordChannelId: string | null;
            catchUp: boolean;
        } | null;
        totalMinutes: number;
        users: {
            place: number;
            userId: string;
            name: string;
            rank: string | null;
            callsign: string | null;
            minutes: number;
            breakMinutes: number;
            byStatus: Record<string, number>;
            sessions: number;
        }[];
    }>;
    config(): Promise<{
        channelId: string | null;
        enabled: boolean;
        topN: number;
        mention: boolean;
    }>;
    save(a: Actor, b: WeeklyResetConfig): Promise<{
        channelId: string | null;
        enabled: boolean;
        topN: number;
        mention: boolean;
    }>;
    /** Abgeschlossene Wochen (Rangliste je Woche); nie gelöscht. */
    archives(): Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        timezone: string;
        weekStart: Date;
        weekEnd: Date;
        weekKey: string;
        label: string;
        totalMinutes: number;
        activeUsers: number;
        shiftCount: number;
        ranking: Prisma.JsonValue;
        discordChannelId: string | null;
        catchUp: boolean;
    }[]>;
    /** Vollständiges Archiv inkl. aller Dienst-Sitzungen der Woche (Schichtleitung). */
    archive(id: string): Promise<{
        id: string;
        createdAt: Date;
        timezone: string;
        weekStart: Date;
        weekEnd: Date;
        weekKey: string;
        label: string;
        totalMinutes: number;
        activeUsers: number;
        shiftCount: number;
        ranking: Prisma.JsonValue;
        sessions: Prisma.JsonValue;
        discordChannelId: string | null;
        catchUp: boolean;
    }>;
}
