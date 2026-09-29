import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GuildId } from '../../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { PanelsService } from '../services/panels.service.js';
import { CreatePanelDto, UpdatePanelDto } from '../dto/panels.dto.js';

/**
 * PanelsController (§40/§41/§42) – Guild-scoped (§113).
 *
 * Verwaltet die Panel-Konfiguration. Das eigentliche Discord-Rendering
 * (Nachricht posten, Components) macht der Bot; dieser Controller setzt
 * nur die Datenbasis und die Application-Verlinkungen.
 */
@ApiTags('Panels')
@ApiBearerAuth()
@Controller('guilds/:guildId/panels')
export class PanelsController {
  constructor(private readonly panels: PanelsService) {}

  @Get()
  @RequirePermissions('applications.view')
  list(@GuildId() guildId: string) {
    return this.panels.list(guildId);
  }

  @Get(':panelId')
  @RequirePermissions('applications.view')
  getById(@GuildId() guildId: string, @Param('panelId') panelId: string) {
    return this.panels.getById(guildId, panelId);
  }

  @Post()
  @RequirePermissions('applications.panels.manage')
  create(@GuildId() guildId: string, @Body() dto: CreatePanelDto) {
    return this.panels.create(guildId, dto);
  }

  @Patch(':panelId')
  @RequirePermissions('applications.panels.manage')
  update(
    @GuildId() guildId: string,
    @Param('panelId') panelId: string,
    @Body() dto: UpdatePanelDto,
  ) {
    return this.panels.update(guildId, panelId, dto);
  }

  @Delete(':panelId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('applications.panels.manage')
  async remove(@GuildId() guildId: string, @Param('panelId') panelId: string): Promise<void> {
    await this.panels.delete(guildId, panelId);
  }
}
