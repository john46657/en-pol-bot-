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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GuildId } from '../../../common/decorators/guild-id.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { ApplicationsService } from '../services/applications.service.js';
import {
  CreateApplicationDto,
  ListApplicationsQueryDto,
  SetApplicationStatusDto,
  UpdateApplicationDto,
} from '../dto/applications.dto.js';

/**
 * ApplicationsController (§3/§97) – alle Routen Guild-scoped (§113).
 *
 * Permissions werden serverseitig über den PermissionGuard geprüft (§114);
 * @RequirePermissions ist nicht nur UI-Information.
 */
@ApiTags('Applications')
@ApiBearerAuth()
@Controller('guilds/:guildId/applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get()
  @RequirePermissions('applications.view')
  list(@GuildId() guildId: string, @Query() query: ListApplicationsQueryDto) {
    return this.applications.list(guildId, query);
  }

  @Get(':applicationId')
  @RequirePermissions('applications.view')
  getById(@GuildId() guildId: string, @Param('applicationId') applicationId: string) {
    return this.applications.getById(guildId, applicationId);
  }

  @Post()
  @RequirePermissions('applications.create')
  create(
    @GuildId() guildId: string,
    @Body() dto: CreateApplicationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.applications.create(guildId, dto, user.id);
  }

  @Patch(':applicationId')
  @RequirePermissions('applications.edit')
  update(
    @GuildId() guildId: string,
    @Param('applicationId') applicationId: string,
    @Body() dto: UpdateApplicationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.applications.update(guildId, applicationId, dto, user.id);
  }

  @Delete(':applicationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('applications.delete')
  async remove(
    @GuildId() guildId: string,
    @Param('applicationId') applicationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.applications.delete(guildId, applicationId, user.id);
  }

  /** Publish (§97): Validierungs-Checklist muss erfüllt sein, sonst Blockade. */
  @Post(':applicationId/publish')
  @RequirePermissions('applications.publish')
  publish(
    @GuildId() guildId: string,
    @Param('applicationId') applicationId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.applications.publish(guildId, applicationId, user.id);
  }

  @Patch(':applicationId/status')
  @RequirePermissions('applications.edit')
  setStatus(
    @GuildId() guildId: string,
    @Param('applicationId') applicationId: string,
    @Body() dto: SetApplicationStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.applications.setStatus(guildId, applicationId, dto.status, user.id);
  }

  /** Duplicate (§99): kopiert Konfiguration, niemals Submissions/Audit. */
  @Post(':applicationId/duplicate')
  @RequirePermissions('applications.create')
  duplicate(
    @GuildId() guildId: string,
    @Param('applicationId') applicationId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.applications.duplicate(guildId, applicationId, user.id);
  }
}
