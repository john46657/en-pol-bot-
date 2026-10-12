import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ServersService } from '../multi-server/servers.service';
import { SyncService } from '../multi-server/sync.service';
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
/** Ein Bereich mit eigener Woche: `global` (alle Server) oder Akten-Bereich eines Servers bzw. einer gemeinsamen Shift-Log-Gruppe. */
interface Scope {
    key: string;
    /** Filter auf `DutySession.serverId`: undefined = alle, null = gemeinsamer Bestand, sonst der Bereich */
    space: string | null | undefined;
    cfg: WeeklyResetConfig;
    /** Discord-Ausgabe je Server des Bereichs (global: guildId null) */
    posts: {
        guildId: string | null;
        channelId: string;
    }[];
    /** registrierte Server des Bereichs (für die Synchronisierung der Wochenstatistik) */
    guildIds: string[];
}
export declare const scopeOfSpace: (space: string | null) => string;
/**
 * Automatischer Wochen-Reset: jeden Montag 00:00 (Europe/Berlin, Sommer-/Winterzeit automatisch) wird die abgelaufene Woche
 * archiviert, die Rangliste in Discord veröffentlicht und erst danach der Wochenzähler auf die neue Woche gesetzt.
 * Je Bereich getrennt: `global` (Gesamtstatistik, Einstellungen unter „Alle Server“) und je Server bzw. gemeinsamer
 * Shift-Log-Gruppe (Server-Verbund mit geteilten Akten; Einstellungen im Modul `shift_logs` des Servers, eigener Kanal).
 * Gelöscht wird dabei nichts – der Zähler ist nur der Beginn der laufenden Woche; alle Schichten bleiben in `DutySession`.
 * Doppelte Resets verhindern Advisory-Lock je Bereich + eindeutiges (Bereich, Woche) + Archiv/Discord/Zähler in EINER Transaktion.
 */
export declare class WeeklyResetService {
    private readonly prisma;
    private readonly audit;
    private readonly discord;
    private readonly rt;
    private readonly servers;
    private readonly sync;
    constructor(prisma: PrismaService, audit: AuditService, discord: DiscordService, rt: RealtimeService, servers: ServersService, sync: SyncService);
    config(): Promise<WeeklyResetConfig>;
    saveConfig(actor: Actor, input: WeeklyResetConfig): Promise<{
        channelId: string | null;
        enabled: boolean;
        topN: number;
        mention: boolean;
    }>;
    /** Einstellungen im aktuellen Kontext: mit Server = Modul `shift_logs` dieses Servers (mit Version), sonst global. */
    contextConfig(actor: Actor): Promise<{
        channelId: string | null;
        enabled: boolean;
        topN: number;
        mention: boolean;
        scope: "global";
    } | {
        channelId: string | null;
        enabled: boolean;
        topN: number;
        mention: boolean;
        scope: "server";
        serverId: string;
        version: number;
    }>;
    saveContextConfig(actor: Actor, input: WeeklyResetConfig & {
        version?: number;
    }): Promise<{
        channelId: string | null;
        enabled: boolean;
        topN: number;
        mention: boolean;
        scope: "global";
    } | {
        channelId: string | null;
        enabled: boolean;
        topN: number;
        mention: boolean;
        scope: "server";
        serverId: string;
        version: number;
    }>;
    private state;
    private setState;
    /** Alle aktiven Bereiche: global (wenn an) + je aktivem Server mit Modul `shift_logs` und eingeschaltetem Wochen-Reset. */
    scopes(): Promise<Scope[]>;
    /**
     * Prüft (jede halbe Minute und beim Start), ob ein Montag 00:00 überschritten ist, und holt jeden fälligen Reset genau einmal nach.
     * Ältere verpasste Wochen werden still archiviert; nur die zuletzt abgeschlossene Woche wird in Discord veröffentlicht.
     * `archived` enthält je Woche den Schlüssel (global: „2026-10-05“, sonst „<Bereich>|2026-10-05“).
     */
    tick(now?: Date, only?: string[]): Promise<{
        archived: string[];
        posted: number;
    }>;
    private runScope;
    /** Archiv der Woche [start, end) anlegen; bei der zuletzt abgeschlossenen Woche die Rangliste in die Discord-Warteschlange stellen. */
    private archiveWeek;
    private rank;
    private message;
    /** Bereich der Anfrage: mit Server dessen Akten-Bereich (bzw. gemeinsame Gruppe), ohne Server die Gesamtstatistik. */
    private contextScope;
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
    archives(): Promise<{
        id: string;
        createdAt: Date;
        timezone: string;
        scope: string;
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
    /** Archive anderer Bereiche (Server) sind hier nicht vorhanden – auch nicht über eine geratene ID. */
    archive(id: string): Promise<{
        id: string;
        createdAt: Date;
        timezone: string;
        scope: string;
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
    /** Einstellungen: mit gewähltem Server die des Servers (Modul shift_logs, mit Version), unter „Alle Server“ die globalen. */
    config(a: Actor): Promise<{
        channelId: string | null;
        enabled: boolean;
        topN: number;
        mention: boolean;
        scope: "global";
    } | {
        channelId: string | null;
        enabled: boolean;
        topN: number;
        mention: boolean;
        scope: "server";
        serverId: string;
        version: number;
    }>;
    save(a: Actor, b: WeeklyResetConfig & {
        version?: number;
    }): Promise<{
        channelId: string | null;
        enabled: boolean;
        topN: number;
        mention: boolean;
        scope: "global";
    } | {
        channelId: string | null;
        enabled: boolean;
        topN: number;
        mention: boolean;
        scope: "server";
        serverId: string;
        version: number;
    }>;
    /** Abgeschlossene Wochen (Rangliste je Woche); nie gelöscht. */
    archives(): Promise<{
        id: string;
        createdAt: Date;
        timezone: string;
        scope: string;
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
        scope: string;
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
export {};
