import { BadRequestException, Body, Controller, Get, Post, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { auditRepository } from '@nexus/database';
import type { Response } from 'express';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { RequireGuildAdmin } from '../../common/decorators/guild-admin.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { forgetModuleState } from '../../common/guards/module.guard.js';
import { BackupError, RESET_SCOPES, TABLES, backupJson, createBackup, resetSettings, restoreBackup, type ResetScope } from './backup.js';

/** Sicherung der Server-Konfiguration: herunterladen (backup.create), einspielen (backup.restore), zurücksetzen (Server-Verwalter). */
@ApiTags('Backup')
@ApiBearerAuth()
@Controller('guilds/:guildId/backup')
export class BackupController {
  @Get('info')
  @RequirePermissions('backup.create')
  info() {
    return { tables: TABLES.map((t) => t.model), resetScopes: RESET_SCOPES };
  }

  @Get()
  @RequirePermissions('backup.create')
  async download(@GuildId() guildId: string, @CurrentUser() user: RequestUser, @Res({ passthrough: true }) res: Response) {
    const b = await createBackup(guildId);
    const counts = Object.fromEntries(Object.entries(b.tables).map(([k, v]) => [k, v.length]));
    await auditRepository.log({ guildId, actorId: user.id, action: 'backup.created', resource: ['Backup', guildId], after: counts as never, permission: 'backup.create' });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="nexus-backup-${guildId}-${b.createdAt.slice(0, 10)}.json"`);
    return new StreamableFile(Buffer.from(backupJson(b), 'utf8'));
  }

  @Post('restore')
  @RequirePermissions('backup.restore')
  async restore(@GuildId() guildId: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    try {
      const r = await restoreBackup(guildId, body);
      forgetModuleState(guildId);
      await auditRepository.log({ guildId, actorId: user.id, action: 'backup.restored', resource: ['Backup', guildId], after: { restored: r.restored, skipped: r.skipped.length, from: (body as { createdAt?: string } | null)?.createdAt ?? null } as never, permission: 'backup.restore' });
      return r;
    } catch (e) {
      if (e instanceof BackupError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  /** Zurücksetzen (nur Server-Verwalter, Bestätigung „ZURÜCKSETZEN“). Vorher wird automatisch gesichert; die Sicherung kommt mit zurück. */
  @Post('reset')
  @RequireGuildAdmin()
  async reset(@GuildId() guildId: string, @Body() body: { scopes?: unknown; confirm?: unknown }, @CurrentUser() user: RequestUser) {
    if (body?.confirm !== 'ZURÜCKSETZEN') throw new BadRequestException('Bitte zur Bestätigung „ZURÜCKSETZEN“ eingeben.');
    const scopes = Array.isArray(body.scopes) ? body.scopes.filter((s): s is ResetScope => typeof s === 'string' && s in RESET_SCOPES) : [];
    if (scopes.length === 0 || scopes.length !== (body.scopes as unknown[]).length) throw new BadRequestException('Bitte gültige Bereiche wählen.');
    const backup = await createBackup(guildId);
    const done = await resetSettings(guildId, scopes);
    forgetModuleState(guildId);
    await auditRepository.log({ guildId, actorId: user.id, action: 'backup.reset', resource: ['Backup', guildId], after: { scopes } as never, permission: 'backup.restore' });
    return { done, backup };
  }
}
