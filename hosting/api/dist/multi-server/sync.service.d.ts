import { type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { AuthorizationService } from '../authz/authorization.service';
/** Endgültig fehlgeschlagen nach so vielen Versuchen (danach manuell wiederholbar). */
export declare const MAX_ATTEMPTS = 6;
/** Exponentieller Backoff, gedeckelt: 10 s, 20 s, 40 s … höchstens 30 min. */
export declare const backoffMs: (attempt: number) => number;
/** Versionsnummer aus einem Zeitpunkt (Sekunden seit 2020 – passt in Int und steigt monoton). */
export declare const versionAt: (d: Date) => number;
export interface EmitInput {
    dataType: string;
    eventType: string;
    recordId: string;
    version: number;
    payload: Record<string, unknown>;
    sourceGuildId?: string | null;
}
/**
 * Serverübergreifende Synchronisierung (Outbox-Pattern):
 * 1. Eine autorisierte Aktion ändert einen Datensatz und ruft `emit` IN DERSELBEN Transaktion auf.
 * 2. `emit` prüft die Datenfreigaben (aktive Verbindung, Richtung) und legt je Ziel ein `SyncEvent` mit Idempotenzschlüssel an.
 * 3. Der Hintergrundprozess holt Ereignisse mit `FOR UPDATE SKIP LOCKED` (mehrere Instanzen ok), prüft die Freigabe auf der
 *    Zielseite ERNEUT und schreibt eine nur lesbare Kopie (`SyncedRecord`) – idempotent und mit Versionsprüfung.
 * Synchronisierte Kopien lösen nie neue Ereignisse aus (keine Schleifen). Fachdatensätze werden nie gelöscht.
 */
export declare class SyncService implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly prisma;
    private readonly audit;
    private readonly authz;
    private readonly log;
    private timer?;
    private running;
    constructor(prisma: PrismaService, audit: AuditService, authz: AuthorizationService);
    onApplicationBootstrap(): void;
    onModuleDestroy(): void;
    /** Ereignisse für alle aktiven Freigaben des Quellservers anlegen. Ohne registrierten Server/Freigabe: nichts. Liefert die Anzahl. */
    emit(tx: Tx | PrismaService, e: EmitInput): Promise<number>;
    /** Ein Durchlauf des Hintergrundprozesses. */
    tick(now?: Date): Promise<{
        processed: number;
    }>;
    /** Nächstes fälliges Ereignis verarbeiten (gesperrt, damit keine zweite Instanz es gleichzeitig bearbeitet). */
    private processNext;
    private markFailed;
    /** Zielseite: Freigabe erneut prüfen und die Kopie idempotent schreiben. */
    private apply;
    /** Fehlgeschlagene Ereignisse erneut einreihen. Idempotent: bereits übernommene Stände werden nicht doppelt geschrieben. */
    retryFailed(actor: Actor, connectionId: string): Promise<{
        requeued: number;
    }>;
    /** Verbindung/Freigabe abgeschaltet: offene Ereignisse werden verworfen (CANCELLED), Fachdaten bleiben unberührt. */
    cancelPending(tx: Tx, where: {
        connectionId: string;
        policyId?: string;
    }, note: string): Promise<number>;
}
