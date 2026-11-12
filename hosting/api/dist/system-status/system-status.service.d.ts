import { PrismaService } from '../prisma/prisma.service';
import { DiscordService } from '../discord/discord.service';
import { BackupService } from '../backup/backup.service';
import { AiReviewService } from '../applications/ai-review/ai-review.service';
import { RealtimeService } from '../realtime/realtime.service';
/** ok = funktioniert · warn = eingeschränkt/Aufmerksamkeit · error = gestört · off = nicht eingerichtet/abgeschaltet (kein Fehler) */
export type CheckState = 'ok' | 'warn' | 'error' | 'off';
export interface StatusCheck {
    key: string;
    group: 'Anwendungen' | 'Infrastruktur' | 'Integrationen' | 'Betrieb' | 'Konfiguration';
    label: string;
    state: CheckState;
    detail: string;
    hint?: string;
    at?: string | null;
}
/**
 * Zentrale Systemstatus-Übersicht für MDT, Leitstelle und Dashboard. Jede Zeile beruht auf einer echten Prüfung oder einem
 * gespeicherten Messwert – ein nicht verbundener oder nicht eingerichteter Dienst wird nie als funktionierend angezeigt.
 * Liefert nur Zustände und Zähler, keine Inhalte und keine Geheimnisse.
 */
export declare class SystemStatusService {
    private readonly prisma;
    private readonly discord;
    private readonly backups;
    private readonly ai;
    private readonly rt;
    constructor(prisma: PrismaService, discord: DiscordService, backups: BackupService, ai: AiReviewService, rt: RealtimeService);
    status(opts: {
        guildId: string | null;
        deep: boolean;
    }): Promise<{
        overall: "warn" | "error" | "ok";
        checkedAt: string;
        deep: boolean;
        checks: StatusCheck[];
    }>;
    private database;
    /** MDT, Leitstelle und Dashboard sind Oberflächen derselben API mit gemeinsamer Anmeldung; Live-Daten über WebSocket. */
    private apps;
    private bot;
    /** Zustellung an Discord (Outbox): wartende und endgültig fehlgeschlagene Nachrichten. */
    private outbox;
    private erlc;
    private aiCheck;
    private tickets;
    private backup;
    private radio;
    private config;
    private storage;
    /** Rechte-Sanity: Gibt es einen aktiven Administrator? Konten ohne Rolle? Rollen ohne Rechte? (nur Zähler) */
    private accounts;
}
