import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { getWaitingRoom } from '@nexus/office';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';

/** Büro-Warteraum: Status der konfigurierten Auswahl (gewählt wird unter „Rollen & Kanäle wählen“). */
@ApiTags('Office')
@ApiBearerAuth()
@Controller('guilds/:guildId/office')
export class OfficeController {
  @Get()
  @RequirePermissions('office.view')
  waitingRoom(@GuildId() guildId: string) {
    return getWaitingRoom(guildId);
  }
}
