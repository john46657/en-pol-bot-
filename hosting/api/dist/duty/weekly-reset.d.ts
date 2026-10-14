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
 * Bereich des Wochen-Resets (`DutyWeekArchive.scope`). Es gibt nur noch `global`; Archive anderer Bereiche aus der früheren
 * Multi-Server-Zeit (`space:…`) bleiben unverändert erhalten und erscheinen weiter in der Archivliste.
 */
interface Scope {
    key: 'global';
    cfg: WeeklyResetConfig;
    channelId: string | null;
}
/**
 * Automatischer Wochen-Reset: jeden Montag 00:00 (Europe/Berlin, Sommer-/Winterzeit automatisch) wird die abgelaufene Woche
 * archiviert, die Rangliste in Discord veröffentlicht und erst danach der Wochenzähler auf die neue Woche gesetzt.
 * Gelöscht wird dabei nichts – der Zähler ist nur der Beginn der laufenden Woche; alle Schichten bleiben in `DutySession`.
 * Doppelte Resets verhindern Advisory-Lock + eindeutiges (Bereich, Woche) + Archiv/Discord/Zähler in EINER Transaktion.
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
    /** Der Wochen-Reset (wenn an), mit Discord-Ausgabe in den eingestellten Kanal bzw. den Dienst-Kanal. */
    scopes(): Promise<Scope[]>;
    /**
     * Prüft (jede halbe Minute und beim Start), ob ein Montag 00:00 überschritten ist, und holt jeden fälligen Reset genau einmal nach.
     * Ältere verpasste Wochen werden still archiviert; nur die zuletzt abgeschlossene Woche wird in Discord veröffentlicht.
     * `archived` enthält je Woche den Schlüssel (z. B. „2026-10-05“).
     */
    tick(now?: Date): Promise<{
        archived: string[];
        posted: number;
    }>;
    private runScope;
    /** Archiv der Woche [start, end) anlegen; bei der zuletzt abgeschlossenen Woche die Rangliste in die Discord-Warteschlange stellen. */
    private archiveWeek;
    private rank;
    private message;
    /** Laufende Woche fürs Dashboard: Zähler seit dem letzten Reset und der nächste Reset-Zeitpunkt (je Bereich). */
    current(now?: Date): Promise<{
        scope: string;
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
            label: string;
            weekKey: string;
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
    /** Alle Archive (auch die früheren je Server – nichts geht verloren). */
    archives(): Promise<{
        id: string;
        createdAt: Date;
        timezone: string;
        scope: string;
        label: string;
        weekStart: Date;
        weekEnd: Date;
        weekKey: string;
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
        sessions: Prisma.JsonValue;
        timezone: string;
        scope: string;
        label: string;
        weekStart: Date;
        weekEnd: Date;
        weekKey: string;
        totalMinutes: number;
        activeUsers: number;
        shiftCount: number;
        ranking: Prisma.JsonValue;
        discordChannelId: string | null;
        catchUp: boolean;
    }>;
}
export declare class WeeklyResetController {
    private readonly s;
    constructor(s: WeeklyResetService);
    /** Laufende Woche (Zähler, Rangliste, nächster Reset). */
    current(): Promise<{
        scope: string;
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
            label: string;
            weekKey: string;
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
    /** Einstellungen des Wochen-Resets. */
    config(): Promise<{
        channelId: string | null;
        enabled: boolean;
        topN: number;
        mention: boolean;
        scope: "global";
    }>;
    save(a: Actor, b: WeeklyResetConfig): Promise<{
        channelId: string | null;
        enabled: boolean;
        topN: number;
        mention: boolean;
        scope: "global";
    }>;
    /** Abgeschlossene Wochen (Rangliste je Woche); nie gelöscht. */
    archives(): Promise<{
        id: string;
        createdAt: Date;
        timezone: string;
        scope: string;
        label: string;
        weekStart: Date;
        weekEnd: Date;
        weekKey: string;
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
        sessions: Prisma.JsonValue;
        timezone: string;
        scope: string;
        label: string;
        weekStart: Date;
        weekEnd: Date;
        weekKey: string;
        totalMinutes: number;
        activeUsers: number;
        shiftCount: number;
        ranking: Prisma.JsonValue;
        discordChannelId: string | null;
        catchUp: boolean;
    }>;
}
export {};
