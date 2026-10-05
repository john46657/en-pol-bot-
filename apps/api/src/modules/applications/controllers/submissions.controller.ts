import { BadRequestException, Body, ForbiddenException, Controller, Get, Param, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GuildId } from '../../../common/decorators/guild-id.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { RequireDashboardAccess } from '../../../common/decorators/guild-admin.decorator.js';
import { Access, type RequestAccess } from '../../../common/decorators/scope.decorator.js';
import { permissions } from '@nexus/permissions';
import type { Permission } from '@nexus/types';
import { SubmissionsService } from '../services/submissions.service.js';
import { RatingsService } from '../services/ratings.service.js';
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
  constructor(
    private readonly submissions: SubmissionsService,
    private readonly ratings: RatingsService,
  ) {}

  private async need(access: RequestAccess, key: Permission): Promise<void> {
    if (!(access.bypass || (await permissions.can(access, key)))) throw new ForbiddenException('Dafür fehlt dir die Berechtigung.');
  }

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

  /** Export als CSV oder JSON (`?format=csv|json&applicationId&status&from&to`) – nur mit „Einreichungen exportieren“. */
  @Get('export')
  @RequirePermissions('applications.submissions.export')
  async export(
    @GuildId() guildId: string,
    @Query() q: Record<string, string | undefined>,
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.submissions.export(guildId, user.id, q);
    res.setHeader('Content-Type', r.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${r.filename}"`);
    return new StreamableFile(Buffer.from(r.body, 'utf8'));
  }

  /** Bisherige Bewerbungen eines Discord-Benutzers (Bewerbungshistorie). */
  @Get('by-user/:userId')
  @RequirePermissions('applications.submissions.view')
  byUser(@GuildId() guildId: string, @Param('userId') userId: string) {
    if (!/^\d{5,25}$/.test(userId)) throw new BadRequestException('Ungültige Discord-ID.');
    return this.submissions.byUser(guildId, userId);
  }

  @Get(':submissionId')
  @RequirePermissions('applications.submissions.view')
  getById(@GuildId() guildId: string, @Param('submissionId') submissionId: string) {
    return this.submissions.getById(guildId, submissionId);
  }

  /** Interne Bewertung (nur Team): alle Einzelbewertungen, Mittelwerte; der Bewerber sieht sie nie. */
  @Get(':submissionId/ratings')
  @RequirePermissions('applications.ratings.view')
  getRatings(@GuildId() guildId: string, @Param('submissionId') submissionId: string, @CurrentUser() user: RequestUser) {
    return this.ratings.get(guildId, submissionId, user.id);
  }

  /** Eigene Bewertung setzen (`{ "<feld>": 1…max | null }`). */
  @Put(':submissionId/ratings')
  @RequirePermissions('applications.ratings.edit')
  setRatings(@GuildId() guildId: string, @Param('submissionId') submissionId: string, @Body() body: { values?: unknown }, @CurrentUser() user: RequestUser) {
    return this.ratings.setMine(guildId, submissionId, user.id, body?.values);
  }

  /** Accept (§30) – inkl. public/internal Reason für Transparenz. */
  @Post(':submissionId/accept')
  @RequireDashboardAccess()
  async accept(
    @GuildId() guildId: string,
    @Param('submissionId') submissionId: string,
    @Body() dto: AcceptSubmissionDto,
    @CurrentUser() user: RequestUser,
    @Access() access: RequestAccess,
  ) {
    // Annehmen ohne eigenen Grund braucht „annehmen“, mit Grund „mit Grund annehmen“ (jenes folgt aus diesem, nicht umgekehrt)
    await this.need(access, [dto.note, dto.publicReason, dto.internalReason].some((t) => t?.trim()) ? 'applications.submissions.accept_reason' : 'applications.submissions.accept');
    return this.submissions.accept(guildId, submissionId, user.id, dto, await this.canReassign(access));
  }

  @Post(':submissionId/deny')
  @RequireDashboardAccess()
  async deny(
    @GuildId() guildId: string,
    @Param('submissionId') submissionId: string,
    @Body() dto: DenySubmissionDto,
    @CurrentUser() user: RequestUser,
    @Access() access: RequestAccess,
  ) {
    // Ablehnen mit einem der vorgegebenen Gründe braucht „ablehnen“, mit eigenem Text „mit Grund ablehnen“
    await this.need(access, [dto.note, dto.publicReason, dto.internalReason].some((t) => t?.trim()) ? 'applications.submissions.deny_reason' : 'applications.submissions.deny');
    return this.submissions.deny(guildId, submissionId, user.id, dto, await this.canReassign(access));
  }

  /** Bewerbung übernehmen; wer sie schon bearbeitet, wird angezeigt, Führungskräfte dürfen übernehmen. */
  @Post(':submissionId/claim')
  @RequirePermissions('applications.submissions.review')
  async claim(@GuildId() guildId: string, @Param('submissionId') submissionId: string, @CurrentUser() user: RequestUser, @Access() access: RequestAccess) {
    return this.submissions.assign(guildId, submissionId, user.id, user.id, await this.canReassign(access));
  }

  @Post(':submissionId/release')
  @RequirePermissions('applications.submissions.review')
  async release(@GuildId() guildId: string, @Param('submissionId') submissionId: string, @CurrentUser() user: RequestUser, @Access() access: RequestAccess) {
    return this.submissions.assign(guildId, submissionId, user.id, null, await this.canReassign(access));
  }

  /** Zuständigkeit ändern: einer anderen Person zuweisen (nur mit „Zuständigkeit ändern“). */
  @Post(':submissionId/assign')
  @RequirePermissions('applications.submissions.reassign')
  async assign(@GuildId() guildId: string, @Param('submissionId') submissionId: string, @Body() body: { assigneeId?: unknown }, @CurrentUser() user: RequestUser) {
    if (typeof body.assigneeId !== 'string') throw new BadRequestException('Bitte die Discord-ID des Bearbeiters angeben.');
    return this.submissions.assign(guildId, submissionId, user.id, body.assigneeId, true);
  }

  /** Bewerbung durch das Team zurücknehmen (WITHDRAWN) – Grund Pflicht. */
  /** Zurückstellen / fortsetzen (`{ hold: true|false, reason? }`). */
  @Post(':submissionId/hold')
  @RequirePermissions('applications.submissions.hold')
  async hold(@GuildId() guildId: string, @Param('submissionId') submissionId: string, @Body() body: { hold?: unknown; reason?: unknown }, @CurrentUser() user: RequestUser, @Access() access: RequestAccess) {
    if (typeof body?.hold !== 'boolean') throw new BadRequestException('Angabe „hold“ (true/false) fehlt.');
    return this.submissions.hold(guildId, submissionId, user.id, body.hold, typeof body.reason === 'string' ? body.reason : undefined, await this.canReassign(access));
  }

  @Post(':submissionId/withdraw')
  @RequirePermissions('applications.submissions.withdraw')
  withdraw(@GuildId() guildId: string, @Param('submissionId') submissionId: string, @Body() body: { reason?: unknown }, @CurrentUser() user: RequestUser) {
    return this.submissions.withdraw(guildId, submissionId, user.id, typeof body.reason === 'string' ? body.reason : undefined);
  }

  private canReassign(access: RequestAccess): Promise<boolean> {
    return access.bypass ? Promise.resolve(true) : permissions.can(access, 'applications.submissions.reassign');
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
