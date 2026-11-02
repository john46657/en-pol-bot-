import type { Response } from 'express';
import { z } from 'zod';
import { BACKUP_PARTS, type BackupConfig, type BackupRestoreResult, type DiscordBackupData } from '@enrp/shared';
import { BackupService } from './backup.service';
import type { Actor } from '../audit/audit.service';
declare const createBody: z.ZodDefault<z.ZodObject<{
    scope: z.ZodOptional<z.ZodDefault<z.ZodEnum<["FULL", "DATABASE", "CONFIG", "FILES", "MODULE"]>>>;
    modules: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodEnum<["personnel" | "settings" | "permissions" | "org" | "help" | "support" | "learning" | "practical", ...("personnel" | "settings" | "permissions" | "org" | "help" | "support" | "learning" | "practical")[]]>, "many">>>;
    note: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    kind: z.ZodOptional<z.ZodDefault<z.ZodEnum<["manuell", "vor-update"]>>>;
}, "strip", z.ZodTypeAny, {
    kind?: "manuell" | "vor-update" | undefined;
    modules?: ("personnel" | "settings" | "permissions" | "org" | "help" | "support" | "learning" | "practical")[] | undefined;
    note?: string | undefined;
    scope?: "FULL" | "DATABASE" | "CONFIG" | "FILES" | "MODULE" | undefined;
}, {
    kind?: "manuell" | "vor-update" | undefined;
    modules?: ("personnel" | "settings" | "permissions" | "org" | "help" | "support" | "learning" | "practical")[] | undefined;
    note?: string | undefined;
    scope?: "FULL" | "DATABASE" | "CONFIG" | "FILES" | "MODULE" | undefined;
}>>;
declare const restoreBody: z.ZodObject<{
    confirm: z.ZodLiteral<"WIEDERHERSTELLEN">;
    groups: z.ZodOptional<z.ZodArray<z.ZodEnum<["personnel" | "settings" | "permissions" | "org" | "help" | "support" | "learning" | "practical", ...("personnel" | "settings" | "permissions" | "org" | "help" | "support" | "learning" | "practical")[]]>, "many">>;
    acknowledgeNewer: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    confirm: "WIEDERHERSTELLEN";
    groups?: ("personnel" | "settings" | "permissions" | "org" | "help" | "support" | "learning" | "practical")[] | undefined;
    acknowledgeNewer?: boolean | undefined;
}, {
    confirm: "WIEDERHERSTELLEN";
    groups?: ("personnel" | "settings" | "permissions" | "org" | "help" | "support" | "learning" | "practical")[] | undefined;
    acknowledgeNewer?: boolean | undefined;
}>;
/**
 * Administration → Backup-Center. Daten-Backups enthalten alles (auch Konten): Recht `backup.*` UND globaler Systemadministrator.
 * Wiederherstellen: Integrität → Version → Sicherung des aktuellen Stands → Umfang/Plan → Bestätigung „WIEDERHERSTELLEN“
 * (neuere Daten zusätzlich `acknowledgeNewer`) → Einspielen → Protokoll → Prüfung.
 */
export declare class BackupController {
    private readonly s;
    constructor(s: BackupService);
    config(a: Actor): Promise<{
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
    saveConfig(a: Actor, b: BackupConfig): Promise<{
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
    /** Systemstatus (für MDT/Leitstelle/Bot nur über berechtigte Administratoren) */
    status(a: Actor): Promise<{
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
    listData(a: Actor, q: {
        archived?: string;
    }): Promise<{
        name: string;
        kind: import("./backup.service").DataBackupKind;
        size: number;
        encrypted: boolean;
        createdAt: string;
        scope: import("@enrp/shared").BackupScope;
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
    createData(a: Actor, b: z.infer<typeof createBody>): Promise<{
        name: string;
        rows: number;
        size: number;
        scope: "FULL" | "DATABASE" | "CONFIG" | "FILES" | "MODULE";
        encrypted: boolean;
        sha256: string;
    }>;
    download(a: Actor, name: string, res: Response): Promise<void>;
    deleteData(a: Actor, name: string): Promise<void>;
    verify(a: Actor, name: string): Promise<{
        name: string;
        status: string;
        message: string;
        sha256: string;
    }>;
    archive(a: Actor, name: string, b: {
        archived: boolean;
    }): Promise<{
        name: string;
        archived: boolean;
    }>;
    /** Wiederherstellungsplan (ändert nichts) */
    plan(a: Actor, name: string, b: {
        groups?: string[];
    }): Promise<{
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
    restore(a: Actor, name: string, b: z.infer<typeof restoreBody>): Promise<{
        rows: number;
        files: number;
        safety: string;
        check: {
            ok: boolean;
            mismatches: string[];
        };
    }>;
    restoreUpload(a: Actor, file: Express.Multer.File | undefined, confirm: string, ack: string | undefined): Promise<{
        rows: number;
        files: number;
        safety: string;
        check: {
            ok: boolean;
            mismatches: string[];
        };
    }>;
    listDiscord(q: {
        guildId?: string;
    }): import("@prisma/client").Prisma.PrismaPromise<{
        error: string | null;
        guildId: string;
        id: string;
        status: string;
        createdById: string | null;
        createdAt: Date;
        name: string;
        guildName: string;
        auto: boolean;
        stats: import("@prisma/client/runtime/library").JsonValue;
        restoredAt: Date | null;
        restoreResult: import("@prisma/client/runtime/library").JsonValue;
    }[]>;
    getDiscord(id: string): Promise<{
        error: string | null;
        guildId: string;
        id: string;
        status: string;
        createdById: string | null;
        createdAt: Date;
        name: string;
        data: import("@prisma/client/runtime/library").JsonValue | null;
        guildName: string;
        auto: boolean;
        stats: import("@prisma/client/runtime/library").JsonValue | null;
        restoredAt: Date | null;
        restoreResult: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    createDiscord(a: Actor, b: {
        guildId: string;
        name?: string;
    }): Promise<{
        error: string | null;
        guildId: string;
        id: string;
        status: string;
        createdById: string | null;
        createdAt: Date;
        name: string;
        data: import("@prisma/client/runtime/library").JsonValue | null;
        guildName: string;
        auto: boolean;
        stats: import("@prisma/client/runtime/library").JsonValue | null;
        restoredAt: Date | null;
        restoreResult: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    deleteDiscord(a: Actor, id: string): Promise<void>;
    restoreDiscord(a: Actor, id: string, b: {
        guildId?: string;
        parts: (typeof BACKUP_PARTS)[number][];
    }): Promise<{
        queued: boolean;
    }>;
}
/** Dienstweg des Bots: gelesene Serverdaten abliefern, Backup zum Wiederherstellen holen, Ergebnis melden. */
export declare class BotBackupController {
    private readonly s;
    constructor(s: BackupService);
    get(id: string): Promise<{
        id: string;
        guildId: string;
        data: import("@prisma/client/runtime/library").JsonValue;
    }>;
    save(id: string, b: {
        data?: DiscordBackupData;
        error?: string;
    }): Promise<void>;
    result(id: string, b: BackupRestoreResult): Promise<void>;
}
export {};
