import { Prisma, type ErlcServer } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PageQuery } from '../common/pagination';
import { CadNotifyService } from './cad-notify.service';
import type { ErlcSnapshot } from './erlc.service';
/**
 * Fahndungen, die für einen ER:LC-Server gelten: Akten-Bereich seines Discord-Servers und der gemeinsame Bestand
 * (z. B. unter „Alle Server“ angelegt) – sonst würde eine solche Fahndung nie abgeglichen.
 */
export declare const wantedSpaceWhere: (space: string | null) => Prisma.WantedRecordWhereInput;
/**
 * Automatischer Fahndungsabgleich ER:LC ↔ eigene Fahndungen.
 * - Die ER:LC-API kennt keine Beitritts-Ereignisse per Webhook (nur Notrufe und „;“-Nachrichten). Darum: nach jedem erfolgreichen
 *   Abruf von GET /v2/server die Spielerliste mit der vorherigen vergleichen (Sitzungen in ErlcPlayerPresence, übersteht Neustarts).
 * - Je Sitzung und Fahndung höchstens ein Treffer (Unique-Index) → keine Wiederholung bei jedem Abfragezyklus, keine doppelten Discord-Meldungen.
 * - Bestätigt nur bei exakt gleicher Roblox-ID (aus der API). Name/Alias = „Mögliche Übereinstimmung“, manuelle Prüfung nötig.
 * - Nur Information: es wird nie ein Befehl (Kick/Ban o. ä.) an den ER:LC-Server gesendet.
 * - API-Ausfall: dieser Abgleich läuft gar nicht (nur nach erfolgreichem Abruf) → keine erfundenen Treffer, Sitzungen bleiben erhalten.
 */
export declare class ErlcWantedService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    private readonly rt;
    private readonly notify;
    private readonly log;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService, rt: RealtimeService, notify: CadNotifyService);
    /** Nach einem erfolgreichen Abruf: Sitzungen fortschreiben, aktive Fahndungen abgleichen, neue Treffer melden. Fehler stören den Abruf nie. */
    check(s: Pick<ErlcServer, 'id' | 'name' | 'guildId' | 'features'>, snap: ErlcSnapshot): Promise<{
        created: number;
        skipped: "players-disabled";
        error?: undefined;
    } | {
        created: number;
        skipped?: undefined;
        error?: undefined;
    } | {
        created: number;
        error: string;
        skipped?: undefined;
    }>;
    /** Server laut API leer/offline (nicht: API nicht erreichbar) → alle Sitzungen sind beendet. */
    serverEmpty(serverId: string): Promise<void>;
    private run;
    /**
     * Im Spiel gesucht: Spieler mit ER:LC-Wanted-Sternen → ein Treffer je Aufenthalt (Roblox-ID von der API, ohne eigene Fahndung).
     * Steigen die Sterne während des Aufenthalts, wird nur der Treffer nachgezogen – keine neue Meldung.
     */
    private inGameWanted;
    /**
     * Discord (über den vorhandenen Bot, Ausgang/Outbox): Kanäle aus CAD → Einstellungen → Discord-Kanäle, Ereignis „Fahndungstreffer“
     * bzw. „Mögliche Fahndungsübereinstimmung“. Nie an verbundene Server. Nur das Nötigste: keine Beschreibung, keine Personalien.
     * Einmal je Treffer; ein Fehler beim Einreihen wird am Treffer vermerkt, der Treffer selbst bleibt.
     */
    private notifyHit;
    list(p: PageQuery, f: {
        status?: string;
        open?: boolean;
        identified?: boolean;
        wantedId?: string;
        id?: string;
    }): Promise<{
        items: {
            id: string;
            serverName: string;
            erlcServerId: string | null;
            playerName: string;
            robloxUserId: string | null;
            matchType: string;
            matchLabel: string;
            identified: boolean;
            identification: string;
            reviewStatus: string;
            reviewLabel: string;
            reviewedBy: string | null;
            reviewedAt: Date | null;
            reviewNote: string | null;
            detectedAt: Date;
            sessionStartedAt: Date;
            wantedId: string | null;
            wantedNumber: string | null;
            reason: string;
            priority: string;
            wantedStatus: string | null;
            personId: string | null;
            person: {
                id: string;
                robloxUsername: string;
                robloxUserId: string | null;
            } | null;
            notify: {
                status: string;
                attempts: number;
                error: string | null;
            };
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    private view;
    /** Verbindungs- und Abgleichsstatus je ER:LC-Server (keine Geheimnisse). */
    status(): Promise<{
        open: number;
        review: number;
        servers: {
            id: string;
            name: string;
            active: boolean;
            status: string;
            lastSyncAt: Date | null;
            lastError: string | null;
            lastErrorAt: Date | null;
            playersEnabled: boolean;
            joinLogsEnabled: boolean;
            wantedCheckAt: Date | null;
            wantedCheckError: string | null;
            online: number;
            players: {
                name: string;
                robloxUserId: string | null;
                wantedStars: number;
            }[];
            activeWanted: number;
        }[];
    }>;
    /**
     * Prüfung durch berechtigte Personen. Treffer per Roblox-ID: „zur Kenntnis genommen“. Mögliche Übereinstimmung: bestätigen oder verwerfen;
     * beim Bestätigen kann die Roblox-ID aus ER:LC in die Personenakte übernommen werden (nur, wenn die Akte noch keine hat).
     */
    review(actor: Actor, id: string, d: {
        decision: 'ACKNOWLEDGED' | 'CONFIRMED' | 'REJECTED';
        note?: string;
        linkRobloxId?: boolean;
    }): Promise<{
        id: string;
        reviewStatus: string;
        identified: boolean;
        robloxIdLinked: boolean;
    }>;
}
