import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { backupConfigSchema, BACKUP_PARTS, type BackupConfig, type BackupRestoreResult, type DiscordBackupData } from '@enrp/shared';
import { BackupService } from './backup.service';
import { BotService, CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { AppError } from '../common/errors';

const sf = z.string().regex(/^\d{15,25}$/);
const fileName = z.string().regex(/^[a-z-]+-\d{8}-\d{6}\.json\.gz$/);

/**
 * Administration → Backups. Eigene Rechte: backups.view (Liste, Verlauf), backups.manage (erstellen, herunterladen, löschen, Zeitplan,
 * Wiederherstellungstest), backups.restore (tatsächlich einspielen). Daten-Backups enthalten alles (auch Konten).
 */
@ApiTags('backups')
@Controller('backups')
export class BackupController {
  constructor(private readonly s: BackupService) {}
  @Get('config') @RequirePermission('backups.view') config() { return this.s.config(); }
  @Put('config') @RequirePermission('backups.manage') saveConfig(@CurrentActor() a: Actor, @Body(zodBody(backupConfigSchema)) b: BackupConfig) { return this.s.saveConfig(a, b); }

  @Get('data') @RequirePermission('backups.view') listData() { return this.s.listData(); }
  @Post('data') @RequirePermission('backups.manage') createData(@CurrentActor() a: Actor) { return this.s.createData(a, 'manuell'); }
  @Get('data/:name') @RequirePermission('backups.manage')
  async download(@Param('name', zodBody(fileName)) name: string, @Res() res: Response) {
    const buf = await this.s.readData(name);
    res.setHeader('content-type', 'application/gzip');
    res.setHeader('content-disposition', `attachment; filename="en-polizei-${name}"`);
    res.send(buf);
  }
  /** Wiederherstellungstest: einspielen, prüfen, zurückrollen (ändert nichts am Datenbestand) */
  @Post('data/:name/verify') @HttpCode(200) @RequirePermission('backups.manage') verify(@CurrentActor() a: Actor, @Param('name', zodBody(fileName)) name: string) { return this.s.verifyData(a, name); }
  @Get('runs') @RequirePermission('backups.view') runs() { return this.s.runs(); }
  @Delete('data/:name') @HttpCode(204) @RequirePermission('backups.manage') deleteData(@CurrentActor() a: Actor, @Param('name', zodBody(fileName)) name: string) { return this.s.deleteData(a, name); }
  @Post('data/:name/restore') @HttpCode(200) @RequirePermission('backups.restore')
  restore(@CurrentActor() a: Actor, @Param('name', zodBody(fileName)) name: string, @Body(zodBody(z.object({ confirm: z.literal('WIEDERHERSTELLEN') }))) _b: unknown) { return this.s.restoreData(a, { name }); }
  @Post('data-upload/restore') @HttpCode(200) @RequirePermission('backups.restore') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 500 * 1024 * 1024, files: 1 } }))
  restoreUpload(@CurrentActor() a: Actor, @UploadedFile() file: Express.Multer.File | undefined, @Body('confirm') confirm: string) {
    if (confirm !== 'WIEDERHERSTELLEN') throw new AppError('VALIDATION_FAILED', 'Zum Bestätigen „WIEDERHERSTELLEN“ eingeben.');
    return this.s.restoreData(a, { buffer: file?.buffer });
  }

  @Get('discord') @RequirePermission('backups.view') listDiscord(@Query(zodBody(z.object({ guildId: sf.optional() }))) q: { guildId?: string }) { return this.s.listDiscord(q.guildId); }
  @Get('discord/:id') @RequirePermission('backups.view') getDiscord(@Param('id', ParseUUIDPipe) id: string) { return this.s.getDiscord(id); }
  @Post('discord') @RequirePermission('backups.manage') createDiscord(@CurrentActor() a: Actor, @Body(zodBody(z.object({ guildId: sf, name: z.string().trim().max(80).optional() }))) b: { guildId: string; name?: string }) { return this.s.createDiscord(a, b.guildId, b.name); }
  @Delete('discord/:id') @HttpCode(204) @RequirePermission('backups.manage') deleteDiscord(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.deleteDiscord(a, id); }
  @Post('discord/:id/restore') @HttpCode(200) @RequirePermission('backups.restore')
  restoreDiscord(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ guildId: sf.optional(), parts: z.array(z.enum(BACKUP_PARTS)).min(1), confirm: z.literal('WIEDERHERSTELLEN') }))) b: { guildId?: string; parts: (typeof BACKUP_PARTS)[number][] }) { return this.s.restoreDiscord(a, id, b); }
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
