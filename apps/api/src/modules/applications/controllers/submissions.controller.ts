import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GuildId } from '../../../common/decorators/guild-id.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { SubmissionsService } from '../services/submissions.service.js';
import {
  AcceptSubmissionDto,
  ContactApplicantDto,
  CreateNoteDto,
  DenySubmissionDto,
  ListSubmissionsQueryDto,
} from '../dto/applications.dto.js';

/**
 * SubmissionsController (§25/§62) – Guild-scoped (§113), Cursor-Pagination
 * (§107). Entscheidungen (Accept/Deny) sind nur über Reviewer erlaubt (§30).
 */
@ApiTags('Submissions')
@ApiBearerAuth()
@Controller('guilds/:guildId/submissions')
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Get()
  @RequirePermissions('applications.submissions.view')
  list(@GuildId() guildId: string, @Query() query: ListSubmissionsQueryDto) {
    return this.submissions.list(guildId, query);
  }

  /** Annahme-Schritte (mit Verfügbarkeit) und Standard-Ablehnungsgründe. */
  @Get('options/review')
  @RequirePermissions('applications.submissions.view')
  reviewOptions() {
    return this.submissions.reviewOptions();
  }

  @Get(':submissionId')
  @RequirePermissions('applications.submissions.view')
  getById(@GuildId() guildId: string, @Param('submissionId') submissionId: string) {
    return this.submissions.getById(guildId, submissionId);
  }

  /** Accept (§30) – inkl. public/internal Reason für Transparenz. */
  @Post(':submissionId/accept')
  @RequirePermissions('applications.submissions.accept')
  accept(
    @GuildId() guildId: string,
    @Param('submissionId') submissionId: string,
    @Body() dto: AcceptSubmissionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.submissions.accept(guildId, submissionId, user.id, dto);
  }

  @Post(':submissionId/deny')
  @RequirePermissions('applications.submissions.deny')
  deny(
    @GuildId() guildId: string,
    @Param('submissionId') submissionId: string,
    @Body() dto: DenySubmissionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.submissions.deny(guildId, submissionId, user.id, dto);
  }

  /** Interne Notiz (§35): nur für Staff, Änderungen werden protokolliert. */
  @Post(':submissionId/notes')
  @RequirePermissions('applications.notes.create')
  createNote(
    @GuildId() guildId: string,
    @Param('submissionId') submissionId: string,
    @Body() dto: CreateNoteDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.submissions.createNote(guildId, submissionId, user.id, dto);
  }

  /** Audit-Historie einer Submission (§34/§89). */
  @Get(':submissionId/history')
  @RequirePermissions('applications.submissions.view')
  history(@GuildId() guildId: string, @Param('submissionId') submissionId: string) {
    return this.submissions.history(guildId, submissionId);
  }

  /** In Prüfung nehmen (Ansehen). */
  @Post(':submissionId/review/start')
  @RequirePermissions('applications.submissions.review')
  startReview(
    @GuildId() guildId: string,
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.submissions.startReview(guildId, submissionId, user.id);
  }

  /** Rückfrage an den Bewerber (per DM). */
  @Post(':submissionId/clarify')
  @RequirePermissions('applications.submissions.review')
  clarify(
    @GuildId() guildId: string,
    @Param('submissionId') submissionId: string,
    @Body() dto: ContactApplicantDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.submissions.clarify(guildId, submissionId, user.id, dto.text);
  }

  /** Gesprächseinladung an den Bewerber (per DM). */
  @Post(':submissionId/interview')
  @RequirePermissions('applications.submissions.review')
  interview(
    @GuildId() guildId: string,
    @Param('submissionId') submissionId: string,
    @Body() dto: ContactApplicantDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.submissions.interview(guildId, submissionId, user.id, dto.text);
  }
}
