import { type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type BackupConfig, type BackupPart, type BackupRestoreResult, type BackupScope, type DiscordBackupData } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { DiscordService } from '../discord/discord.service';
import { NotifyService } from '../notifications/notify.service';
export type DataBackupKind = 'auto' | 'manuell' | 'vor-wiederherstellung' | 'vor-umstellung' | 'vor-mehrserver' | 'vor-zusammenfuehrung' | 'vor-update';
export declare const setAfterRestore: (fn: (() => Promise<unknown>) | null) => void;
interface BackupBody {
    app?: string;
    version?: number;
    createdAt?: string;
    migration?: string | null;
    scope?: BackupScope;
    modules?: string[];
    tables?: Record<string, Record<string, unknown>[]>;
    files?: {
        path: string;
        data: string;
    }[];
}
/**
 * Aufbewahrung der stündlichen Daten-Backups: die letzten 48 Stunden vollständig, davor das jeweils neueste Backup
 * eines Tages für `keep` Tage. `list` neueste zuerst.
 */
export declare function autoBackupsToDelete<T extends {
    createdAt: string;
}>(list: T[], keep: number, now?: Date): T[];
/** Tabellen, die außerhalb der Auswahl auf eine ausgewählte Tabelle verweisen (Löschen würde dort Daten mitreißen). */
export declare function externalDependents(selected: ReadonlySet<string>): string[];
/**
 * Backup-Center 2.0: Dashboard-Daten (alle Tabellen bzw. Konfiguration/Module, optional mit Dateien) als komprimierte,
 * auf Wunsch verschlüsselte Datei im Speicherordner, mit Manifest (Prüfsumme, Prüfergebnis, Ersteller, Archiv); Discord-Server
 * (wie Xenon – der Bot liest Rollen/Kanäle/Rechte/Einstellungen und stellt sie wieder her).
 */
