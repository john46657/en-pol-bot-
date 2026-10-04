import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Put, Query, UseFilters } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { permissionDeniedMessage, permissions } from '@nexus/permissions';
import { MAX_DURATION_MINUTES, checkSubject, createNotice, getDefaultDuration, getNotice, history, setDefaultDuration, revokeNotice, searchNotices, updateNotice } from '@nexus/wanted';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { Access, type RequestAccess } from '../../common/decorators/scope.decorator.js';
import { WantedErrorFilter } from './wanted-error.filter.js';

type Body_ = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
const pick = (b: Body_, keys: string[]) => Object.fromEntries(keys.map((k) => [k, str(b[k])]));
const FIELDS = ['reason', 'priority', 'lastSeen', 'notes', 'subjectName', 'subjectUserId', 'appearance', 'plate', 'vehicleModel', 'vehicleColor', 'ownerName'];

/** Fahndungen – Personen (`kind=PERSON`) und Fahrzeuge (`kind=VEHICLE`) getrennt anlegen und filtern. */
@ApiTags('Wanted')
@ApiBearerAuth()
@UseFilters(WantedErrorFilter)
@Controller('guilds/:guildId/wanted')
export class WantedController {
  @Get()
  @RequirePermissions('wanted.view')
  list(@GuildId() guildId: string, @Query() q: Record<string, string | undefined>) {
    return searchNotices({ guildId, kind: q['kind'], status: q['status'], query: q['query'], priority: q['priority'] || undefined, cursor: q['cursor'] || undefined, limit: Number(q['limit']) || 50 });
  }

  /** Standarddauer neuer Fahndungen (Minuten; 0 = läuft nicht ab). */
  @Get('settings')
  @RequirePermissions('wanted.view')
  async settings(@GuildId() guildId: string) {
    return { defaultMinutes: await getDefaultDuration(guildId), maxMinutes: MAX_DURATION_MINUTES };
  }

  @Put('settings')
  @RequirePermissions('system.manage')
  async setSettings(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return { defaultMinutes: await setDefaultDuration(guildId, num(b['defaultMinutes']) ?? Number.NaN, user.id), maxMinutes: MAX_DURATION_MINUTES };
  }

  /** Wird diese Person / dieses Kennzeichen gerade gesucht? */
  @Get('check')
  @RequirePermissions('wanted.view')
  async check(@GuildId() guildId: string, @Query('kind') kind: string, @Query('value') value = '') {
    return { wanted: kind === 'PERSON' || kind === 'VEHICLE' ? await checkSubject(guildId, kind, value) : null };
  }

  @Get(':id')
  @RequirePermissions('wanted.view')
  async view(@GuildId() guildId: string, @Param('id') id: string) {
    return { notice: await getNotice(guildId, id), events: await history(guildId, id) };
  }

  @Post('persons')
  @RequirePermissions('wanted.create')
  createPerson(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return createNotice({ guildId, kind: 'PERSON', actorId: user.id, reason: str(b['reason']) ?? '', durationMinutes: num(b['durationMinutes']), ...pick(b, FIELDS.filter((f) => f !== 'reason')) });
  }

  @Post('vehicles')
  @RequirePermissions('wanted.create')
  createVehicle(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return createNotice({ guildId, kind: 'VEHICLE', actorId: user.id, reason: str(b['reason']) ?? '', durationMinutes: num(b['durationMinutes']), ...pick(b, FIELDS.filter((f) => f !== 'reason')) });
  }

  @Patch(':id')
  @RequirePermissions('wanted.edit')
  update(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return updateNotice(guildId, id, pick(b, FIELDS), user.id);
  }

  /** Aufheben: mit `wanted.revoke` oder als Ersteller der Fahndung. */
  @Post(':id/revoke')
  @RequirePermissions('wanted.view')
  async revoke(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @Access() access: RequestAccess, @CurrentUser() user: RequestUser) {
    const n = await getNotice(guildId, id);
    const own = n.createdBy === user.id;
    if (!own && !access.bypass && !(await permissions.can(access, 'wanted.revoke'))) throw new ForbiddenException(permissionDeniedMessage(['wanted.revoke']));
    return revokeNotice(guildId, id, str(b['reason']), user.id, own ? 'wanted.own' : 'wanted.revoke');
  }
}
