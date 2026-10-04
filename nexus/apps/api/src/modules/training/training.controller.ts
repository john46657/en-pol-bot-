import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseFilters } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { restDiscordPort } from '@nexus/automation';
import { permissions } from '@nexus/permissions';
import { TrainingError, cancelTraining, createTraining, deleteCourse, enroll, finishTraining, getTraining, grade, listCourses, listTrainings, progressOf, saveCourse, setTrainers, startTraining, trainingHistory, updateTraining, withdraw, type Actor } from '@nexus/training';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { Access, type RequestAccess } from '../../common/decorators/scope.decorator.js';
import { TrainingErrorFilter } from './training-error.filter.js';

type Body_ = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
const strs = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined);
const date = (v: unknown): Date | undefined => {
  if (typeof v !== 'string' || !v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new TrainingError('invalid', 'Ungültiges Datum.');
  return d;
};

/** Ausbildungen: Vorlagen (Ausbildungsleitung), Termine, Ausbilder, Bewertung. Ausbilder-Zuordnung wird zusätzlich im Service geprüft. */
@ApiTags('Training')
@ApiBearerAuth()
@UseFilters(TrainingErrorFilter)
@Controller('guilds/:guildId/training')
export class TrainingController {
  constructor(private readonly config: ConfigService) {}

  private async actor(access: RequestAccess, user: RequestUser): Promise<Actor> {
    return { userId: user.id, manage: access.bypass || (await permissions.can(access, 'training.manage')), canExam: access.bypass || (await permissions.can(access, 'exam.manage')) };
  }

  @Get('courses')
  @RequirePermissions('training.view')
  courses(@GuildId() guildId: string) {
    return listCourses(guildId);
  }

  @Put('courses')
  @RequirePermissions('training.create')
  saveCourse(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return saveCourse(guildId, { id: str(b['id']), name: str(b['name']) ?? '', description: str(b['description']), active: typeof b['active'] === 'boolean' ? b['active'] : undefined, theoryMax: num(b['theoryMax']), practiceMax: num(b['practiceMax']), examMax: num(b['examMax']), passPercent: num(b['passPercent']), grantRoleId: str(b['grantRoleId']), requiredRoleIds: strs(b['requiredRoleIds']), maxParticipants: num(b['maxParticipants']) }, user.id);
  }

  @Delete('courses/:id')
  @RequirePermissions('training.edit')
  async deleteCourse(@GuildId() guildId: string, @Param('id') id: string, @CurrentUser() user: RequestUser) {
    await deleteCourse(guildId, id, user.id);
    return { ok: true };
  }

  @Get()
  @RequirePermissions('training.view')
  list(@GuildId() guildId: string, @Query() q: Record<string, string | undefined>) {
    return listTrainings({ guildId, status: q['status'], courseId: q['courseId'], upcoming: q['upcoming'] === 'true', userId: q['userId'] || undefined, limit: Number(q['limit']) || 50 });
  }

  /** Eigener Ausbildungsstand. */
  @Get('me')
  @RequirePermissions('own.training.view')
  mine(@GuildId() guildId: string, @CurrentUser() user: RequestUser) {
    return progressOf(guildId, user.id);
  }

  @Get(':id')
  @RequirePermissions('training.view')
  async view(@GuildId() guildId: string, @Param('id') id: string) {
    return { training: await getTraining(guildId, id), events: await trainingHistory(guildId, id) };
  }

  @Post()
  @RequirePermissions('training.create')
  create(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    const when = date(b['scheduledAt']);
    if (!when) throw new TrainingError('invalid', 'Der Termin fehlt.');
    return createTraining({ guildId, courseId: str(b['courseId']) ?? '', scheduledAt: when, actorId: user.id, location: str(b['location']), notes: str(b['notes']), trainerIds: strs(b['trainerIds']), maxParticipants: num(b['maxParticipants']) });
  }

  @Post(':id')
  @RequirePermissions('training.edit')
  update(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return updateTraining(guildId, id, { scheduledAt: date(b['scheduledAt']), location: str(b['location']), notes: str(b['notes']), maxParticipants: num(b['maxParticipants']) }, user.id);
  }

  @Post(':id/trainers')
  @RequirePermissions('training.trainer.manage')
  trainers(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return setTrainers(guildId, id, strs(b['trainerIds']) ?? [], user.id);
  }

  @Post(':id/enroll')
  @RequirePermissions('training.session.manage')
  async enrollMember(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return enroll({ guildId, trainingId: id, userId: str(b['userId']) ?? '', actorId: user.id, force: true });
  }

  @Post(':id/remove')
  @RequirePermissions('training.session.manage')
  async remove(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    await withdraw(guildId, id, str(b['userId']) ?? '', user.id, str(b['reason']));
    return { ok: true };
  }

  @Post(':id/start')
  @RequirePermissions('training.session.manage')
  async start(@GuildId() guildId: string, @Param('id') id: string, @Access() access: RequestAccess, @CurrentUser() user: RequestUser) {
    return startTraining(guildId, id, await this.actor(access, user));
  }

  @Post(':id/grade')
  @RequirePermissions('training.session.manage')
  async grade(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @Access() access: RequestAccess, @CurrentUser() user: RequestUser) {
    return grade({ guildId, trainingId: id, userId: str(b['userId']) ?? '', part: str(b['part']) ?? '', points: num(b['points']) ?? Number.NaN, actor: await this.actor(access, user), port: restDiscordPort(this.config.get<string>('DISCORD_TOKEN') ?? '') });
  }

  @Post(':id/finish')
  @RequirePermissions('training.session.manage')
  async finish(@GuildId() guildId: string, @Param('id') id: string, @Access() access: RequestAccess, @CurrentUser() user: RequestUser) {
    return finishTraining(guildId, id, await this.actor(access, user));
  }

  @Post(':id/cancel')
  @RequirePermissions('training.session.manage')
  async cancel(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @Access() access: RequestAccess, @CurrentUser() user: RequestUser) {
    return cancelTraining(guildId, id, str(b['reason']), user.id, (await this.actor(access, user)).manage === true);
  }
}
