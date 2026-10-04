import { Body, Controller, Delete, Get, Param, Patch, Post, UseFilters } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ShiftError, assignToUnit, disbandUnit, dutyOverview, leaveUnit, unitHistory, updateUnit } from '@nexus/shifts';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { ShiftErrorFilter } from './shifts-error.filter.js';

type Body_ = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/**
 * Dienst & Streifen: Übersicht (Einheiten, Besetzung, Verfügbarkeit) und Verwaltung durch die Führung.
 * Streife bilden/beitreten und der eigene Status laufen über den Bot (`/streife`).
 */
@ApiTags('Duty')
@ApiBearerAuth()
@UseFilters(ShiftErrorFilter)
@Controller('guilds/:guildId/duty')
export class DutyController {
  @Get()
  @RequirePermissions('duty.view')
  overview(@GuildId() guildId: string) {
    return dutyOverview(guildId);
  }

  @Get('units/:id/history')
  @RequirePermissions('duty.view')
  history(@GuildId() guildId: string, @Param('id') id: string) {
    return unitHistory(guildId, id);
  }

  @Patch('units/:id')
  @RequirePermissions('duty.unit.manage')
  update(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return updateUnit(guildId, id, { status: str(b['status']), vehicle: str(b['vehicle']), location: str(b['location']), note: str(b['note']) }, user.id, true);
  }

  @Post('units/:id/assign')
  @RequirePermissions('duty.unit.manage')
  assign(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    const userId = str(b['userId']) ?? '';
    if (!/^\d{5,25}$/.test(userId)) throw new ShiftError('invalid', 'Ungültige Discord-Benutzer-ID.');
    return assignToUnit(guildId, userId, id, user.id);
  }

  @Post('units/:id/remove')
  @RequirePermissions('duty.unit.manage')
  async remove(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    await leaveUnit(guildId, str(b['userId']) ?? '', user.id, 'removed');
    return { ok: true };
  }

  @Delete('units/:id')
  @RequirePermissions('duty.unit.manage')
  async disband(@GuildId() guildId: string, @Param('id') id: string, @CurrentUser() user: RequestUser) {
    await disbandUnit(guildId, id, user.id);
    return { ok: true };
  }
}
