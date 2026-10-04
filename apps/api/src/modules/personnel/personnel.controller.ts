import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseFilters,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { restDiscordPort } from '@nexus/automation';
import { getGuildMember, listGuildMembers } from '@nexus/discord';
import { permissionDeniedMessage } from '@nexus/permissions';
import {
  PersonnelError,
  addEntry,
  archiveRecord,
  buildActor,
  canOn,
  createRecord,
  deleteRank,
  deleteTeam,
  getEntry,
  getNumberFormat,
  getRecord,
  getRecordByUser,
  listRanks,
  listRecords,
  listTeams,
  recordSections,
  restoreRecord,
  revokeEntry,
  saveRank,
  saveTeam,
  scopeFor,
  setNumberFormat,
  setRank,
  setServiceNumber,
  setTeam,
  updateRecord,
  visibleSections,
  type PersonnelActor,
} from '@nexus/personnel';
import type { Permission } from '@nexus/types';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import {
  Access,
  RequireAnyScope,
  type RequestAccess,
} from '../../common/decorators/scope.decorator.js';
import { PersonnelErrorFilter } from './personnel-error.filter.js';

const ENTRY_PERMISSION: Record<string, Permission> = {
  AWARD: 'personnel.award.manage',
  DISCIPLINE: 'personnel.discipline.manage',
  NOTE: 'personnel.note.create',
};

