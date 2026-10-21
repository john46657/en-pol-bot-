import { type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type BackupConfig, type BackupPart, type BackupRestoreResult, type DiscordBackupData } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { MonitorService } from '../integrations/monitor.service';
export type DataBackupKind = 'auto' | 'manuell' | 'vor-wiederherstellung' | 'vor-umstellung' | 'vor-mehrserver' | 'vor-zusammenfuehrung' | 'vor-migration';
export declare const setAfterRestore: (fn: (() => Promise<unknown>) | null) => void;
/**
 * Aufbewahrung der stündlichen Daten-Backups: die letzten 48 Stunden vollständig, davor das jeweils neueste Backup
 * eines Tages für `keep` Tage. `list` neueste zuerst.
 */
export declare function autoBackupsToDelete<T extends {
    createdAt: string;
}>(list: T[], keep: number, now?: Date): T[];
/**
 * Backups: Dashboard-Daten (alle Tabellen als komprimierte JSON-Datei im Speicherordner, herunterladbar und wieder einspielbar)
 * und Discord-Server (wie Xenon – der Bot liest Rollen/Kanäle/Rechte/Einstellungen und stellt sie wieder her).
 */
export declare class BackupService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly audit;
    private readonly discord;
    private readonly monitor;
    private readonly log;
    private readonly dir;
    private timer?;
    constructor(prisma: PrismaService, audit: AuditService, discord: DiscordService, monitor: MonitorService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    config(): Promise<BackupConfig>;
    saveConfig(actor: Actor, c: BackupConfig): Promise<{
        dataAuto: boolean;
        discordAuto: boolean;
        keep: number;
        verifyAuto: boolean;
    }>;
    /** Täglich: Daten-Backup und (falls an) Discord-Backup je Server; alte automatische Backups aufräumen. */
    autoTick(now?: Date): Promise<void>;
    listData(): Promise<{
        verify: {
            status: string;
            at: Date;
            error: string | null;
        } | null;
        name: string;
        kind: DataBackupKind;
        size: number;
        createdAt: string;
    }[]>;
    /** Alle Tabellen als JSON (gzip) in den Speicherordner; automatische werden auf „keep“ begrenzt. */
    createData(actor: Actor | null, kind?: DataBackupKind): Promise<{
        name: string;
        rows: number;
        size: number;
    }>;
    private writeData;
    private file;
    readData(name: string): Promise<NonSharedBuffer>;
    deleteData(actor: Actor, name: string): Promise<void>;
    /**
     * Daten einspielen (gespeichertes Backup oder hochgeladene Datei): vorher wird automatisch der aktuelle Stand gesichert,
     * dann werden alle Tabellen in einer Transaktion ersetzt. Sitzungen und das Audit-Log bleiben – angemeldete Benutzer bleiben angemeldet.
     */
    private parseBackup;
    /** Alle Tabellen in der Transaktion ersetzen (gemeinsam für Wiederherstellung und Wiederherstellungstest). Liefert die erwarteten Zeilen je Tabelle. */
    private applyBackup;
    /**
     * Daten einspielen (gespeichertes Backup oder hochgeladene Datei): vorher wird automatisch der aktuelle Stand gesichert,
     * dann werden alle Tabellen in einer Transaktion ersetzt. Sitzungen und das Audit-Log bleiben – angemeldete Benutzer bleiben angemeldet.
     */
    restoreData(actor: Actor, source: {
        name?: string;
        buffer?: Buffer;
    }): Promise<{
        rows: number;
        safety: string;
    }>;
    /**
     * Wiederherstellungstest: das Backup wird tatsächlich in die Datenbank eingespielt (gleicher Weg wie bei der Wiederherstellung), die
     * Zeilenzahl jeder Tabelle mit der Datei verglichen und danach alles zurückgerollt – am Datenbestand ändert sich nichts.
     * Nur ein bestandener Test gilt als „wiederherstellbar“. Hinweis: Während des Tests warten schreibende Zugriffe kurz.
     */
    verifyData(actor: Actor | null, name: string): Promise<{
        ok: boolean;
        name: string;
        rows: number;
        tables: number;
        mismatches: {
            table: string;
            expected: number;
            actual: number;
        }[];
        durationMs: number;
        error: string | null;
    }>;
    /** Verlauf: Erstellen, Wiederherstellungstests und Wiederherstellungen mit Zeitpunkt und Ergebnis. */
    runs(take?: number): Promise<{
        createdByName: string;
        error: string | null;
        id: string;
        status: string;
        createdById: string | null;
        startedAt: Date;
        kind: string | null;
        finishedAt: Date | null;
        details: Prisma.JsonValue | null;
        size: number | null;
        action: string;
        fileName: string | null;
        rows: number | null;
    }[]>;
    listDiscord(guildId?: string): Prisma.PrismaPromise<{
        error: string | null;
        id: string;
        status: string;
        createdById: string | null;
        createdAt: Date;
        guildId: string;
        name: string;
        guildName: string;
        auto: boolean;
        stats: Prisma.JsonValue;
        restoredAt: Date | null;
        restoreResult: Prisma.JsonValue;
    }[]>;
    getDiscord(id: string): Promise<{
        error: string | null;
        id: string;
        status: string;
        createdById: string | null;
        createdAt: Date;
        guildId: string;
        name: string;
        data: Prisma.JsonValue | null;
        guildName: string;
        auto: boolean;
        stats: Prisma.JsonValue | null;
        restoredAt: Date | null;
        restoreResult: Prisma.JsonValue | null;
    }>;
    /** Backup anlegen – der Bot liest den Server aus und schickt die Daten (Status PENDING → READY). */
    createDiscord(actor: Actor | null, guildId: string, name?: string, auto?: boolean): Promise<{
        error: string | null;
        id: string;
        status: string;
        createdById: string | null;
        createdAt: Date;
        guildId: string;
        name: string;
        data: Prisma.JsonValue | null;
        guildName: string;
        auto: boolean;
        stats: Prisma.JsonValue | null;
        restoredAt: Date | null;
        restoreResult: Prisma.JsonValue | null;
    }>;
    deleteDiscord(actor: Actor, id: string): Promise<void>;
    /** Wiederherstellen (sicher: Vorhandenes wird angepasst, Fehlendes angelegt – nichts gelöscht). Ziel kann ein anderer Server sein. */
    restoreDiscord(actor: Actor, id: string, d: {
        guildId?: string;
        parts: BackupPart[];
    }): Promise<{
        queued: boolean;
    }>;
    botSaveData(id: string, d: {
        data?: DiscordBackupData;
        error?: string;
    }): Promise<void>;
    botRestoreResult(id: string, r: BackupRestoreResult): Promise<void>;
}
