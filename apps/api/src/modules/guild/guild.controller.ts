import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { GuildService } from './guild.service.js';
import { DiscordService } from './discord.service.js';

/**
 * GuildController (§4/§8/§30/§35/§36) – Guild-Daten für das Dashboard.
 *
 * Channel/Rollen-Auswahlen liefert Discord (nie manuelle IDs tippen, §8),
 * die Verwaltbarkeit des Bots wird serverseitig geprüft (§30).
 */
@ApiTags('Guild')
@ApiBearerAuth()
@Controller('guilds/:guildId')
export class GuildController {
  constructor(
    private readonly guilds: GuildService,
    private readonly discord: DiscordService,
  ) {}

  /** Server-Overview + Configuration Health (§4/§36). */
  @Get()
  @RequirePermissions('applications.view')
  getOverview(@GuildId() guildId: string) {
    return this.guilds.getOverview(guildId);
  }

  /** Discord-Channel dieser Guild (§8: Auswahlen statt IDs tippen). */
  @Get('discord/channels')
  @RequirePermissions('applications.view')
  listChannels(@GuildId() guildId: string) {
    return this.discord.listChannels(guildId);
  }

  /** Discord-Rollen dieser Guild inkl. Verwaltbarkeits-Check (§30). */
  @Get('discord/roles')
  @RequirePermissions('applications.view')
  listRoles(@GuildId() guildId: string) {
    return this.discord.listRoles(guildId);
  }
}
