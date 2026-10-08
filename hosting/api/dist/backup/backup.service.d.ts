import { type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type BackupConfig, type BackupPart, type BackupRestoreResult, type DiscordBackupData } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
/**
 * Backups: Dashboard-Daten (alle Tabellen als komprimierte JSON-Datei im Speicherordner, herunterladbar und wieder einspielbar)
 * und Discord-Server (wie Xenon – der Bot liest Rollen/Kanäle/Rechte/Einstellungen und stellt sie wieder her).
 */
export declare class BackupService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly audit;
    private readonly discord;
    private readonly log;
    private readonly dir;
    private timer?;
    constructor(prisma: PrismaService, audit: AuditService, discord: DiscordService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    config(): Promise<BackupConfig>;
    saveConfig(actor: Actor, c: BackupConfig): Promise<{
        dataAuto: boolean;
        discordAuto: boolean;
        keep: number;
    }>;
    /** Täglich: Daten-Backup und (falls an) Discord-Backup je Server; alte automatische Backups aufräumen. */
    autoTick(now?: Date): Promise<void>;
    listData(): Promise<{
        name: string;
        kind: "auto" | "manuell" | "vor-wiederherstellung";
        size: number;
        createdAt: string;
    }[]>;
    /** Alle Tabellen als JSON (gzip) in den Speicherordner; automatische werden auf „keep“ begrenzt. */
    createData(actor: Actor | null, kind?: 'auto' | 'manuell' | 'vor-wiederherstellung'): Promise<{
        name: string;
        rows: number;
        size: number;
    }>;
    private file;
    readData(name: string): Promise<NonSharedBuffer>;
    deleteData(actor: Actor, name: string): Promise<void>;
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
    listDiscord(guildId?: string): Prisma.PrismaPromise<{
        error: string | null;
        id: string;
        createdAt: Date;
        name: string;
        guildId: string;
        createdById: string | null;
        status: string;
        guildName: string;
        stats: Prisma.JsonValue;
        auto: boolean;
        restoredAt: Date | null;
        restoreResult: Prisma.JsonValue;
    }[]>;
    getDiscord(id: string): Promise<{
        error: string | null;
        data: Prisma.JsonValue | null;
        id: string;
        createdAt: Date;
        name: string;
        guildId: string;
        createdById: string | null;
        status: string;
        guildName: string;
        stats: Prisma.JsonValue | null;
        auto: boolean;
        restoredAt: Date | null;
        restoreResult: Prisma.JsonValue | null;
    }>;
    /** Backup anlegen – der Bot liest den Server aus und schickt die Daten (Status PENDING → READY). */
    createDiscord(actor: Actor | null, guildId: string, name?: string, auto?: boolean): Promise<{
        error: string | null;
        data: Prisma.JsonValue | null;
        id: string;
        createdAt: Date;
        name: string;
        guildId: string;
        createdById: string | null;
        status: string;
        guildName: string;
        stats: Prisma.JsonValue | null;
        auto: boolean;
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
