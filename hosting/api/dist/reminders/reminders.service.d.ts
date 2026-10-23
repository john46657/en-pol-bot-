import { PrismaService } from '../prisma/prisma.service';
/**
 * Persönliche Erinnerungen (`/remind-me`). Gespeichert in der Datenbank → überstehen Neustarts von Bot und API.
 * `tick` legt fällige Erinnerungen genau einmal in die Bot-Warteschlange: Statuswechsel PENDING → SENT und Eintrag in die
 * Outbox passieren in einer Transaktion, nur wenn die Zeile noch unverändert ist (auch bei mehreren API-Instanzen).
 * Nach einem Ausfall werden verpasste Erinnerungen einmal (mit Hinweis „verspätet“) zugestellt, nie mehrfach.
 */
export declare class RemindersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(d: {
        discordId: string;
        guildId?: string | null;
        channelId?: string | null;
        text: string;
        dm: boolean;
        delayMs: number;
    }, now?: Date): Promise<{
        duplicate: boolean;
        id: string;
        text: string;
        dm: boolean;
        dueAt: string;
        status: string;
        fireCount: number;
        channelId: string | null;
        createdAt: string;
    }>;
    list(discordId: string): Promise<{
        id: string;
        text: string;
        dm: boolean;
        dueAt: string;
        status: string;
        fireCount: number;
        channelId: string | null;
        createdAt: string;
    }[]>;
    private own;
    cancel(id: string, discordId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * Verschieben (Buttons 10 Min/30 Min/1 Std/1 Tag) bzw. erledigt. `fire` = Auslösung, zu der der Button gehört: nur der
     * erste Klick zählt, weitere (auch auf alten Nachrichten) werden mit Hinweis abgewiesen – keine doppelten Erinnerungen.
     */
    snooze(id: string, discordId: string, fire: number, minutes: number, now?: Date): Promise<{
        id: string;
        text: string;
        dm: boolean;
        dueAt: string;
        status: string;
        fireCount: number;
        channelId: string | null;
        createdAt: string;
    }>;
    done(id: string, discordId: string, fire: number): Promise<{
        ok: boolean;
    }>;
    /** Klick ging ins Leere: mit dem aktuellen Stand erklären (z. B. zweiter, gleichzeitiger Klick). */
    private conflict;
    /** Fällige Erinnerungen genau einmal an den Bot übergeben. */
    tick(now?: Date): Promise<{
        sent: number;
    }>;
}