type Body_ = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const date = (v: unknown): Date | undefined => {
  if (typeof v !== 'string' || !v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new PersonnelError('invalid', 'Ungültiges Datum.');
  return d;
};

/**
 * Personalakten. Jeder Bereich hat eigene Berechtigungen, und Rechte können auf das **eigene Team** beschränkt sein:
 * der Guard prüft „irgendwo vorhanden“ (`@RequireAnyScope`), die konkrete Akte prüft dieser Controller (`canOn`).
 */
@ApiTags('Personnel')
@ApiBearerAuth()
@UseFilters(PersonnelErrorFilter)
@Controller('guilds/:guildId/personnel')
export class PersonnelController {
  constructor(private readonly config: ConfigService) {}

  private port() {
    return restDiscordPort(this.config.get<string>('DISCORD_TOKEN') ?? '');
  }

  private actor(a: RequestAccess): Promise<PersonnelActor> {
    return buildActor(a);
  }

  /** Verweigert mit verständlicher Meldung, wenn der Aufrufer das Recht auf dieser Akte nicht hat. */
  private async require(
    actor: PersonnelActor,
    key: Permission,
    target: { userId: string; teamId: string | null },
  ): Promise<void> {
    if (!(await canOn(actor, key, target)))
      throw new ForbiddenException(permissionDeniedMessage([key]));
  }

  @Get()
  @RequireAnyScope('personnel.view')
  async list(
    @GuildId() guildId: string,
    @Access() access: RequestAccess,
    @Query('query') query?: string,
    @Query('status') status?: string,
    @Query('teamId') teamId?: string,
    @Query('rankId') rankId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const scope = await scopeFor(await this.actor(access), 'personnel.view');
    return listRecords({
      guildId,
      query: query?.trim() || undefined,
      status: status === 'ARCHIVED' ? 'ARCHIVED' : status === 'ACTIVE' ? 'ACTIVE' : undefined,
      teamId: teamId || undefined,
      rankId: rankId || undefined,
      restrictToTeams: scope.all ? null : scope.teamIds,
      cursor: cursor || undefined,
      limit: Number(limit) || 50,
    });
  }

  /** Mitgliedersuche für „Neue Akte“ (ohne manuelle IDs). */
  @Get('member-search')
  @RequireAnyScope('personnel.create')
  async memberSearch(@GuildId() guildId: string, @Query('query') query?: string) {
    const q = query?.trim();
    if (!q || q.length < 2) return [];
    const members = await listGuildMembers(
      this.config.get<string>('DISCORD_TOKEN') ?? '',
      guildId,
      { query: q, limit: 15 },
    );
    const existing = new Set(
      (await listRecords({ guildId, restrictToTeams: null, limit: 100, query: q })).items.map(
        (r) => r.userId,
      ),
    );
    return members.map((m) => ({
      id: m.userId,
      username: m.username,
      displayName: m.globalName ?? m.username,
      hasRecord: existing.has(m.userId),
    }));
  }

  /** Die eigene Akte (Eigenzugriff). */
  @Get('me')
  @RequireAnyScope('own.profile.view')
  async mine(@GuildId() guildId: string, @Access() access: RequestAccess) {
    const record = await getRecordByUser(guildId, access.userId);
    if (!record)
      throw new PersonnelError('not-found', 'Für dich existiert noch keine Personalakte.');
    return this.view(guildId, record.id, access);
  }

  @Get(':id')
  @RequireAnyScope('personnel.view', 'own.profile.view')
  async view(@GuildId() guildId: string, @Param('id') id: string, @Access() access: RequestAccess) {
    const actor = await this.actor(access);
    const record = await getRecord(guildId, id);
    const sections = await visibleSections(actor, record);
    if (!sections.has('base'))
      throw new ForbiddenException(permissionDeniedMessage(['personnel.view']));
    const data = await recordSections(guildId, id, {
      awards: sections.has('awards'),
      discipline: sections.has('discipline'),
      notes: sections.has('notes'),
      history: sections.has('history'),
    });
    const can = async (k: Permission) => canOn(actor, k, record);
    return {
      record,
      sections: [...sections],
      entries: data.entries,
      events: data.events,
      /** Was der Aufrufer auf dieser Akte tun darf – nur zur Darstellung; durchgesetzt wird serverseitig. */
      can: {
        edit: await can('personnel.edit'),
        rank: await can('personnel.rank.edit'),
        team: await can('personnel.team.edit'),
        number: await can('personnel.number.edit'),
        archive: await can('personnel.archive'),
        award: await can('personnel.award.manage'),
        discipline: await can('personnel.discipline.manage'),
        note: await can('personnel.note.create'),
      },
    };
  }

  @Post()
  @RequireAnyScope('personnel.create')
  async create(
    @GuildId() guildId: string,
    @Access() access: RequestAccess,
    @Body() body: Body_,
    @CurrentUser() user: RequestUser,
  ) {
    const userId = str(body['userId']) ?? '';
    const teamId = str(body['teamId']) || null;
    const actor = await this.actor(access);
    await this.require(actor, 'personnel.create', { userId, teamId });
    if (!/^\d{5,25}$/.test(userId))
      throw new PersonnelError('invalid', 'Ungültige Discord-Benutzer-ID.');
    const member = await getGuildMember(
      this.config.get<string>('DISCORD_TOKEN') ?? '',
      guildId,
      userId,
    ).catch(() => null);
    if (!member) throw new PersonnelError('invalid', 'Dieses Mitglied ist nicht auf dem Server.');
    return createRecord(
      {
        guildId,
        userId,
        rpName: str(body['rpName']) ?? '',
        actorId: user.id,
        rankId: str(body['rankId']) || null,
        teamId,
        joinedAt: date(body['joinedAt']),
      },
      { permission: 'personnel.create' },
    );
  }

  @Patch(':id')
  @RequireAnyScope('personnel.edit')
  async update(
    @GuildId() guildId: string,
    @Param('id') id: string,
    @Access() access: RequestAccess,
    @Body() body: Body_,
    @CurrentUser() user: RequestUser,
  ) {
    await this.require(await this.actor(access), 'personnel.edit', await getRecord(guildId, id));
    return updateRecord(
      guildId,
      id,
      { rpName: str(body['rpName']), joinedAt: date(body['joinedAt']) },
      user.id,
      { permission: 'personnel.edit' },
    );
  }

  @Post(':id/rank')
  @RequireAnyScope('personnel.rank.edit')
  async rank(
    @GuildId() guildId: string,
    @Param('id') id: string,
    @Access() access: RequestAccess,
    @Body() body: Body_,
    @CurrentUser() user: RequestUser,
  ) {
    await this.require(
      await this.actor(access),
      'personnel.rank.edit',
      await getRecord(guildId, id),
    );
    const { record, roleChange } = await setRank(
      guildId,
      id,
      str(body['rankId']) || null,
      user.id,
      { permission: 'personnel.rank.edit', port: this.port() },
    );
    return {
      record,
      roleChange: roleChange ? { status: roleChange.status, message: roleChange.message } : null,
    };
  }

  @Post(':id/team')
  @RequireAnyScope('personnel.team.edit')
  async team(
    @GuildId() guildId: string,
    @Param('id') id: string,
    @Access() access: RequestAccess,
    @Body() body: Body_,
    @CurrentUser() user: RequestUser,
  ) {
    const actor = await this.actor(access);
    const current = await getRecord(guildId, id);
    const targetTeam = str(body['teamId']) || null;
    // Man braucht das Recht für das bisherige UND das neue Team (Teamleitung darf niemanden in fremde Teams schieben).
    await this.require(actor, 'personnel.team.edit', current);
    await this.require(actor, 'personnel.team.edit', {
      userId: current.userId,
      teamId: targetTeam,
    });
    const { record, roleChange } = await setTeam(guildId, id, targetTeam, user.id, {
      permission: 'personnel.team.edit',
      port: this.port(),
    });
    return {
      record,
      roleChange: roleChange ? { status: roleChange.status, message: roleChange.message } : null,
    };
  }

  @Post(':id/number')
  @RequireAnyScope('personnel.number.edit')
  async number(
    @GuildId() guildId: string,
    @Param('id') id: string,
    @Access() access: RequestAccess,
    @Body() body: Body_,
    @CurrentUser() user: RequestUser,
  ) {
    await this.require(
      await this.actor(access),
      'personnel.number.edit',
      await getRecord(guildId, id),
    );
    return setServiceNumber(guildId, id, str(body['number']) ?? 'auto', user.id, {
      permission: 'personnel.number.edit',
    });
  }

  @Post(':id/archive')
  @RequireAnyScope('personnel.archive')
  async archive(
    @GuildId() guildId: string,
    @Param('id') id: string,
    @Access() access: RequestAccess,
    @Body() body: Body_,
    @CurrentUser() user: RequestUser,
  ) {
    await this.require(await this.actor(access), 'personnel.archive', await getRecord(guildId, id));
    return archiveRecord(guildId, id, str(body['reason']), user.id, {
      permission: 'personnel.archive',
    });
  }

  @Post(':id/restore')
  @RequireAnyScope('personnel.archive')
  async restore(
    @GuildId() guildId: string,
    @Param('id') id: string,
    @Access() access: RequestAccess,
    @CurrentUser() user: RequestUser,
  ) {
    await this.require(await this.actor(access), 'personnel.archive', await getRecord(guildId, id));
    return restoreRecord(guildId, id, user.id, { permission: 'personnel.archive' });
  }

  @Post(':id/entries')
  @RequireAnyScope('personnel.award.manage', 'personnel.discipline.manage', 'personnel.note.create')
  async addEntry(
    @GuildId() guildId: string,
    @Param('id') id: string,
    @Access() access: RequestAccess,
    @Body() body: Body_,
    @CurrentUser() user: RequestUser,
  ) {
    const kind = str(body['kind']) ?? '';
    const key = ENTRY_PERMISSION[kind];
    if (!key)
      throw new PersonnelError(
        'invalid',
        'Unbekannte Eintragsart (erlaubt: Auszeichnung, Disziplin, Notiz).',
      );
    await this.require(await this.actor(access), key, await getRecord(guildId, id));
    return addEntry(
      guildId,
      id,
      {
        kind,
        title: str(body['title']) ?? '',
        body: str(body['body']),
        occurredAt: date(body['occurredAt']),
      },
      user.id,
      { permission: key },
    );
  }

  @Post('entries/:entryId/revoke')
  @RequireAnyScope('personnel.award.manage', 'personnel.discipline.manage', 'personnel.note.create')
  async revoke(
    @GuildId() guildId: string,
    @Param('entryId') entryId: string,
    @Access() access: RequestAccess,
    @Body() body: Body_,
    @CurrentUser() user: RequestUser,
  ) {
    const entry = await getEntry(guildId, entryId);
    const key = ENTRY_PERMISSION[entry.kind];
    if (!key)
      throw new PersonnelError(
        'invalid',
        'Dieser Eintrag gehört zu einem anderen Modul und lässt sich hier nicht widerrufen.',
      );
    await this.require(await this.actor(access), key, entry.record);
    return revokeEntry(guildId, entryId, str(body['reason']), user.id, { permission: key });
  }
}

/** Dienstgrade, Teams und Dienstnummern-Format. Lesen für alle mit Personal-Rechten, Ändern nur mit „Struktur verwalten“. */
@ApiTags('Personnel')
@ApiBearerAuth()
@UseFilters(PersonnelErrorFilter)
@Controller('guilds/:guildId/personnel-structure')
export class PersonnelStructureController {
  @Get('ranks')
  @RequireAnyScope(
    'personnel.view',
    'personnel.create',
    'personnel.rank.edit',
    'personnel.structure.manage',
  )
  ranks(@GuildId() guildId: string) {
    return listRanks(guildId);
  }

  @Post('ranks')
  @RequirePermissions('personnel.structure.manage')
  createRank(@GuildId() guildId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return saveRank(guildId, this.rankInput(body), user.id);
  }

  @Put('ranks/:id')
  @RequirePermissions('personnel.structure.manage')
  updateRank(
    @GuildId() guildId: string,
    @Param('id') id: string,
    @Body() body: Body_,
    @CurrentUser() user: RequestUser,
  ) {
    return saveRank(guildId, { ...this.rankInput(body), id }, user.id);
  }

  @Delete('ranks/:id')
  @RequirePermissions('personnel.structure.manage')
  async deleteRank(
    @GuildId() guildId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await deleteRank(guildId, id, user.id);
    return { ok: true };
  }

  @Get('teams')
  @RequireAnyScope(
    'personnel.view',
    'personnel.create',
    'personnel.team.edit',
    'personnel.structure.manage',
  )
  teams(@GuildId() guildId: string) {
    return listTeams(guildId);
  }

  @Post('teams')
  @RequirePermissions('personnel.structure.manage')
  createTeam(@GuildId() guildId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return saveTeam(guildId, this.teamInput(body), user.id);
  }

  @Put('teams/:id')
  @RequirePermissions('personnel.structure.manage')
  updateTeam(
    @GuildId() guildId: string,
    @Param('id') id: string,
    @Body() body: Body_,
    @CurrentUser() user: RequestUser,
  ) {
    return saveTeam(guildId, { ...this.teamInput(body), id }, user.id);
  }

  @Delete('teams/:id')
  @RequirePermissions('personnel.structure.manage')
  async deleteTeam(
    @GuildId() guildId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await deleteTeam(guildId, id, user.id);
    return { ok: true };
  }

  @Get('number-format')
  @RequireAnyScope('personnel.number.edit', 'personnel.structure.manage')
  numberFormat(@GuildId() guildId: string) {
    return getNumberFormat(guildId);
  }

  @Put('number-format')
  @RequirePermissions('personnel.structure.manage')
  setNumberFormat(
    @GuildId() guildId: string,
    @Body() body: Body_,
    @CurrentUser() user: RequestUser,
  ) {
    const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
    return setNumberFormat(
      guildId,
      { prefix: str(body['prefix']), digits: num(body['digits']), next: num(body['next']) },
      user.id,
    );
  }

  private rankInput(b: Body_) {
    return {
      name: str(b['name']) ?? '',
      shortName: str(b['shortName']),
      order: typeof b['order'] === 'number' ? b['order'] : Number.NaN,
      isEntry: b['isEntry'] === true,
      discordRoleId: str(b['discordRoleId']) || null,
      active: b['active'] !== false,
    };
  }

  private teamInput(b: Body_) {
    return {
      name: str(b['name']) ?? '',
      description: str(b['description']),
      discordRoleId: str(b['discordRoleId']) || null,
      leaderUserId: str(b['leaderUserId']) || null,
      active: b['active'] !== false,
    };
  }
}
