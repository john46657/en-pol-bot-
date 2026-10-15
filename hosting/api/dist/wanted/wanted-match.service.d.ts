import { type ErlcServer } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { DiscordService } from '../discord/discord.service';
import { NotifyService } from '../notifications/notify.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PageQuery } from '../common/pagination';
/** Spieler, wie ihn die ER:LC-API in GET /v2/server?Players=true liefert („Name:RobloxId“ → name/id, siehe normalizeSnapshot). */
export interface MatchPlayer {
    name: string;
    id: string | null;
}
export declare const MATCH_TYPES: readonly ["ROBLOX_ID", "NAME"];
export declare const HIT_REVIEW_STATUSES: readonly ["CONFIRMED", "PENDING", "VERIFIED", "DISMISSED"];
export type HitReviewStatus = (typeof HIT_REVIEW_STATUSES)[number];
export declare const matchSettingsSchema: z.ZodObject<{
    /** Abgleich bei jedem erfolgreichen ER:LC-Abruf */
    enabled: z.ZodDefault<z.ZodBoolean>;
    /** Bestätigte Treffer (Roblox-ID) in Discord melden */
    notifyDiscord: z.ZodDefault<z.ZodBoolean>;
    /** Auch mögliche Übereinstimmungen (nur Name) in Discord melden – standardmäßig nur im Dashboard */
    notifyPossible: z.ZodDefault<z.ZodBoolean>;
    /** Eigener interner Kanal; leer = Fahndungs-Kanal aus den Discord-Bot-Channels */
    channelId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    channelId: string | null;
    notifyDiscord: boolean;
    notifyPossible: boolean;
}, {
    enabled?: boolean | undefined;
    channelId?: string | null | undefined;
    notifyDiscord?: boolean | undefined;
    notifyPossible?: boolean | undefined;
}>;
export type MatchSettings = z.infer<typeof matchSettingsSchema>;
export interface ServerState {
    lastRunAt: string;
    lastOkAt: string | null;
    lastError: string | null;
    online: number;
    joined: number;
    hits: number;
}
/** Kurze, gut lesbare Fahndungsnummer aus der ID (Fahndungen haben keine eigene laufende Nummer). */
export declare const wantedRef: (id: string) => string;
/**
 * Automatischer Abgleich ER:LC-Spieler ↔ aktive Fahndungen (Personen).
 *
 * - Beitritte: Die ER:LC-API bietet für Beitritte keine offiziell dokumentierten Event-Webhooks; die Spielerliste aus
 *   GET /v2/server (ohnehin bei jedem Abruf geladen) wird daher mit den offenen Sitzungen verglichen. Neu in der Liste = Beitritt,
 *   nicht mehr in der Liste = verlassen. Es entstehen keine zusätzlichen API-Anfragen.
 * - Identifikation: bestätigt nur bei exakt gleicher Roblox-ID (Akte ↔ API). Name/Alias allein ergibt nur eine
 *   „mögliche Übereinstimmung“, die manuell geprüft werden muss.
 * - Je Sitzung und Fahndung höchstens ein Treffer (eindeutiger Index) → keine Wiederholungen bei jedem Abruf.
 * - Fällt die API aus, wird nichts abgeglichen und nichts geschlossen; offene Sitzungen bleiben bis zum nächsten Erfolg bestehen.
 * - Es wird nie etwas im Spiel ausgelöst (kein Kick/Bann/Befehl) – reine Information.
 */
