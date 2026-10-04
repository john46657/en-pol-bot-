import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, UseFilters } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { permissionDeniedMessage } from '@nexus/permissions';
import { buildActor, canOn, getRecordByUser, scopeFor, type PersonnelActor } from '@nexus/personnel';
import {
  ShiftError,
  correctShift,
  deleteType,
  endShift,
  getOpenShift,
  PERIODS,
  getShift,
  leaderboard,
  overview,
  rankOf,
  type Period,
  listShifts,
  listTypes,
  rawData,
  saveType,
  shiftStats,
  toCsv,
  type ShiftFilter,
} from '@nexus/shifts';
import type { Permission } from '@nexus/types';
import { prisma } from '@nexus/database';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { Access, RequireAnyScope, type RequestAccess } from '../../common/decorators/scope.decorator.js';
import { ShiftErrorFilter } from './shifts-error.filter.js';

type Body_ = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const date = (v: unknown): Date | undefined => {
  if (typeof v !== 'string' || !v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ShiftError('invalid', 'Ungültiges Datum.');
  return d;
};

/**
 * Shifts: Verlauf/Statistik/Export (shifts.view, ggf. nur eigenes Team), Typen und Korrekturen (shifts.manage).
 * Starten, Pausieren und Beenden der eigenen Schicht passiert im Bot (`/schicht`); Dashboard-Beenden/Korrigieren
 * ist Führungskräften vorbehalten und verlangt eine Begründung.
 */
@ApiTags('Shifts')
@ApiBearerAuth()
@UseFilters(ShiftErrorFilter)
@Controller('guilds/:guildId/shifts')
export class ShiftsController {
  private actor(a: RequestAccess): Promise<PersonnelActor> {
    return buildActor(a);
  }

  private async filter(guildId: string, access: RequestAccess, q: Record<string, string | undefined>): Promise<ShiftFilter> {
    const scope = await scopeFor(await this.actor(access), 'shifts.view');
    const status = q['status'];
    return {
      guildId,
      userId: q['userId'] || undefined,
      typeId: q['typeId'] || undefined,
      status: status === 'ACTIVE' || status === 'PAUSED' || status === 'ENDED' ? status : undefined,
      from: date(q['from']),
      to: date(q['to']),
      restrictToTeams: scope.all ? null : scope.teamIds,
    };
  }

  private async requireOn(access: RequestAccess, key: Permission, userId: string) {
    const record = await getRecordByUser(access.guildId, userId);
    if (!(await canOn(await this.actor(access), key, { userId, teamId: record?.teamId ?? null })))
      throw new ForbiddenException(permissionDeniedMessage([key]));
  }

  @Get()
  @RequireAnyScope('shifts.view')
  async list(@GuildId() guildId: string, @Access() access: RequestAccess, @Query() q: Record<string, string | undefined>) {
    const f = await this.filter(guildId, access, q);
    return listShifts({ ...f, cursor: q['cursor'] || undefined, limit: Number(q['limit']) || 50 });
  }

  @Get('stats')
  @RequireAnyScope('shifts.view')
  async stats(@GuildId() guildId: string, @Access() access: RequestAccess, @Query() q: Record<string, string | undefined>) {
    return shiftStats(await this.filter(guildId, access, q));
  }

  private async scope(guildId: string, access: RequestAccess, q: Record<string, string | undefined>) {
    const scope = await scopeFor(await this.actor(access), 'shifts.view');
    return { guildId, typeId: q['typeId'] || undefined, restrictToTeams: scope.all ? null : scope.teamIds };
  }

  /** Heute / Woche / Monat / Gesamt (Anzahl, Gesamtzeit, Durchschnitt) für alle sichtbaren Schichten oder ein Mitglied. */
  @Get('overview')
  @RequireAnyScope('shifts.view')
  async overview(@GuildId() guildId: string, @Access() access: RequestAccess, @Query() q: Record<string, string | undefined>) {
    return overview(await this.scope(guildId, access, q), q['userId'] || undefined);
  }

  @Get('leaderboard')
  @RequireAnyScope('shifts.view')
  async leaderboard(@GuildId() guildId: string, @Access() access: RequestAccess, @Query() q: Record<string, string | undefined>) {
    const period = (PERIODS as readonly string[]).includes(q['period'] ?? '') ? (q['period'] as Period) : 'week';
    return { period, items: await leaderboard({ ...(await this.scope(guildId, access, q)), period, limit: Number(q['limit']) || 10 }) };
  }

  /** Eigene Dienstzeiten (Eigenzugriff). */
  @Get('me')
  @RequireAnyScope('own.shift.view')
  async mine(@GuildId() guildId: string, @Access() access: RequestAccess) {
    const f: ShiftFilter = { guildId, userId: access.userId, restrictToTeams: null };
    const week = { guildId, restrictToTeams: null, period: 'week' as const };
    return {
      open: await getOpenShift(guildId, access.userId),
      stats: await shiftStats(f),
      overview: await overview({ guildId, restrictToTeams: null }, access.userId),
      weekRank: await rankOf(week, access.userId),
      items: (await listShifts({ ...f, limit: 50 })).items,
    };
  }

  /** Rohdaten als CSV-Text (nur Führung; Team-Bereich beachtet). */
  @Get('export')
  @RequireAnyScope('shifts.manage')
  async export(@GuildId() guildId: string, @Access() access: RequestAccess, @Query() q: Record<string, string | undefined>) {
    const scope = await scopeFor(await this.actor(access), 'shifts.manage');
    const f = await this.filter(guildId, access, q);
    f.restrictToTeams = scope.all ? null : scope.teamIds;
    return { csv: toCsv(await rawData(f)) };
  }

  @Get('types')
  @RequireAnyScope('shifts.view', 'shifts.manage')
  types(@GuildId() guildId: string) {
    return listTypes(guildId);
  }

  @Post('types')
  @RequireAnyScope('shifts.manage')
  async createType(@GuildId() guildId: string, @Access() access: RequestAccess, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    await this.requireServerWide(access);
    return saveType(guildId, typeInput(b), user.id);
  }

  @Patch('types/:id')
  @RequireAnyScope('shifts.manage')
  async updateType(@GuildId() guildId: string, @Param('id') id: string, @Access() access: RequestAccess, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    await this.requireServerWide(access);
    return saveType(guildId, { ...typeInput(b), id }, user.id);
  }

  @Delete('types/:id')
  @RequireAnyScope('shifts.manage')
  async removeType(@GuildId() guildId: string, @Param('id') id: string, @Access() access: RequestAccess, @CurrentUser() user: RequestUser) {
    await this.requireServerWide(access);
    await deleteType(guildId, id, user.id);
    return { ok: true };
  }

  /** Typen ändern ist serverweit – eine nur auf ein Team beschränkte Verwaltungsberechtigung genügt nicht. */
  private async requireServerWide(access: RequestAccess) {
    if (!(await scopeFor(await this.actor(access), 'shifts.manage')).all)
      throw new ForbiddenException(permissionDeniedMessage(['shifts.manage']));
  }

  @Get(':id')
  @RequireAnyScope('shifts.view', 'own.shift.view')
  async view(@GuildId() guildId: string, @Param('id') id: string, @Access() access: RequestAccess) {
    const shift = await getShift(guildId, id);
    if (shift.userId !== access.userId) await this.requireOn(access, 'shifts.view', shift.userId);
    const events = await prisma.shiftEvent.findMany({ where: { shiftId: id }, orderBy: { at: 'asc' } });
    return { shift, events };
  }

  @Post(':id/end')
  @RequireAnyScope('shifts.manage')
  async end(@GuildId() guildId: string, @Param('id') id: string, @Access() access: RequestAccess, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    const shift = await getShift(guildId, id);
    await this.requireOn(access, 'shifts.manage', shift.userId);
    return endShift(guildId, id, { actorId: user.id, supervisor: true, endedAt: date(b['endedAt']), reason: str(b['reason']), permission: 'shifts.manage' });
  }

  @Post(':id/correct')
  @RequireAnyScope('shifts.manage')
  async correct(@GuildId() guildId: string, @Param('id') id: string, @Access() access: RequestAccess, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    const shift = await getShift(guildId, id);
    await this.requireOn(access, 'shifts.manage', shift.userId);
    const paused = b['pausedSeconds'];
    if (paused !== undefined && (typeof paused !== 'number' || !Number.isInteger(paused) || paused < 0)) throw new ShiftError('invalid', 'Ungültige Pausendauer.');
    return correctShift(guildId, id, { startedAt: date(b['startedAt']), endedAt: date(b['endedAt']), pausedSeconds: paused as number | undefined }, str(b['reason']), user.id, 'shifts.manage');
  }
}

function typeInput(b: Body_) {
  const roles = b['requiredRoleIds'];
  return {
    name: str(b['name']) ?? '',
    description: str(b['description']),
    emoji: str(b['emoji']),
    requiredRoleIds: Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : undefined,
    maxDurationMinutes: typeof b['maxDurationMinutes'] === 'number' ? b['maxDurationMinutes'] : undefined,
    active: typeof b['active'] === 'boolean' ? b['active'] : undefined,
  };
}
