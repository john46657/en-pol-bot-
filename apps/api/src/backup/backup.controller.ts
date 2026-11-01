import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { backupConfigSchema, BACKUP_MODULE_GROUPS, BACKUP_PARTS, BACKUP_SCOPES, type BackupConfig, type BackupModuleKey, type BackupRestoreResult, type DiscordBackupData } from '@enrp/shared';
import { BackupService } from './backup.service';
import { BotService, CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { AppError } from '../common/errors';
import { targetGuild } from '../common/guild-context';

const sf = z.string().regex(/^\d{15,25}$/);
const fileName = z.string().regex(/^[a-z-]+-\d{8}-\d{6}(-[a-z0-9]{4})?\.json\.gz(\.enc)?$/);
const groups = z.array(z.enum(BACKUP_MODULE_GROUPS.map((g) => g.key) as [BackupModuleKey, ...BackupModuleKey[]])).max(20).optional();
const createBody = z.object({ scope: z.enum(BACKUP_SCOPES).default('DATABASE'), modules: groups, note: z.string().trim().max(300).optional(), kind: z.enum(['manuell', 'vor-update']).default('manuell') }).partial().default({});
const restoreBody = z.object({ confirm: z.literal('WIEDERHERSTELLEN'), groups, acknowledgeNewer: z.boolean().optional() });

/**
 * Administration → Backup-Center. Daten-Backups enthalten alles (auch Konten): Recht `backup.*` UND globaler Systemadministrator.
 * Wiederherstellen: Integrität → Version → Sicherung des aktuellen Stands → Umfang/Plan → Bestätigung „WIEDERHERSTELLEN“
 * (neuere Daten zusätzlich `acknowledgeNewer`) → Einspielen → Protokoll → Prüfung.
 */
@ApiTags('backups')
@Controller('backups')
export class BackupController {
  constructor(private readonly s: BackupService) {}
  @Get('config') @RequirePermission('backup.view') async config(@CurrentActor() a: Actor) { await this.s.requireGlobal(a); return this.s.config(); }
  @Put('config') @RequirePermission('backup.settings') async saveConfig(@CurrentActor() a: Actor, @Body(zodBody(backupConfigSchema)) b: BackupConfig) { await this.s.requireGlobal(a); return this.s.saveConfig(a, b); }
  /** Systemstatus (für MDT/Leitstelle/Bot nur über berechtigte Administratoren) */
  @Get('status') @RequirePermission('backup.view') async status(@CurrentActor() a: Actor) { await this.s.requireGlobal(a); return this.s.status(); }

  @Get('data') @RequirePermission('backup.view')
  async listData(@CurrentActor() a: Actor, @Query(zodBody(z.object({ archived: z.enum(['1', '0', 'all']).optional() }))) q: { archived?: string }) { await this.s.requireGlobal(a); return this.s.listData({ archived: q.archived === '1' ? true : q.archived === 'all' ? undefined : q.archived === '0' ? false : undefined }); }
  @Post('data') @RequirePermission('backup.create')
  async createData(@CurrentActor() a: Actor, @Body(zodBody(createBody)) b: z.infer<typeof createBody>) { await this.s.requireGlobal(a); return this.s.createData(a, b.kind ?? 'manuell', { scope: b.scope, modules: b.modules, note: b.note }); }
  @Get('data/:name') @RequirePermission('backup.download')
  async download(@CurrentActor() a: Actor, @Param('name', zodBody(fileName)) name: string, @Res() res: Response) {
    await this.s.requireGlobal(a);
    const buf = await this.s.downloadData(a, name);
    res.setHeader('content-type', name.endsWith('.enc') ? 'application/octet-stream' : 'application/gzip');
    res.setHeader('content-disposition', `attachment; filename="en-polizei-${name}"`);
    res.setHeader('cache-control', 'no-store');
    res.send(buf);
  }
  @Delete('data/:name') @HttpCode(204) @RequirePermission('backup.archive') async deleteData(@CurrentActor() a: Actor, @Param('name', zodBody(fileName)) name: string) { await this.s.requireGlobal(a); return this.s.deleteData(a, name); }
  @Post('data/:name/verify') @HttpCode(200) @RequirePermission('backup.verify') async verify(@CurrentActor() a: Actor, @Param('name', zodBody(fileName)) name: string) { await this.s.requireGlobal(a); return this.s.verify(a, name); }
  @Post('data/:name/archive') @HttpCode(200) @RequirePermission('backup.archive')
  async archive(@CurrentActor() a: Actor, @Param('name', zodBody(fileName)) name: string, @Body(zodBody(z.object({ archived: z.boolean().default(true) }))) b: { archived: boolean }) { await this.s.requireGlobal(a); return this.s.setArchived(a, name, b.archived); }
  /** Wiederherstellungsplan (ändert nichts) */
  @Post('data/:name/plan') @HttpCode(200) @RequirePermission('backup.restore')
  async plan(@CurrentActor() a: Actor, @Param('name', zodBody(fileName)) name: string, @Body(zodBody(z.object({ groups }))) b: { groups?: string[] }) { await this.s.requireGlobal(a); return this.s.plan({ name }, b.groups); }
  @Post('data/:name/restore') @HttpCode(200) @RequirePermission('backup.restore')
  async restore(@CurrentActor() a: Actor, @Param('name', zodBody(fileName)) name: string, @Body(zodBody(restoreBody)) b: z.infer<typeof restoreBody>) { await this.s.requireGlobal(a); return this.s.restoreData(a, { name }, { groups: b.groups, acknowledgeNewer: b.acknowledgeNewer }); }
  @Post('data-upload/restore') @HttpCode(200) @RequirePermission('backup.restore') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 500 * 1024 * 1024, files: 1 } }))
  async restoreUpload(@CurrentActor() a: Actor, @UploadedFile() file: Express.Multer.File | undefined, @Body('confirm') confirm: string, @Body('acknowledgeNewer') ack: string | undefined) {
    await this.s.requireGlobal(a);
    if (confirm !== 'WIEDERHERSTELLEN') throw new AppError('VALIDATION_FAILED', 'Zum Bestätigen „WIEDERHERSTELLEN“ eingeben.');
    return this.s.restoreData(a, { buffer: file?.buffer }, { acknowledgeNewer: ack === 'true' });
  }

  @Get('discord') @RequirePermission('settings.manage') listDiscord(@Query(zodBody(z.object({ guildId: sf.optional() }))) q: { guildId?: string }) { return this.s.listDiscord(targetGuild(q.guildId) ?? undefined); }
  @Get('discord/:id') @RequirePermission('settings.manage') getDiscord(@Param('id', ParseUUIDPipe) id: string) { return this.s.getDiscord(id); }
  @Post('discord') @RequirePermission('settings.manage') createDiscord(@CurrentActor() a: Actor, @Body(zodBody(z.object({ guildId: sf, name: z.string().trim().max(80).optional() }))) b: { guildId: string; name?: string }) { return this.s.createDiscord(a, targetGuild(b.guildId)!, b.name); }
  @Delete('discord/:id') @HttpCode(204) @RequirePermission('settings.manage') deleteDiscord(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.deleteDiscord(a, id); }
  @Post('discord/:id/restore') @HttpCode(200) @RequirePermission('settings.manage')
  restoreDiscord(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ guildId: sf.optional(), parts: z.array(z.enum(BACKUP_PARTS)).min(1), confirm: z.literal('WIEDERHERSTELLEN') }))) b: { guildId?: string; parts: (typeof BACKUP_PARTS)[number][] }) { return this.s.restoreDiscord(a, id, { ...b, guildId: targetGuild(b.guildId) ?? undefined }); }
}

/** Dienstweg des Bots: gelesene Serverdaten abliefern, Backup zum Wiederherstellen holen, Ergebnis melden. */
@ApiTags('bot')
@Controller('bot/discord-backups')
export class BotBackupController {
  constructor(private readonly s: BackupService) {}
  @BotService() @Get(':id') async get(@Param('id', ParseUUIDPipe) id: string) { const b = await this.s.getDiscord(id); return { id: b.id, guildId: b.guildId, data: b.data }; }
  @BotService() @Post(':id/data') @HttpCode(204) save(@Param('id', ParseUUIDPipe) id: string, @Body() b: { data?: DiscordBackupData; error?: string }) { return this.s.botSaveData(id, b); }
  @BotService() @Post(':id/result') @HttpCode(204) result(@Param('id', ParseUUIDPipe) id: string, @Body() b: BackupRestoreResult) { return this.s.botRestoreResult(id, b); }
}
