import { Body, Controller, Get, Param, Post, Put, Query, UseFilters } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { restDiscordPort } from '@nexus/automation';
import { permissions } from '@nexus/permissions';
import { approve, checkFor, eligibleCandidates, getRequest, historyOf, listRequests, listRules, reject, requestPromotion, saveRule, withdraw } from '@nexus/promotions';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { Access, type RequestAccess } from '../../common/decorators/scope.decorator.js';
import { PromotionErrorFilter } from './promotions-error.filter.js';

type Body_ = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Beförderungen: Regeln, Anträge, Genehmigung/Ablehnung, Kandidaten, Historie. */
@ApiTags('Promotions')
@ApiBearerAuth()
@UseFilters(PromotionErrorFilter)
@Controller('guilds/:guildId/promotions')
export class PromotionsController {
  constructor(private readonly config: ConfigService) {}

  private async manage(access: RequestAccess) {
    return access.bypass || (await permissions.can(access, 'promotions.manage'));
  }

  @Get()
  @RequirePermissions('promotions.view')
  list(@GuildId() guildId: string, @Query() q: Record<string, string | undefined>) {
    return listRequests({ guildId, status: q['status'], userId: q['userId'] || undefined, cursor: q['cursor'] || undefined, limit: Number(q['limit']) || 50 });
  }

  @Get('rules')
  @RequirePermissions('promotions.view')
  rules(@GuildId() guildId: string) {
    return listRules(guildId);
  }

  @Put('rules/:rankId')
  @RequirePermissions('promotions.manage')
  saveRule(@GuildId() guildId: string, @Param('rankId') rankId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return saveRule(guildId, rankId, b['requirements'], user.id);
  }

  @Get('candidates')
  @RequirePermissions('promotions.view')
  candidates(@GuildId() guildId: string) {
    return eligibleCandidates(guildId);
  }

  @Get('check')
  @RequirePermissions('promotions.view')
  check(@GuildId() guildId: string, @Query('userId') userId = '', @Query('rankId') rankId = '') {
    return checkFor(guildId, userId, rankId);
  }

  @Get('history/:userId')
  @RequirePermissions('promotions.view')
  history(@GuildId() guildId: string, @Param('userId') userId: string) {
    return historyOf(guildId, userId);
  }

  @Get(':id')
  @RequirePermissions('promotions.view')
  view(@GuildId() guildId: string, @Param('id') id: string) {
    return getRequest(guildId, id);
  }

  @Post()
  @RequirePermissions('promotions.create')
  create(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return requestPromotion({ guildId, userId: str(b['userId']) ?? '', toRankId: str(b['toRankId']) ?? '', requestedBy: user.id, reason: str(b['reason']), override: b['override'] === true });
  }

  @Post(':id/approve')
  @RequirePermissions('promotions.approve')
  async approve(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @Access() access: RequestAccess, @CurrentUser() user: RequestUser) {
    return approve({ guildId, requestId: id, actorId: user.id, manage: await this.manage(access), reason: str(b['reason']), port: restDiscordPort(this.config.get<string>('DISCORD_TOKEN') ?? '') });
  }

  @Post(':id/reject')
  @RequirePermissions('promotions.reject')
  reject(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return reject({ guildId, requestId: id, actorId: user.id, reason: str(b['reason']) });
  }

  @Post(':id/withdraw')
  @RequirePermissions('promotions.create')
  async withdraw(@GuildId() guildId: string, @Param('id') id: string, @Access() access: RequestAccess, @CurrentUser() user: RequestUser) {
    return withdraw(guildId, id, user.id, await this.manage(access));
  }
}
