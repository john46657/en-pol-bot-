import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PanelsService } from './panels.service.js';

/** Universelle Panels (Embed + Buttons + Select). Pfad `message-panels`, weil `panels` die Bewerbungs-Panels belegt. */
@ApiTags('Panels')
@ApiBearerAuth()
@Controller('guilds/:guildId/message-panels')
export class MessagePanelsController {
  constructor(private readonly panels: PanelsService) {}

  @Get()
  @RequirePermissions('panels.view')
  list(@GuildId() guildId: string) {
    return this.panels.list(guildId);
  }

  @Get(':id')
  @RequirePermissions('panels.view')
  get(@GuildId() guildId: string, @Param('id') id: string) {
    return this.panels.get(guildId, id);
  }

  @Post()
  @RequirePermissions('panels.manage')
  create(
    @GuildId() guildId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.panels.create(guildId, user?.id ?? 'unknown', body);
  }

  @Put(':id')
  @RequirePermissions('panels.manage')
  update(
    @GuildId() guildId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.panels.update(guildId, user?.id ?? 'unknown', id, body);
  }

  @Post(':id/send')
  @RequirePermissions('panels.manage')
  send(
    @GuildId() guildId: string,
    @Param('id') id: string,
    @Body() body: { channelId?: unknown },
    @CurrentUser() user?: RequestUser,
  ) {
    return this.panels.send(guildId, user?.id ?? 'unknown', id, body?.channelId);
  }

  @Delete(':id')
  @RequirePermissions('panels.manage')
  remove(
    @GuildId() guildId: string,
    @Param('id') id: string,
    @Query('deleteMessage') deleteMessage: string | undefined,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.panels.remove(guildId, user?.id ?? 'unknown', id, deleteMessage === 'true');
  }
}
