import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { QuestionsService } from '../services/questions.service.js';

/** Fragen-Builder: anlegen, bearbeiten, löschen, verschieben, (de)aktivieren, Pflicht/optional. */
@ApiTags('Application Questions')
@ApiBearerAuth()
@Controller('guilds/:guildId/applications/:applicationId/questions')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get()
  @RequirePermissions('applications.view')
  list(@GuildId() guildId: string, @Param('applicationId') applicationId: string) {
    return this.questions.list(guildId, applicationId);
  }

  @Post()
  @RequirePermissions('applications.edit')
  create(
    @GuildId() guildId: string,
    @Param('applicationId') applicationId: string,
    @Body() body: { question?: unknown; position?: number },
    @CurrentUser() user: RequestUser,
  ) {
    const position = typeof body?.position === 'number' ? body.position : undefined;
    return this.questions.create(guildId, applicationId, user.id, body?.question, position);
  }

  @Put(':questionId')
  @RequirePermissions('applications.edit')
  update(
    @GuildId() guildId: string,
    @Param('applicationId') applicationId: string,
    @Param('questionId') questionId: string,
    @Body() body: unknown,
    @CurrentUser() user: RequestUser,
  ) {
    return this.questions.update(guildId, applicationId, user.id, questionId, body);
  }

  @Delete(':questionId')
  @RequirePermissions('applications.edit')
  remove(
    @GuildId() guildId: string,
    @Param('applicationId') applicationId: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.questions.remove(guildId, applicationId, user.id, questionId);
  }

  @Post(':questionId/move')
  @RequirePermissions('applications.edit')
  move(
    @GuildId() guildId: string,
    @Param('applicationId') applicationId: string,
    @Param('questionId') questionId: string,
    @Body() body: { toIndex?: number },
    @CurrentUser() user: RequestUser,
  ) {
    const toIndex = Number(body?.toIndex);
    return this.questions.move(
      guildId,
      applicationId,
      user.id,
      questionId,
      Number.isInteger(toIndex) ? toIndex : -1,
    );
  }
}
