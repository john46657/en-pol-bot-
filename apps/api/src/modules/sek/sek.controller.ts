import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseFilters } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { restDiscordPort } from '@nexus/automation';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SekError, addMember, assignSquad, createSekOperation, getConfig, isSekCourse, listApplications, listMembers, listSekOperations, listSekTrainings, listSquads, removeMember, removeSquadMember, saveConfig, saveSquad, setSquadMember, stats, syncRadio } from '@nexus/sek';
import { createTraining } from '@nexus/training';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { SekErrorFilter } from './sek-error.filter.js';

type Body_ = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** SEK-Modul: Konfiguration (sek.manage), Personal/Einsatzteams/Einsätze/Funk (sek.member.manage), Ausbildungen, Statistik, Bewerbungen. */
@ApiTags('SEK')
@ApiBearerAuth()
@UseFilters(SekErrorFilter)
@Controller('guilds/:guildId/sek')
export class SekController {
  constructor(private readonly config: ConfigService) {}
  private port() {
    return restDiscordPort(this.config.get<string>('DISCORD_TOKEN') ?? '');
  }

  @Get('config')
  @RequirePermissions('sek.view')
  getConfig(@GuildId() guildId: string) {
    return getConfig(guildId);
  }

  @Put('config')
  @RequirePermissions('sek.manage')
  saveConfig(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    const ids = b['courseIds'];
    return saveConfig(guildId, { teamId: str(b['teamId']) ?? null, qualificationId: str(b['qualificationId']) ?? null, shiftTypeId: str(b['shiftTypeId']) ?? null, applicationId: str(b['applicationId']) ?? null, courseIds: Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [] }, user.id);
  }

  @Get('members')
  @RequirePermissions('sek.view')
  members(@GuildId() guildId: string) {
    return listMembers(guildId);
  }

  @Post('members')
  @RequirePermissions('sek.member.manage')
  add(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return addMember({ guildId, userId: str(b['userId']) ?? '', actorId: user.id, override: b['override'] === true, reason: str(b['reason']), port: this.port() });
  }

  @Delete('members/:userId')
  @RequirePermissions('sek.member.manage')
  async remove(@GuildId() guildId: string, @Param('userId') userId: string, @Query('reason') reason: string | undefined, @CurrentUser() user: RequestUser) {
    await removeMember({ guildId, userId, actorId: user.id, reason, port: this.port() });
    return { ok: true };
  }

  @Get('squads')
  @RequirePermissions('sek.view')
  squads(@GuildId() guildId: string) {
    return listSquads(guildId);
  }

  @Put('squads')
  @RequirePermissions('sek.member.manage')
  saveSquad(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return saveSquad(guildId, { id: str(b['id']), name: str(b['name']) ?? '', leaderId: str(b['leaderId']), active: typeof b['active'] === 'boolean' ? b['active'] : undefined }, user.id);
  }

  @Post('squads/:id/members')
  @RequirePermissions('sek.member.manage')
  squadMember(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return setSquadMember(guildId, id, str(b['userId']) ?? '', str(b['role']), user.id);
  }

  @Delete('squads/:id/members/:userId')
  @RequirePermissions('sek.member.manage')
  squadMemberRemove(@GuildId() guildId: string, @Param('id') id: string, @Param('userId') userId: string, @CurrentUser() user: RequestUser) {
    return removeSquadMember(guildId, id, userId, user.id);
  }

  @Get('operations')
  @RequirePermissions('sek.view')
  operations(@GuildId() guildId: string) {
    return listSekOperations(guildId);
  }

  @Post('operations')
  @RequirePermissions('sek.member.manage')
  createOperation(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return createSekOperation({ guildId, actorId: user.id, kind: str(b['kind']) ?? '', location: str(b['location']) ?? '', priority: str(b['priority']), description: str(b['description']) });
  }

  @Post('operations/:id/squads')
  @RequirePermissions('sek.member.manage')
  assign(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return assignSquad(guildId, id, str(b['squadId']) ?? '', user.id);
  }

  @Get('trainings')
  @RequirePermissions('sek.training.view')
  trainings(@GuildId() guildId: string) {
    return listSekTrainings(guildId);
  }

  /** Nur SEK-Ausbildungen: Termin anlegen. Bewertung/Anmeldung laufen über das Ausbildungssystem. */
  @Post('trainings')
  @RequirePermissions('sek.training.manage')
  async createTraining(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    const courseId = str(b['courseId']) ?? '';
    if (!(await isSekCourse(guildId, courseId))) throw new SekError('forbidden', 'Das ist keine SEK-Ausbildung.');
    const when = new Date(str(b['scheduledAt']) ?? '');
    if (Number.isNaN(when.getTime())) throw new SekError('invalid', 'Der Termin fehlt.');
    return createTraining({ guildId, courseId, scheduledAt: when, actorId: user.id, location: str(b['location']), trainerIds: Array.isArray(b['trainerIds']) ? (b['trainerIds'] as unknown[]).filter((x): x is string => typeof x === 'string') : [user.id] });
  }

  @Get('applications')
  @RequirePermissions('sek.application.view')
  applications(@GuildId() guildId: string) {
    return listApplications(guildId);
  }

  @Post('radio-sync')
  @RequirePermissions('sek.member.manage')
  radio(@GuildId() guildId: string, @CurrentUser() user: RequestUser) {
    return syncRadio(guildId, user.id);
  }

  @Get('stats')
  @RequirePermissions('sek.view')
  stats(@GuildId() guildId: string, @Query('period') period?: string) {
    return stats(guildId, period === 'day' || period === 'week' || period === 'all' ? period : 'month');
  }
}
