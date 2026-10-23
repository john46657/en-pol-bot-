import { targetGuild } from '../common/guild-context';
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { Throttle } from '@nestjs/throttler';
import { BotService, CurrentUser, RequirePermission, ServiceAuthorized } from '../authz/decorators';
import type { AuthUser } from '../common/request-context';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { SupportTicketsService, type ActionInput } from './tickets.service';
import { TicketConfigService } from './config.service';
import { categorySchema, departmentSchema, panelSchema, prioritySchema, questionSchema, reasonSchema, settingsSchema, statusSchema } from './config.schemas';

const snowflake = z.string().regex(/^\d{15,25}$/);
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('close'), reason: z.string().trim().max(500).optional() }), z.object({ action: z.literal('close_request') }),
  z.object({ action: z.literal('reopen') }), z.object({ action: z.literal('claim') }), z.object({ action: z.literal('unclaim'), targetId: snowflake.optional() }),
  z.object({ action: z.literal('add_access'), targetId: snowflake, kind: z.enum(['USER', 'ROLE']), minutes: z.number().int().min(1).max(60 * 24 * 30).optional() }),
  z.object({ action: z.literal('remove_access'), targetId: snowflake }),
  z.object({ action: z.literal('priority'), priorityId: z.string().uuid() }), z.object({ action: z.literal('status'), statusId: z.string().uuid() }),
  z.object({ action: z.literal('category'), categoryId: z.string().uuid() }), z.object({ action: z.literal('rename'), name: z.string().trim().min(1).max(90) }),
  z.object({ action: z.literal('move'), parentId: snowflake.nullable() }), z.object({ action: z.literal('transcript') }),
  z.object({ action: z.literal('lock') }), z.object({ action: z.literal('unlock') }), z.object({ action: z.literal('escalate') }),
  z.object({ action: z.literal('note'), text: z.string().trim().min(1).max(4000) }), z.object({ action: z.literal('rating') }), z.object({ action: z.literal('delete') }),
  z.object({ action: z.literal('reply'), text: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal('assign'), targetId: snowflake }), z.object({ action: z.literal('department'), departmentId: z.string().uuid() }),
  z.object({ action: z.literal('request_info'), text: z.string().trim().min(3).max(2000) }), z.object({ action: z.literal('archive') }),
  z.object({ action: z.literal('transcript_retry'), transcriptId: z.string().uuid() }),
]);
const listQ = z.object({
  kind: z.enum(['open', 'closed', 'archived', 'escalated', 'deleted', 'all']).optional(), statusId: z.string().uuid().optional(), priorityId: z.string().uuid().optional(), categoryId: z.string().uuid().optional(),
  queue: z.enum(['unassigned', 'in_progress', 'waiting', 'overdue']).optional(), departmentId: z.string().uuid().optional(), closedFrom: z.coerce.date().optional(), closedTo: z.coerce.date().optional(),
  claimer: z.union([snowflake, z.literal('me')]).optional(), creator: z.string().trim().max(100).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(),
  q: z.string().trim().max(100).optional(), guildId: snowflake.optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(25),
});
const transcriptQ = z.object({
  q: z.string().trim().max(100).optional(), categoryName: z.string().max(80).optional(), creator: z.string().max(100).optional(), staff: snowflake.optional(), status: z.string().max(60).optional(),
  number: z.coerce.number().int().positive().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(25),
});
const ratingQ = z.object({ stars: z.coerce.number().int().min(1).max(5).optional(), categoryId: z.string().uuid().optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(25) });
const openQ = z.object({ categoryId: z.string().uuid(), discordId: snowflake, discordName: z.string().trim().max(100).optional(), guildId: snowflake.optional() });
const actor = (u: AuthUser): Actor & { name: string } => ({ userId: u.id, robloxUserId: u.robloxUserId, name: u.displayName });
const auditQ = z.object({ ticketId: z.string().uuid().optional(), action: z.string().max(80).optional(), result: z.enum(['SUCCESS', 'DENIED', 'FAILED']).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50) });
const previewQ = z.object({ fields: z.array(questionSchema).max(25), values: z.record(z.string().max(40), z.union([z.string().max(4000), z.array(z.string().max(100)).max(25), z.boolean(), z.null()])).default({}) });
/** Private Inhalte: nie zwischenspeichern, nie indexieren, keinen Referrer weitergeben. */
const privateHeaders = (res: Response) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
};
/** Abruf von Transkripten begrenzen (automatisches Auslesen). */
const TRANSCRIPT_RATE = { default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 60, ttl: 60_000 } };

