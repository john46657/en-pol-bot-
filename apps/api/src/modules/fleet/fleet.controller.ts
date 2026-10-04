import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Query, UseFilters } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { penalties as P, vehicles as V } from '@nexus/fleet';
import { permissionDeniedMessage, permissions } from '@nexus/permissions';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { Access, type RequestAccess } from '../../common/decorators/scope.decorator.js';
import { FleetErrorFilter } from './fleet-error.filter.js';

type Body_ = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

/** Fuhrpark: Fahrzeuge, Zuweisung zu Einheiten, Fahrer, Status, Schäden. */
@ApiTags('Fleet')
@ApiBearerAuth()
@UseFilters(FleetErrorFilter)
@Controller('guilds/:guildId/fleet')
export class FleetController {
  @Get()
  @RequirePermissions('fleet.view')
  list(@GuildId() guildId: string, @Query() q: Record<string, string | undefined>) {
    return V.listVehicles({ guildId, status: q['status'], unitId: q['unitId'], query: q['query'], includeRetired: q['retired'] === 'true' });
  }

  @Get(':id')
  @RequirePermissions('fleet.view')
  async view(@GuildId() guildId: string, @Param('id') id: string) {
    return { vehicle: await V.getVehicle(guildId, id), events: await V.vehicleHistory(guildId, id) };
  }

  @Post()
  @RequirePermissions('fleet.manage')
  add(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return V.addVehicle({ guildId, plate: str(b['plate']) ?? '', type: str(b['type']) ?? '', notes: str(b['notes']), actorId: user.id });
  }

  @Post(':id/status')
  @RequirePermissions('fleet.manage')
  status(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return V.setStatus(guildId, id, str(b['status']) ?? '', user.id);
  }

  @Post(':id/assign')
  @RequirePermissions('fleet.manage')
  assign(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return V.assignToUnit(guildId, id, str(b['unitId']) ?? '', str(b['driverId']), user.id);
  }

  @Post(':id/release')
  @RequirePermissions('fleet.manage')
  release(@GuildId() guildId: string, @Param('id') id: string, @CurrentUser() user: RequestUser) {
    return V.release(guildId, id, user.id);
  }

  @Post(':id/driver')
  @RequirePermissions('fleet.manage')
  driver(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return V.setDriver(guildId, id, str(b['driverId']) ?? null, user.id);
  }

  @Post(':id/damages')
  @RequirePermissions('fleet.report')
  damage(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return V.reportDamage({ guildId, vehicleId: id, description: str(b['description']) ?? '', severity: str(b['severity']), actorId: user.id });
  }

  @Post('damages/:damageId/repair')
  @RequirePermissions('fleet.manage')
  repair(@GuildId() guildId: string, @Param('damageId') damageId: string, @CurrentUser() user: RequestUser) {
    return V.repairDamage(guildId, damageId, user.id);
  }

  @Delete(':id')
  @RequirePermissions('fleet.manage')
  async retire(@GuildId() guildId: string, @Param('id') id: string, @CurrentUser() user: RequestUser) {
    await V.retireVehicle(guildId, id, user.id);
    return { ok: true };
  }
}

/** Strafen: ausstellen, suchen, Strafenregister, aufheben (mit `penalties.revoke` oder als Aussteller). */
@ApiTags('Penalties')
@ApiBearerAuth()
@UseFilters(FleetErrorFilter)
@Controller('guilds/:guildId/penalties')
export class PenaltiesController {
  @Get()
  @RequirePermissions('penalties.view')
  list(@GuildId() guildId: string, @Query() q: Record<string, string | undefined>) {
    return P.listPenalties({ guildId, query: q['query'], kind: q['kind'], status: q['status'], issuedBy: q['issuedBy'] || undefined, cursor: q['cursor'] || undefined, limit: Number(q['limit']) || 50 });
  }

  @Get('register')
  @RequirePermissions('penalties.view')
  register(@GuildId() guildId: string, @Query('name') name = '') {
    return P.registerOf(guildId, name);
  }

  @Post()
  @RequirePermissions('penalties.issue')
  issue(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return P.issuePenalty({ guildId, kind: str(b['kind']) ?? '', subjectName: str(b['subjectName']) ?? '', subjectUserId: str(b['subjectUserId']), reason: str(b['reason']) ?? '', issuedBy: user.id, amount: num(b['amount']), points: num(b['points']), durationDays: num(b['durationDays']), plate: str(b['plate']), operationNumber: num(b['operationNumber']) });
  }

  @Post(':id/revoke')
  @RequirePermissions('penalties.view')
  async revoke(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @Access() access: RequestAccess, @CurrentUser() user: RequestUser) {
    const p = await P.getPenalty(guildId, id);
    const own = p.issuedBy === user.id;
    if (!own && !access.bypass && !(await permissions.can(access, 'penalties.revoke'))) throw new ForbiddenException(permissionDeniedMessage(['penalties.revoke']));
    return P.revokePenalty(guildId, id, str(b['reason']), user.id, own ? 'penalties.own' : 'penalties.revoke');
  }
}
