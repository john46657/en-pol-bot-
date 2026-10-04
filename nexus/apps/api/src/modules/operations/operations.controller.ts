import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseFilters } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OperationError, assignUnit, changeStatus, createOperation, getOperation, listOperations, operationHistory, operationStats, setLeader, unassignUnit, updateOperation } from '@nexus/operations';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { OperationErrorFilter } from './operations-error.filter.js';

type Body_ = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const date = (v: unknown): Date | undefined => {
  if (typeof v !== 'string' || !v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new OperationError('invalid', 'Ungültiges Datum.');
  return d;
};

/** Einsätze. Im Dashboard verwaltet die Führung (`operations.manage`); Beamte arbeiten über `/einsatz` im Bot. */
@ApiTags('Operations')
@ApiBearerAuth()
@UseFilters(OperationErrorFilter)
@Controller('guilds/:guildId/operations')
export class OperationsController {
  @Get()
  @RequirePermissions('operations.view')
  list(@GuildId() guildId: string, @Query() q: Record<string, string | undefined>) {
    return listOperations({ guildId, status: q['status'] || undefined, open: q['open'] === 'true', priority: q['priority'] || undefined, userId: q['userId'] || undefined, from: date(q['from']), to: date(q['to']), cursor: q['cursor'] || undefined, limit: Number(q['limit']) || 50 });
  }

  @Get('stats')
  @RequirePermissions('operations.view')
  stats(@GuildId() guildId: string, @Query() q: Record<string, string | undefined>) {
    return operationStats(guildId, date(q['from']), date(q['to']));
  }

  @Get(':id')
  @RequirePermissions('operations.view')
  async view(@GuildId() guildId: string, @Param('id') id: string) {
    return { operation: await getOperation(guildId, id), events: await operationHistory(guildId, id) };
  }

  @Post()
  @RequirePermissions('operations.create')
  create(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return createOperation({ guildId, actorId: user.id, kind: str(b['kind']) ?? '', location: str(b['location']) ?? '', priority: str(b['priority']), description: str(b['description']) });
  }

  @Patch(':id')
  @RequirePermissions('operations.manage')
  update(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return updateOperation(guildId, id, { kind: str(b['kind']), location: str(b['location']), priority: str(b['priority']), description: str(b['description']) }, user.id);
  }

  @Post(':id/units')
  @RequirePermissions('operations.manage')
  assign(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return assignUnit(guildId, id, str(b['unitId']) ?? '', user.id);
  }

  @Delete(':id/units/:unitId')
  @RequirePermissions('operations.manage')
  unassign(@GuildId() guildId: string, @Param('id') id: string, @Param('unitId') unitId: string, @CurrentUser() user: RequestUser) {
    return unassignUnit(guildId, id, unitId, user.id);
  }

  @Post(':id/leader')
  @RequirePermissions('operations.manage')
  leader(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return setLeader(guildId, id, str(b['userId']) ?? '', user.id);
  }

  @Post(':id/status')
  @RequirePermissions('operations.manage')
  status(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return changeStatus({ guildId, operationId: id, to: str(b['status']) ?? '', actorId: user.id, report: str(b['report']), outcome: str(b['outcome']), permission: 'operations.manage' });
  }
}
