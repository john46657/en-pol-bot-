import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GuildId } from '../../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { ApplicationAnalyticsService } from '../services/analytics.service.js';

/**
 * AnalyticsController (§45) – Guild-scoped (§113).
 *
 * Nur aggregierte Daten; sensible Antworten erscheinen hier nicht (§120).
 */
@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('guilds/:guildId/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: ApplicationAnalyticsService) {}

  /** Überblick: Counts, Raten – optional auf eine einzelne Application. */
  @Get('overview')
  @RequirePermissions('applications.analytics.view')
  overview(@GuildId() guildId: string, @Query('applicationId') applicationId?: string) {
    return this.analytics.overview(guildId, applicationId);
  }

  /** Zeitreihe pro Tag einer Application (§45). */
  @Get('applications/:applicationId/daily')
  @RequirePermissions('applications.analytics.view')
  daily(
    @GuildId() guildId: string,
    @Param('applicationId') applicationId: string,
    @Query('days') days?: number,
  ) {
    return this.analytics.daily(guildId, applicationId, days);
  }
}
