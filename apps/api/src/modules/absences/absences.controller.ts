import { Body, Controller, Get, Param, Post, Query, UseFilters } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AbsenceError, approve, endEarly, historyOf, listAbsences, listActive, parseDay, reject, requestAbsence, withdraw } from '@nexus/absences';
import { restDiscordPort } from '@nexus/automation';
import { permissions } from '@nexus/permissions';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { Access, type RequestAccess } from '../../common/decorators/scope.decorator.js';
import { AbsenceErrorFilter } from './absences-error.filter.js';

type Body_ = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Abmeldungen: eigene (own.absence.create), Übersicht/Entscheidung (absence.view / absence.manage). */
@ApiTags('Absences')
@ApiBearerAuth()
@UseFilters(AbsenceErrorFilter)
@Controller('guilds/:guildId/absences')
export class AbsencesController {
  constructor(private readonly config: ConfigService) {}
  private port() {
    return restDiscordPort(this.config.get<string>('DISCORD_TOKEN') ?? '');
  }
  private async manage(a: RequestAccess) {
    return a.bypass || (await permissions.can(a, 'absence.manage'));
  }

  @Get()
  @RequirePermissions('absence.view')
  list(@GuildId() guildId: string, @Query() q: Record<string, string | undefined>) {
    return listAbsences({ guildId, status: q['status'], userId: q['userId'] || undefined, upcoming: q['upcoming'] === 'true', cursor: q['cursor'] || undefined, limit: Number(q['limit']) || 50 });
  }

  @Get('active')
  @RequirePermissions('absence.view')
  active(@GuildId() guildId: string) {
    return listActive(guildId);
  }

  @Get('me')
  @RequirePermissions('own.absence.create')
  mine(@GuildId() guildId: string, @CurrentUser() user: RequestUser) {
    return historyOf(guildId, user.id);
  }

  @Get('history/:userId')
  @RequirePermissions('absence.view')
  history(@GuildId() guildId: string, @Param('userId') userId: string) {
    return historyOf(guildId, userId);
  }

  @Post()
  @RequirePermissions('own.absence.create')
  create(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    const start = parseDay(str(b['start']) ?? '');
    const end = parseDay(str(b['end']) ?? '');
    if (!start || !end) throw new AbsenceError('invalid', 'Bitte Beginn und Ende als Datum angeben.');
    return requestAbsence({ guildId, userId: user.id, start, end, category: str(b['category']) ?? 'URLAUB', reason: str(b['reason']) ?? '', port: this.port() });
  }

  @Post(':id/approve')
  @RequirePermissions('absence.manage')
  approve(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return approve({ guildId, absenceId: id, actorId: user.id, reason: str(b['reason']), port: this.port() });
  }

  @Post(':id/reject')
  @RequirePermissions('absence.manage')
  reject(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return reject({ guildId, absenceId: id, actorId: user.id, reason: str(b['reason']), port: this.port() });
  }

  @Post(':id/withdraw')
  @RequirePermissions('own.absence.create')
  async withdraw(@GuildId() guildId: string, @Param('id') id: string, @Access() access: RequestAccess, @CurrentUser() user: RequestUser) {
    return withdraw(guildId, id, user.id, await this.manage(access));
  }

  @Post(':id/end')
  @RequirePermissions('own.absence.create')
  async end(@GuildId() guildId: string, @Param('id') id: string, @Access() access: RequestAccess, @CurrentUser() user: RequestUser) {
    return endEarly(guildId, id, user.id, await this.manage(access));
  }
}
