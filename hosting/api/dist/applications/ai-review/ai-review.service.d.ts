import { type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type AiReviewSettings, type AiReviewState, type AiReviewVia } from '@enrp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, type Actor } from '../../audit/audit.service';
import { ApplicationsService } from '../applications.service';
import { NotifyService } from '../../notifications/notify.service';
import { DiscordService } from '../../discord/discord.service';
import { type SubmittedApplication } from '../../common/application-events';
export type AiReviewKind = 'POLICE' | 'QUALIFICATION';
/** Ziel der Discord-Meldung einer automatischen Analyse (Kanal der Bewerbung) */
interface AutoTarget {
    channelKey: 'applications' | 'qualifications';
    channelId: string | null;
}
/**
 * KI-Bewerbungsprüfung: startet eine Analyse automatisch bei neuer Bewerbung (abschaltbar je Server) oder auf ausdrückliche
 * Aktion (Dashboard-Button oder Discord-Button, auch erneut), speichert
 * das geprüfte Ergebnis dauerhaft je Bewerbung und liefert Dashboard und Discord denselben Stand. Ändert nie den Status der
 * Bewerbung, vergibt keine Rollen und sendet nichts an Bewerber.
 *
 * Schutz vor unnötigen Aufrufen: vorhandenes Ergebnis wird wiederverwendet (gleicher Fingerabdruck), eine laufende Analyse
 * wird nicht doppelt gestartet, höchstens `maxConcurrent` gleichzeitig, Tageslimit, begrenzte Eingabe, Zeitlimit,
 * begrenzte Wiederholungen nur bei vorübergehenden Fehlern.
 */
export declare class AiReviewService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly audit;
    private readonly apps;
    private readonly notify;
    private readonly discord;
    private readonly log;
    /** Bewerbungen, für die dieser Prozess gerade eine Analyse prüft oder ausführt (`KIND:id`) */
    private readonly busy;
    /** gleichzeitig laufende KI-Anfragen dieses Prozesses */
    private active;
    /** wartende automatische Analysen (neue Bewerbungen), werden nacheinander gestartet, sobald ein Platz frei ist */
    private readonly queue;
    private pumping;
    private retryTimer;
    private offEvents;
    constructor(prisma: PrismaService, audit: AuditService, apps: ApplicationsService, notify: NotifyService, discord: DiscordService);
    onModuleDestroy(): void;
    /** Nach einem Neustart: abgebrochene Analysen als fehlgeschlagen markieren – nie automatisch erneut an die KI senden. */
    onModuleInit(): Promise<void>;
    /** Nimmt eine neue Bewerbung in die Warteschlange. Läuft vollständig im Hintergrund und wirft nie. */
    enqueueAuto(a: SubmittedApplication): void;
    /** Startet wartende Analysen nacheinander, solange Plätze frei sind; sonst später erneut versuchen. */
    private pump;
    private later;
    private autoStart;
    private cfg;
    settings(guildId: string | null): Promise<AiReviewSettings & {
        own: boolean;
    }>;
    saveSettings(actor: Actor, guildId: string | null, value: AiReviewSettings): Promise<{
        enabled: boolean;
        auto: boolean;
        rules: string;
        criteria: string;
    } & {
        own: boolean;
    }>;
    /** Status für das Dashboard (ohne Schlüssel – nur ob einer hinterlegt ist). */
    status(guildId: string | null): Promise<{
        configured: boolean;
        enabled: boolean;
        auto: boolean;
        provider: "gemini" | "groq" | "openrouter" | "mistral" | "ollama";
        providerLabel: string;
        keyEnv: string;
        model: string;
        dailyLimit: number;
        usedToday: number;
        maxConcurrent: number;
        maxInputChars: number;
        timeoutMs: number;
        running: number;
        queued: number;
        last: {
            ok: boolean;
            error: string | null;
            at: string | null;
        } | null;
    }>;
    private load;
    private hash;
    private view;
    /** Eine Analyse gilt als „hängend“, wenn sie länger läuft, als Zeitlimit × Versuche erlauben (z. B. anderer Prozess abgestürzt). */
    private hung;
    private unavailable;
    /** Gespeicherter Stand – löst nie eine Analyse aus. */
    state(kind: AiReviewKind, id: string): Promise<AiReviewState & {
        number: string;
        dashboardUrl: string;
    }>;
    /**
     * Analyse starten (nur auf ausdrückliche Aktion). Ohne `force` wird ein vorhandenes, aktuelles Ergebnis wiederverwendet;
     * eine bereits laufende Analyse wird nie doppelt gestartet. Läuft im Hintergrund – Ergebnis über `state`.
     */
    start(actor: Actor & {
        name?: string | null;
    }, kind: AiReviewKind, id: string, opts: {
        force?: boolean;
        via: AiReviewVia;
        target?: AutoTarget;
    }): Promise<AiReviewState & {
        number: string;
        dashboardUrl: string;
        started: boolean;
    }>;
    /** Eigentlicher Aufruf (Hintergrund). Fehler beschädigen die Bewerbung nie – nur die Zeile der Analyse wird als FAILED markiert. */
    private run;
    /**
     * Ergebnis melden: Benachrichtigung im Dashboard an alle Prüfer dieses Servers (außer wer die Analyse selbst gestartet hat)
     * und – nur bei automatischen Analysen – eine kurze Meldung im Discord-Kanal der Bewerbung. Ohne Bewerbungstext, ohne Begründungen.
     */
    private announce;
}
export {};