export declare class BackupService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly audit;
    private readonly discord;
    private readonly perms;
    private readonly notify;
    private readonly log;
    private readonly dir;
    private readonly storage;
    private readonly key;
    private timer?;
    constructor(prisma: PrismaService, audit: AuditService, discord: DiscordService, perms: PermissionService, notify: NotifyService);
    /**
     * Daten-Backups enthalten ALLE Server samt Konten – nur für globale Systemadministratoren. Ein Server-Administrator
     * (settings.manage nur auf seinem Server) darf sie weder sehen noch einspielen.
     */
    requireGlobal(actor: Actor): Promise<void>;
    onModuleInit(): void;
    onModuleDestroy(): void;
    config(): Promise<BackupConfig>;
    saveConfig(actor: Actor, c: BackupConfig): Promise<{
        dataAuto: boolean;
        discordAuto: boolean;
        keep: number;
        schedule: {
            weekday: number;
            hour: number;
            frequency: "off" | "hourly" | "daily" | "weekly" | "monthly";
            monthDay: number;
        };
        autoScope: "FULL" | "DATABASE";
        encrypt: boolean;
        statusChannelId: string | null;
    }>;
    /** Status für das Backup-Center (ohne Geheimnisse). */
    status(): Promise<{
        encryptionAvailable: boolean;
        encryptionActive: boolean;
        schedule: {
            weekday: number;
            hour: number;
            frequency: "off" | "hourly" | "daily" | "weekly" | "monthly";
            monthDay: number;
        };
        dataAuto: boolean;
        lastBackupAt: Date | null;
        lastOkAt: Date | null;
        failed: number;
        location: string;
    }>;
    /** Stündlicher Lauf: Daten-Backup nach Zeitplan und (falls an) Discord-Backup je Server; alte automatische Backups aufräumen. */
    autoTick(now?: Date): Promise<void>;
    /** Statusmeldung an globale Administratoren (Dashboard) und optional an einen privaten Discord-Kanal – nie Inhalte. */
    private statusMessage;
    /** Dateien im Speicherordner mit Manifest-Angaben (Dateien ohne Manifest = ältere Backups, „ungeprüft“). */
    listData(opts?: {
        archived?: boolean;
    }): Promise<{
        name: string;
        kind: DataBackupKind;
        size: number;
        encrypted: boolean;
        createdAt: string;
        scope: BackupScope;
        modules: string[];
        status: string;
        sha256: string | null;
        verifiedAt: Date | null;
        verifyMessage: string | null;
        archivedAt: Date | null;
        createdBy: string | null;
        rows: number | null;
        migration: string | null;
        note: string | null;
        location: string;
    }[]>;
    private tablesFor;
    /** Uploads (ohne den Backup-Ordner) für Datei-Backups; Pfade relativ zum Speicherordner. */
    private collectFiles;
    private encrypt;
    /** Datei → JSON (entschlüsseln, entpacken, prüfen). Wirft bei beschädigten/fremden Dateien. */
    decode(raw: Buffer): BackupBody;
    /** Backup erstellen (Standard: alle Tabellen). Automatische werden nach Aufbewahrung aufgeräumt (archivierte nie). */
    createData(actor: Actor | null, kind?: DataBackupKind, opts?: {
        scope?: BackupScope;
        modules?: string[];
        note?: string;
    }): Promise<{
        name: string;
        rows: number;
        size: number;
        scope: "FULL" | "DATABASE" | "CONFIG" | "FILES" | "MODULE";
        encrypted: boolean;
        sha256: string;
    }>;
    private currentMigration;
    private appliedMigrations;
    private file;
    readData(name: string): Promise<NonSharedBuffer>;
    downloadData(actor: Actor, name: string): Promise<NonSharedBuffer>;
    deleteData(actor: Actor, name: string): Promise<void>;
    /** Integrität prüfen: Prüfsumme (falls bekannt), Entschlüsselung, Entpacken, Aufbau. Ergebnis wird im Manifest gespeichert. */
    verify(actor: Actor | null, name: string): Promise<{
        name: string;
        status: string;
        message: string;
        sha256: string;
    }>;
    setArchived(actor: Actor, name: string, archived: boolean): Promise<{
        name: string;
        archived: boolean;
    }>;
    private restoreTables;
    /**
     * Wiederherstellungsplan (Schritte 2, 3 und 5): Integrität, Version/Kompatibilität, Umfang je Tabelle und ob neuere Daten
     * überschrieben würden. Ändert nichts.
     */
    plan(source: {
        name?: string;
        buffer?: Buffer;
    }, groups?: string[]): Promise<{
        createdAt: string | null;
        version: number | undefined;
        migration: string | null;
        scope: "FULL" | "DATABASE" | "CONFIG" | "FILES" | "MODULE";
        modules: string[];
        files: number;
        tables: {
            table: string;
            inBackup: number;
            current: number;
            newer: number;
        }[];
        newerRows: number;
        warnings: string[];
        blockers: string[];
        restorable: boolean;
    }>;
    /**
     * Wiederherstellen (Backup-Center): 1. Recht (Controller) 2. Integrität 3. Version 4. Sicherung des aktuellen Stands
     * 5. Umfang (plan) 6. ausdrückliche Bestätigung (Controller; neuere Daten zusätzlich `acknowledgeNewer`) 7. Einspielen in einer
     * Transaktion 8. Protokoll 9. Prüfung des Ergebnisses (Zeilen je Tabelle). Sitzungen und das Audit-Log bleiben.
     */
    restoreData(actor: Actor, source: {
        name?: string;
        buffer?: Buffer;
    }, opts?: {
        groups?: string[];
        acknowledgeNewer?: boolean;
    }): Promise<{
        rows: number;
        files: number;
        safety: string;
        check: {
            ok: boolean;
            mismatches: string[];
        };
    }>;
    listDiscord(guildId?: string): Prisma.PrismaPromise<{
        error: string | null;
        guildId: string;
        id: string;
        status: string;
        createdById: string | null;
        createdAt: Date;
        name: string;
        guildName: string;
        auto: boolean;
        stats: Prisma.JsonValue;
        restoredAt: Date | null;
        restoreResult: Prisma.JsonValue;
    }[]>;
    getDiscord(id: string): Promise<{
        error: string | null;
        guildId: string;
        id: string;
        status: string;
        createdById: string | null;
        createdAt: Date;
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
        guildId: string;
        id: string;
        status: string;
        createdById: string | null;
        createdAt: Date;
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
export {};