export declare class WantedMatchService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    private readonly discord;
    private readonly notify;
    private readonly rt;
    private readonly log;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService, discord: DiscordService, notify: NotifyService, rt: RealtimeService);
    settings(guildId?: string | null): Promise<MatchSettings>;
    saveSettings(actor: Actor, patch: Partial<MatchSettings>): Promise<{
        enabled: boolean;
        channelId: string | null;
        notifyDiscord: boolean;
        notifyPossible: boolean;
    }>;
    private saveState;
    /**
     * Nach jedem ERFOLGREICHEN Abruf (ErlcService.poll). `players` = undefined → Spielerliste nicht freigegeben/geliefert: nichts tun.
     * Läuft ohne Server-Kontext; der Akten-Bereich ergibt sich aus dem Discord-Server des ER:LC-Servers.
     */
    onPlayers(s: Pick<ErlcServer, 'id' | 'name' | 'guildId'>, players: MatchPlayer[] | undefined, now?: Date): Promise<{
        joined: number;
        left: number;
        hits: number;
    }>;
    /** Spielerliste ↔ offene Sitzungen: neue Sitzungen anlegen, verschwundene schließen, gebliebene „zuletzt gesehen“ setzen. */
    private diffSessions;
    private match;
    /** Dashboard-Benachrichtigung (wanted.view) + optional Discord. Fehler dürfen den Abgleich nie stören. */
    private announce;
    list(p: PageQuery, f: {
        status?: HitReviewStatus;
        wantedId?: string;
        matchType?: (typeof MATCH_TYPES)[number];
    }): Promise<{
        items: {
            reference: string;
            wanted: {
                id: string;
                status: string;
                reason: string;
                priority: string;
            } | null;
            person: {
                id: string;
                robloxUserId: string | null;
                robloxUsername: string;
            } | null;
            session: {
                id: string;
                joinedAt: Date;
                lastSeenAt: Date;
                leftAt: Date | null;
            } | null;
            reviewedByName: string | null;
            delivery: string;
            deliveryError: string | null;
            serverId: string | null;
            id: string;
            robloxUserId: string | null;
            personId: string | null;
            wantedId: string;
            erlcServerId: string | null;
            erlcServerName: string | null;
            sessionId: string | null;
            playerName: string;
            matchType: string;
            reviewStatus: string;
            matchNote: string | null;
            wantedReason: string;
            wantedPriority: string;
            detectedAt: Date;
            reviewedById: string | null;
            reviewedAt: Date | null;
            reviewNote: string | null;
            notifyStatus: string;
            notifyOutboxId: string | null;
            notifyError: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        reference: string;
        wanted: {
            id: string;
            status: string;
            reason: string;
            priority: string;
        } | null;
        person: {
            id: string;
            robloxUserId: string | null;
            robloxUsername: string;
        } | null;
        session: {
            id: string;
            joinedAt: Date;
            lastSeenAt: Date;
            leftAt: Date | null;
        } | null;
        reviewedByName: string | null;
        delivery: string;
        deliveryError: string | null;
        serverId: string | null;
        id: string;
        robloxUserId: string | null;
        personId: string | null;
        wantedId: string;
        erlcServerId: string | null;
        erlcServerName: string | null;
        sessionId: string | null;
        playerName: string;
        matchType: string;
        reviewStatus: string;
        matchNote: string | null;
        wantedReason: string;
        wantedPriority: string;
        detectedAt: Date;
        reviewedById: string | null;
        reviewedAt: Date | null;
        reviewNote: string | null;
        notifyStatus: string;
        notifyOutboxId: string | null;
        notifyError: string | null;
    }>;
    /** Aktueller Fahndungsstatus, Person, Sitzung (online?), Prüfer und Zustellung nach Discord ergänzen. */
    private decorate;
    /** Übersicht: offene Prüfungen, Treffer der letzten 24 h, Abgleich-/Verbindungsstatus je ER:LC-Server. */
    summary(guildId?: string | null): Promise<{
        pending: number;
        confirmed24h: number;
        total: number;
        settings: {
            enabled: boolean;
            channelId: string | null;
            notifyDiscord: boolean;
            notifyPossible: boolean;
        };
        servers: {
            id: string;
            name: string;
            active: boolean;
            status: string;
            lastSyncAt: Date | null;
            lastError: string | null;
            lastErrorAt: Date | null;
            playersEnabled: boolean;
            match: ServerState | null;
        }[];
    }>;
    /**
     * Manuelle Prüfung. PENDING → VERIFIED/DISMISSED; ein ID-Treffer (CONFIRMED) kann verworfen werden (z. B. falsche ID in der Akte).
     * `storeRobloxId`: bei Bestätigung die Roblox-ID aus ER:LC in die Akte übernehmen (nur wenn dort noch keine steht) –
     * künftige Beitritte werden dann eindeutig erkannt.
     */
    review(actor: Actor, id: string, d: {
        decision: 'VERIFIED' | 'DISMISSED';
        note: string;
        storeRobloxId?: boolean;
    }): Promise<{
        id: string;
        reviewStatus: "VERIFIED" | "DISMISSED";
        robloxIdStored: boolean;
    }>;
}
