import { z } from 'zod';

/** Rechte-Überschreibung eines Kanals: `id` = Rolle (im Backup) oder Mitglied. */
export interface BackupOverwrite { id: string; type: 'role' | 'member'; allow: string; deny: string }
export interface BackupRole { id: string; name: string; color: number; hoist: boolean; mentionable: boolean; permissions: string; position: number }
/** `type`: text | voice | category | announcement | stage | forum */
export interface BackupChannel {
  id: string; name: string; type: 'text' | 'voice' | 'category' | 'announcement' | 'stage' | 'forum'; parentId: string | null; position: number;
  topic?: string | null; nsfw?: boolean; rateLimitPerUser?: number; bitrate?: number; userLimit?: number; overwrites: BackupOverwrite[];
}
export interface BackupSettings { name: string; verificationLevel: number; defaultMessageNotifications: number; explicitContentFilter: number; afkChannelId: string | null; afkTimeout: number; systemChannelId: string | null }
/** Inhalt eines Discord-Server-Backups. */
export interface DiscordBackupData { version: 1; guildId: string; everyonePermissions: string; roles: BackupRole[]; channels: BackupChannel[]; settings: BackupSettings }
export const BACKUP_PARTS = ['roles', 'channels', 'settings'] as const;
export type BackupPart = (typeof BACKUP_PARTS)[number];
export const BACKUP_PART_LABEL: Record<BackupPart, string> = { roles: 'Rollen', channels: 'Kategorien & Kanäle (mit Rechten)', settings: 'Servereinstellungen (Name, Verifizierung, AFK …)' };
/** Ergebnis einer Wiederherstellung (vom Bot gemeldet). */
export interface BackupRestoreResult { created: number; updated: number; failed: number; errors: string[]; parts: BackupPart[]; at: string }

export const backupConfigSchema = z.object({
  /** Dashboard-Daten täglich automatisch sichern */
  dataAuto: z.boolean().default(true),
  /** Discord-Server täglich automatisch sichern */
  discordAuto: z.boolean().default(false),
  /** so viele automatische Backups behalten (je Art bzw. Server) */
  keep: z.number().int().min(1).max(60).default(14),
});
export type BackupConfig = z.infer<typeof backupConfigSchema>;
