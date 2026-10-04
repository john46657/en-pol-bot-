import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseFilters } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { parseDay } from '@nexus/absences';
import { restDiscordPort } from '@nexus/automation';
import { generate, getReport, listReports, publish, renderText, type ReportData } from '@nexus/reports';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { ReportErrorFilter } from './reports-error.filter.js';

type Body_ = Record<string, unknown>;

/** Berichte: ansehen (report.view), erzeugen/veröffentlichen (report.manage). */
@ApiTags('Reports')
@ApiBearerAuth()
@UseFilters(ReportErrorFilter)
@Controller('guilds/:guildId/reports')
export class ReportsController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  @RequirePermissions('report.view')
  list(@GuildId() guildId: string, @Query('kind') kind?: string) {
    return listReports(guildId, kind, 60);
  }

  @Get(':id')
  @RequirePermissions('report.view')
  async view(@GuildId() guildId: string, @Param('id') id: string) {
    const r = await getReport(guildId, id);
    return { report: r, text: renderText(r.data as unknown as ReportData) };
  }

  /** Bericht für einen Tag/eine Woche berechnen (überschreibt den gespeicherten für denselben Zeitraum). */
  @Post()
  @RequirePermissions('report.manage')
  create(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    const kind = b['kind'] === 'WEEK' ? 'WEEK' : 'DAY';
    let on = new Date();
    if (typeof b['date'] === 'string' && b['date']) {
      const d = parseDay(b['date']);
      if (!d) throw new BadRequestException('Ungültiges Datum.');
      on = new Date(d.getTime() + 12 * 3600_000);
    }
    return generate(guildId, kind, on, user.id);
  }

  @Post(':id/publish')
  @RequirePermissions('report.manage')
  publish(@GuildId() guildId: string, @Param('id') id: string) {
    return publish(guildId, id, restDiscordPort(this.config.get<string>('DISCORD_TOKEN') ?? ''));
  }
}