/** Support-Tickets im Dashboard (Pfad `support-tickets`, weil `tickets` die Strafzettel sind). */
@ApiTags('support-tickets')
@Controller('support-tickets')
export class SupportTicketsController {
  constructor(private readonly s: SupportTicketsService, private readonly cfg: TicketConfigService) {}

  // ---- Konfiguration ----
  @Get('config') @RequirePermission('ticket.view') config(@Query(zodBody(z.object({ guildId: snowflake.optional() }))) q: { guildId?: string }) { return this.cfg.all(q.guildId); }
  @Put('settings') @RequirePermission('ticket.settings') settings(@CurrentUser() u: AuthUser, @Body(zodBody(settingsSchema)) b: z.infer<typeof settingsSchema>) { return this.cfg.saveSettings(actor(u), b); }
  @Post('categories') @RequirePermission('ticket.settings') createCategory(@CurrentUser() u: AuthUser, @Body(zodBody(categorySchema)) b: z.infer<typeof categorySchema>) { return this.cfg.saveCategory(actor(u), null, b); }
  @Put('categories/:id') @RequirePermission('ticket.settings') updateCategory(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(categorySchema)) b: z.infer<typeof categorySchema>) { return this.cfg.saveCategory(actor(u), id, b); }
  @Post('categories/:id/duplicate') @RequirePermission('ticket.settings') dupCategory(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.cfg.duplicateCategory(actor(u), id); }
  @Delete('categories/:id') @HttpCode(204) @RequirePermission('ticket.settings') delCategory(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.cfg.deleteCategory(actor(u), id); }
  @Post('panels') @RequirePermission('ticket.settings') createPanel(@CurrentUser() u: AuthUser, @Body(zodBody(panelSchema)) b: z.infer<typeof panelSchema>) { return this.cfg.savePanel(actor(u), null, b); }
  @Put('panels/:id') @RequirePermission('ticket.settings') updatePanel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(panelSchema)) b: z.infer<typeof panelSchema>) { return this.cfg.savePanel(actor(u), id, b); }
  @Post('panels/:id/duplicate') @RequirePermission('ticket.settings') dupPanel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.cfg.duplicatePanel(actor(u), id); }
  @Delete('panels/:id') @HttpCode(204) @RequirePermission('ticket.settings') delPanel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.cfg.deletePanel(actor(u), id); }
  @Get('panels/:id/preview') @RequirePermission('ticket.view') preview(@Param('id', ParseUUIDPipe) id: string) { return this.s.panelMessage(id); }
  @Post('panels/:id/publish') @HttpCode(200) @RequirePermission('ticket.settings')
  async publish(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ channelId: snowflake.optional() }))) b: { channelId?: string }) { return this.s.publishPanel(await this.s.actorFromUser(u), id, b.channelId); }
  @Post('statuses') @RequirePermission('ticket.settings') createStatus(@CurrentUser() u: AuthUser, @Body(zodBody(statusSchema)) b: z.infer<typeof statusSchema>) { return this.cfg.saveStatus(actor(u), null, b); }
  @Put('statuses/:id') @RequirePermission('ticket.settings') updateStatus(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(statusSchema)) b: z.infer<typeof statusSchema>) { return this.cfg.saveStatus(actor(u), id, b); }
  @Delete('statuses/:id') @HttpCode(204) @RequirePermission('ticket.settings') delStatus(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.cfg.deleteStatus(actor(u), id); }
  @Post('priorities') @RequirePermission('ticket.settings') createPriority(@CurrentUser() u: AuthUser, @Body(zodBody(prioritySchema)) b: z.infer<typeof prioritySchema>) { return this.cfg.savePriority(actor(u), null, b); }
  @Put('priorities/:id') @RequirePermission('ticket.settings') updatePriority(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(prioritySchema)) b: z.infer<typeof prioritySchema>) { return this.cfg.savePriority(actor(u), id, b); }
  @Delete('priorities/:id') @HttpCode(204) @RequirePermission('ticket.settings') delPriority(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.cfg.deletePriority(actor(u), id); }
  @Post('reasons') @RequirePermission('ticket.settings') createReason(@CurrentUser() u: AuthUser, @Body(zodBody(reasonSchema)) b: z.infer<typeof reasonSchema>) { return this.cfg.saveReason(actor(u), null, b); }
  @Put('reasons/:id') @RequirePermission('ticket.settings') updateReason(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(reasonSchema)) b: z.infer<typeof reasonSchema>) { return this.cfg.saveReason(actor(u), id, b); }
  @Delete('reasons/:id') @HttpCode(204) @RequirePermission('ticket.settings') delReason(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.cfg.deleteReason(actor(u), id); }
  // ---- Abteilungen, Formulare, Archiv ----
  @Post('departments') @RequirePermission('ticket.departments') createDepartment(@CurrentUser() u: AuthUser, @Body(zodBody(departmentSchema)) b: z.infer<typeof departmentSchema>) { return this.cfg.saveDepartment(actor(u), null, b); }
  @Put('departments/:id') @RequirePermission('ticket.departments') updateDepartment(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(departmentSchema)) b: z.infer<typeof departmentSchema>) { return this.cfg.saveDepartment(actor(u), id, b); }
  @Delete('departments/:id') @HttpCode(204) @RequirePermission('ticket.departments') delDepartment(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.cfg.deleteDepartment(actor(u), id); }
  @Post('categories/:id/archive') @HttpCode(200) @RequirePermission('ticket.settings') archiveCategory(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ archived: z.boolean() }))) b: { archived: boolean }) { return this.cfg.archiveCategory(actor(u), id, b.archived); }
  @Get('categories/:id/form-versions') @RequirePermission('ticket.settings') formVersions(@Param('id', ParseUUIDPipe) id: string) { return this.cfg.formVersions(id); }
  /** Formular testen: serverseitige Prüfung wie beim Einreichen, es entsteht KEIN Ticket. */
  @Post('forms/preview') @HttpCode(200) @RequirePermission('ticket.settings') previewForm(@Body(zodBody(previewQ)) b: z.infer<typeof previewQ>) { return this.s.previewForm(b.fields, b.values); }

  // ---- Tickets ----
  @Get() @RequirePermission('ticket.view') list(@CurrentUser() u: AuthUser, @Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.s.list(u.id, { ...q, guildId: targetGuild(q.guildId) ?? undefined, kind: q.kind === 'all' ? undefined : q.kind }); }
  @Post() @RequirePermission('ticket.create') async create(@CurrentUser() u: AuthUser, @Body(zodBody(openQ)) b: z.infer<typeof openQ>) { return this.s.openFromDashboard(await this.s.actorFromUser(u), b); }
  @Get('stats') @RequirePermission('ticket.view') stats(@CurrentUser() u: AuthUser) { return this.s.stats(u.id); }
  @Get('overview') @RequirePermission('ticket.view') overview(@CurrentUser() u: AuthUser, @Query(zodBody(z.object({ guildId: snowflake.optional() }))) q: { guildId?: string }) { return this.s.overview(u.id, targetGuild(q.guildId) ?? undefined); }
  @Get('audit') @RequirePermission('ticket.audit') auditLog(@Query(zodBody(auditQ)) q: z.infer<typeof auditQ>) { return this.s.auditLog(q); }
  /** Transkript-Seite /transcript/EMD-000123: Versionen (Mitarbeiter mit Zugriff oder der Ersteller selbst – Prüfung im Service). */
  @Get('transcripts/ref/:ref') @ServiceAuthorized() @Throttle(TRANSCRIPT_RATE)
  async byRef(@CurrentUser() u: AuthUser, @Param('ref') ref: string, @Res({ passthrough: true }) res: Response) { privateHeaders(res); return this.s.transcriptsByRef(u.id, ref.slice(0, 20)); }
  @Get('ratings') @RequirePermission('ticket.view') ratings(@CurrentUser() u: AuthUser, @Query(zodBody(ratingQ)) q: z.infer<typeof ratingQ>) { return this.s.ratings(u.id, q); }
  @Get('transcripts') @RequirePermission('ticket.transcript') transcripts(@CurrentUser() u: AuthUser, @Query(zodBody(transcriptQ)) q: z.infer<typeof transcriptQ>) { return this.s.transcripts(u.id, q); }
  /** Transkript abrufen: HTML (Ansicht/Download), TXT oder JSON. Zugriff wird bei jedem Abruf im Service geprüft und protokolliert. */
  @Get('transcripts/:id') @ServiceAuthorized() @Throttle(TRANSCRIPT_RATE)
  async transcript(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('download') download: string | undefined, @Query('format') format: string | undefined, @Res() res: Response) {
    const fmt = format === 'txt' || format === 'json' ? format : 'html';
    const tr = await this.s.transcript(u.id, id, fmt === 'json' ? 'json' : download || fmt === 'txt' ? 'export' : 'view');
    privateHeaders(res);
    const name = `transkript-${tr.ticketNumber}-v${tr.version}`;
    if (fmt === 'txt') { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${name}.txt"`); res.send(tr.text); return; }
    if (fmt === 'json') { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${name}.json"`); res.send(JSON.stringify(tr.data ?? {}, null, 2)); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Transkript-HTML in einer Sandbox anzeigen: keine Skripte, kein Zugriff auf das Dashboard
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${name}.html"`);
    res.send(tr.html);
  }
  @Delete('transcripts/:id') @RequirePermission('ticket.transcript_delete') async delTranscript(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.deleteTranscript(await this.s.actorFromUser(u), id); }
  @Get('attachments/:key') @RequirePermission('ticket.view')
  async attachment(@CurrentUser() u: AuthUser, @Param('key') key: string, @Res() res: Response) {
    const a = await this.s.attachment(u.id, key);
    res.setHeader('Content-Type', a.contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `${a.inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(a.name)}"`);
    res.send(a.data);
  }
  @Get(':id') @RequirePermission('ticket.view') detail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.detail(u.id, id); }
  @Get(':id/options') @RequirePermission('ticket.view') async options(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.options(await this.s.actorFromUser(u), id); }
  /** Alle Ticket-Aktionen (Web und Discord-Buttons); jede Aktion prüft ihr eigenes Recht. */
  @Post(':id/actions') @HttpCode(200) @RequirePermission('ticket.view')
  async action(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(actionSchema)) b: z.infer<typeof actionSchema>) { return this.s.action(id, await this.s.actorFromUser(u), b as ActionInput); }
}

