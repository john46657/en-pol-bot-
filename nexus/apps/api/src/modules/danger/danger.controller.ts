import { Body, Controller, Delete, Get, Param, Post, Put, UseFilters } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { restDiscordPort } from '@nexus/automation';
import { DangerError, deleteLevel, getCurrent, history, saveLevel, setLevel } from '@nexus/danger';
import { permissions } from '@nexus/permissions';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { Access, type RequestAccess } from '../../common/decorators/scope.decorator.js';
import { DangerErrorFilter } from './danger-error.filter.js';

type Body_ = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Gefahrenstatus: ansehen, setzen (mit Rollenbeschränkung je Stufe), Stufen konfigurieren. */
@ApiTags('Danger')
@ApiBearerAuth()
@UseFilters(DangerErrorFilter)
@Controller('guilds/:guildId/danger')
export class DangerController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  @RequirePermissions('danger.view')
  current(@GuildId() guildId: string) {
    return getCurrent(guildId);
  }

  @Get('history')
  @RequirePermissions('danger.view')
  history(@GuildId() guildId: string) {
    return history(guildId, 100);
  }

  @Post('set')
  @RequirePermissions('danger.set')
  async set(@GuildId() guildId: string, @Body() b: Body_, @Access() access: RequestAccess, @CurrentUser() user: RequestUser) {
    if (typeof b['level'] !== 'number') throw new DangerError('invalid', 'Stufe fehlt.');
    const override = access.bypass || (await permissions.can(access, 'danger.manage'));
    return setLevel({ guildId, level: b['level'], actorId: user.id, roleIds: access.roleIds, override, reason: str(b['reason']), port: restDiscordPort(this.config.get<string>('DISCORD_TOKEN') ?? '') });
  }

  @Put('levels/:level')
  @RequirePermissions('danger.manage')
  save(@GuildId() guildId: string, @Param('level') level: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    const roles = b['allowedRoleIds'];
    return saveLevel(guildId, { level: Number(level), name: str(b['name']) ?? '', color: str(b['color']), emoji: str(b['emoji']), description: str(b['description']), allowedRoleIds: Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : undefined }, user.id);
  }

  @Delete('levels/:level')
  @RequirePermissions('danger.manage')
  async remove(@GuildId() guildId: string, @Param('level') level: string, @CurrentUser() user: RequestUser) {
    await deleteLevel(guildId, Number(level), user.id);
    return { ok: true };
  }
}
