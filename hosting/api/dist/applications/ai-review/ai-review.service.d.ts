import { type OnModuleInit } from '@nestjs/common';
import { type AiReviewSettings, type AiReviewState } from '@enrp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, type Actor } from '../../audit/audit.service';
import { ApplicationsService } from '../applications.service';
export type AiReviewKind = 'POLICE' | 'QUALIFICATION';
/**
 * KI-Bewerbungsprüfung: startet eine Analyse nur auf ausdrückliche Aktion (Dashboard-Button oder Discord-Button), speichert
 * das geprüfte Ergebnis dauerhaft je Bewerbung und liefert Dashboard und Discord denselben Stand. Ändert nie den Status der
 * Bewerbung, vergibt keine Rollen und sendet nichts an Bewerber.
 *
 * Schutz vor unnötigen Aufrufen: vorhandenes Ergebnis wird wiederverwendet (gleicher Fingerabdruck), eine laufende Analyse
 * wird nicht doppelt gestartet, höchstens `maxConcurrent` gleichzeitig, Tageslimit, begrenzte Eingabe, Zeitlimit,
 * begrenzte Wiederholungen nur bei vorübergehenden Fehlern.
 */
export declare class AiReviewService implements OnModuleInit {
    private readonly prisma;
    private readonly audit;
    private readonly apps;
    private readonly log;
    /** Bewerbungen, für die dieser Prozess gerade eine Analyse prüft oder ausführt (`KIND:id`) */
    private readonly busy;
    /** gleichzeitig laufende KI-Anfragen dieses Prozesses */
    private active;
    constructor(prisma: PrismaService, audit: AuditService, apps: ApplicationsService);
    /** Nach einem Neustart: abgebrochene Analysen als fehlgeschlagen markieren – nie automatisch erneut an die KI senden. */
    onModuleInit(): Promise<void>;
    private cfg;
    settings(guildId: string | null): Promise<AiReviewSettings & {
        own: boolean;
    }>;
    saveSettings(actor: Actor, guildId: string | null, value: AiReviewSettings): Promise<{
        enabled: boolean;
        rules: string;
        criteria: string;
    } & {
        own: boolean;
    }>;
    /** Status für das Dashboard (ohne Schlüssel – nur ob einer hinterlegt ist). */
    status(guildId: string | null): Promise<{
        configured: boolean;
        enabled: boolean;
        provider: "gemini";
        model: string;
        dailyLimit: number;
        usedToday: number;
        maxConcurrent: number;
        maxInputChars: number;
        timeoutMs: number;
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
        via: 'WEB' | 'DISCORD';
    }): Promise<AiReviewState & {
        number: string;
        dashboardUrl: string;
        started: boolean;
    }>;
    /** Eigentlicher Aufruf (Hintergrund). Fehler beschädigen die Bewerbung nie – nur die Zeile der Analyse wird als FAILED markiert. */
    private run;
}