const botOpen = z.object({ categoryId: z.string().uuid(), panelId: z.string().uuid().optional(), guildId: snowflake, discordId: snowflake, discordName: z.string().trim().min(1).max(100), memberRoleIds: z.array(snowflake).max(250).default([]), interactionId: snowflake.optional() });
const formFile = z.object({ name: z.string().max(200), url: z.string().url().max(1000).regex(/^https:\/\/(cdn|media)\.discordapp\.(com|net)\//, 'Nur Discord-Anhänge'), size: z.number().int().min(0), contentType: z.string().max(100).nullable().optional() });
const formSubmit = z.object({
  discordId: snowflake, step: z.number().int().min(0).max(24),
  values: z.record(z.string().max(40), z.union([z.string().max(4000), z.array(z.string().max(100)).max(25), z.boolean(), z.null()])).default({}),
  files: z.record(z.string().max(40), z.array(formFile).max(10)).default({}),
});
const botMessage = z.object({
  channelId: snowflake, discordMessageId: snowflake, authorId: snowflake, authorName: z.string().max(100), authorAvatar: z.string().url().max(500).nullable().optional(), isBot: z.boolean(),
  content: z.string().max(8000), attachments: z.array(z.object({ name: z.string().max(200), url: z.string().url().max(1000), size: z.number().int().min(0), contentType: z.string().max(100).nullable().optional() })).max(10).default([]),
  embeds: z.array(z.object({ title: z.string().max(256).optional(), description: z.string().max(4096).optional() })).max(10).default([]),
});

/** Dienst-Endpunkte für den Bot (Ersteller ohne Konto, Channel-Meldungen, Panels, Transcripts). */
@ApiTags('bot')
@Controller('bot/support-tickets')
export class BotSupportTicketsController {
  constructor(private readonly s: SupportTicketsService) {}
  @BotService() @Post('open') open(@Body(zodBody(botOpen)) b: z.infer<typeof botOpen>) {
    const { interactionId, ...d } = b;
    return this.s.open({ ...d, ...(interactionId ? { openKey: `ia:${interactionId}` } : {}) }, { userId: null, discordId: b.discordId, name: b.discordName, viaBot: true });
  }
  @BotService() @Post('form/start') @HttpCode(200) formStart(@Body(zodBody(botOpen)) b: z.infer<typeof botOpen>) { const { interactionId: _i, ...d } = b; void _i; return this.s.formStart(d); }
  @BotService() @Get('form/:id/modal') formModal(@Param('id', ParseUUIDPipe) id: string, @Query(zodBody(z.object({ discordId: snowflake, step: z.coerce.number().int().min(0).max(24) }))) q: { discordId: string; step: number }) { return this.s.formModalFor(id, q.discordId, q.step); }
  @BotService() @Post('form/:id/submit') @HttpCode(200) formSubmitStep(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(formSubmit)) b: z.infer<typeof formSubmit>) { return this.s.formSubmit(id, b.discordId, b.step, b.values, b.files); }
  @BotService() @Post('panels/:id/failed') @HttpCode(200) panelFailed(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ error: z.string().max(500) }))) b: { error: string }) { return this.s.panelFailed(id, b.error); }
  @BotService() @Post(':id/channel') @HttpCode(200) attach(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ channelId: snowflake, controlMessageId: snowflake.nullable() }))) b: { channelId: string; controlMessageId: string | null }) { return this.s.attachChannel(id, b.channelId, b.controlMessageId); }
  @BotService() @Post(':id/abort') @HttpCode(200) abort(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ reason: z.string().max(300).default('') }))) b: { reason: string }) { return this.s.abort(id, b.reason); }
  @BotService() @Post(':id/answer') @HttpCode(200) answer(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ discordId: snowflake, questionId: z.string().max(40), values: z.array(z.string().max(2000)).max(25).nullable() }))) b: { discordId: string; questionId: string; values: string[] | null }) { return this.s.answer(id, b.discordId, b.questionId, b.values); }
  @BotService() @Post(':id/close-request') @HttpCode(200) closeRequest(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ discordId: snowflake, accept: z.boolean() }))) b: { discordId: string; accept: boolean }) { return this.s.closeRequestAnswer(id, b.discordId, b.accept); }
  @BotService() @Post(':id/creator-add') @HttpCode(200) creatorAdd(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ discordId: snowflake, targetId: snowflake }))) b: { discordId: string; targetId: string }) { return this.s.creatorAdd(id, b.discordId, b.targetId); }
  @BotService() @Post(':id/creator-close') @HttpCode(200) creatorClose(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ discordId: snowflake, reason: z.string().trim().max(500).optional() }))) b: { discordId: string; reason?: string }) { return this.s.creatorClose(id, b.discordId, b.reason); }
  @BotService() @Post(':id/rating') @HttpCode(200) rate(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ discordId: snowflake, stars: z.number().int().min(1).max(5) }))) b: { discordId: string; stars: number }) { return this.s.rate(id, b.discordId, b.stars); }
  @BotService() @Post(':id/rating-comment') @HttpCode(200) rateComment(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ discordId: snowflake, comment: z.string().trim().min(1).max(1000) }))) b: { discordId: string; comment: string }) { return this.s.rateComment(id, b.discordId, b.comment); }
  @BotService() @Post('messages') @HttpCode(200) message(@Body(zodBody(botMessage)) b: z.infer<typeof botMessage>) { return this.s.message(b); }
  @BotService() @Get('channels') channels() { return this.s.channels(); }
  @BotService() @Get('categories') categories(@Query(zodBody(z.object({ guildId: snowflake.optional() }))) q: { guildId?: string }) { return this.s.openableCategories(q.guildId); }
  @BotService() @Get(':id/close-options') closeOptions(@Param('id', ParseUUIDPipe) id: string) { return this.s.closeOptions(id); }
  @BotService() @Post('panels/:id/posted') @HttpCode(200) posted(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ channelId: snowflake, messageId: snowflake }))) b: { channelId: string; messageId: string }) { return this.s.panelPosted(id, b.channelId, b.messageId); }
  @BotService() @Get('transcripts/:id') async transcript(@Param('id', ParseUUIDPipe) id: string) { const t = await this.s.transcript(null, id); return { html: t.html }; }
}
