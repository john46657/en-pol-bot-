import type { Response } from 'express';
import { BACKUP_PARTS, type BackupConfig, type BackupRestoreResult, type DiscordBackupData } from '@enrp/shared';
import { BackupService } from './backup.service';
import type { Actor } from '../audit/audit.service';
/** Administration → Backups. Daten-Backups enthalten alles (auch Konten) – nur mit settings.manage. */
export declare class BackupController {
    private readonly s;
    constructor(s: BackupService);
    config(): Promise<{
        dataAuto: boolean;
        discordAuto: boolean;
        keep: number;
    }>;
    saveConfig(a: Actor, b: BackupConfig): Promise<{
        dataAuto: boolean;
        discordAuto: boolean;
        keep: number;
    }>;
    listData(): Promise<{
        name: string;
        kind: "auto" | "manuell" | "vor-wiederherstellung";
        size: number;
        createdAt: string;
    }[]>;
    createData(a: Actor): Promise<{
        name: string;
        rows: number;
        size: number;
    }>;
    download(name: string, res: Response): Promise<void>;
    deleteData(a: Actor, name: string): Promise<void>;
    restore(a: Actor, name: string, _b: unknown): Promise<{
        rows: number;
        safety: string;
    }>;
    restoreUpload(a: Actor, file: Express.Multer.File | undefined, confirm: string): Promise<{
        rows: number;
        safety: string;
    }>;
    listDiscord(q: {
        guildId?: string;
    }): import("@prisma/client").Prisma.PrismaPromise<{
        error: string | null;
        id: string;
        status: string;
        createdAt: Date;
        createdById: string | null;
        name: string;
        guildId: string;
        guildName: string;
        auto: boolean;
        stats: import("@prisma/client/runtime/library").JsonValue;
        restoredAt: Date | null;
        restoreResult: import("@prisma/client/runtime/library").JsonValue;
    }[]>;
    getDiscord(id: string): Promise<{
        error: string | null;
        id: string;
        status: string;
        createdAt: Date;
        createdById: string | null;
        name: string;
        guildId: string;
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
        id: string;
        status: string;
        createdAt: Date;
        createdById: string | null;
        name: string;
        guildId: string;
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
