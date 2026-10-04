import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseFilters } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { restDiscordPort } from '@nexus/automation';
import { activeAwards, award, checkEligibility, deleteQualification, getQualification, holders, listQualifications, revoke, saveQualification } from '@nexus/qualifications';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { QualificationErrorFilter } from './qualifications-error.filter.js';

type Body_ = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Qualifikationen: Definition mit Voraussetzungen, Prüfung, Vergabe/Entzug, Inhaber. */
@ApiTags('Qualifications')
@ApiBearerAuth()
@UseFilters(QualificationErrorFilter)
@Controller('guilds/:guildId/qualifications')
export class QualificationsController {
  constructor(private readonly config: ConfigService) {}
  private port() {
    return restDiscordPort(this.config.get<string>('DISCORD_TOKEN') ?? '');
  }

  @Get()
  @RequirePermissions('qualification.view')
  list(@GuildId() guildId: string) {
    return listQualifications(guildId);
  }

  /** Eigene Qualifikationen. */
  @Get('me')
  @RequirePermissions('own.training.view')
  mine(@GuildId() guildId: string, @CurrentUser() user: RequestUser) {
    return activeAwards(guildId, user.id);
  }

  @Get('member/:userId')
  @RequirePermissions('qualification.view')
  member(@GuildId() guildId: string, @Param('userId') userId: string) {
    return activeAwards(guildId, userId);
  }

  @Put()
  @RequirePermissions('qualification.manage')
  save(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return saveQualification(guildId, { id: str(b['id']), name: str(b['name']) ?? '', description: str(b['description']), active: typeof b['active'] === 'boolean' ? b['active'] : undefined, requirements: b['requirements'], grantRoleId: str(b['grantRoleId']), autoGrant: typeof b['autoGrant'] === 'boolean' ? b['autoGrant'] : undefined, validDays: typeof b['validDays'] === 'number' ? b['validDays'] : undefined }, user.id);
  }

  @Delete(':id')
  @RequirePermissions('qualification.manage')
  async remove(@GuildId() guildId: string, @Param('id') id: string, @CurrentUser() user: RequestUser) {
    await deleteQualification(guildId, id, user.id);
    return { ok: true };
  }

  @Get(':id/holders')
  @RequirePermissions('qualification.view')
  holders(@GuildId() guildId: string, @Param('id') id: string) {
    return holders(guildId, id);
  }

  /** Voraussetzungen für ein Mitglied prüfen (erklärt jede einzeln). */
  @Get(':id/check')
  @RequirePermissions('qualification.view')
  async check(@GuildId() guildId: string, @Param('id') id: string, @Query('userId') userId = '') {
    return checkEligibility(guildId, userId, await getQualification(guildId, id));
  }

  @Post(':id/award')
  @RequirePermissions('qualification.manage')
  award(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return award({ guildId, qualificationId: id, userId: str(b['userId']) ?? '', actorId: user.id, override: b['override'] === true, reason: str(b['reason']), port: this.port() });
  }

  @Post('awards/:awardId/revoke')
  @RequirePermissions('qualification.manage')
  revoke(@GuildId() guildId: string, @Param('awardId') awardId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return revoke(guildId, awardId, str(b['reason']), user.id, this.port());
  }
}
