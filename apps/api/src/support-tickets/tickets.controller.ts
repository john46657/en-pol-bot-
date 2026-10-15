import { currentGuild } from '../common/guild-context';
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { BotService, CurrentUser, RequirePermission } from '../authz/decorators';
import type { AuthUser } from '../common/request-context';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { SupportTicketsService, type ActionInput } from './tickets.service';
import { TicketConfigService } from './config.service';
import { categorySchema, panelSchema, prioritySchema, reasonSchema, settingsSchema, statusSchema } from './config.schemas';

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
]);
const listQ = z.object({
  kind: z.enum(['open', 'closed', 'archived', 'escalated', 'deleted', 'all']).optional(), statusId: z.string().uuid().optional(), priorityId: z.string().uuid().optional(), categoryId: z.string().uuid().optional(),
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
const actor = (u: AuthUser): Actor => ({ userId: u.id, robloxUserId: u.robloxUserId });

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

  // ---- Tickets ----
  @Get() @RequirePermission('ticket.view') list(@CurrentUser() u: AuthUser, @Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.s.list(u.id, { ...q, guildId: q.guildId ?? currentGuild() ?? undefined, kind: q.kind === 'all' ? undefined : q.kind }); }
  @Post() @RequirePermission('ticket.create') async create(@CurrentUser() u: AuthUser, @Body(zodBody(openQ)) b: z.infer<typeof openQ>) { return this.s.openFromDashboard(await this.s.actorFromUser(u), b); }
  @Get('stats') @RequirePermission('ticket.view') stats(@CurrentUser() u: AuthUser) { return this.s.stats(u.id); }
  @Get('ratings') @RequirePermission('ticket.view') ratings(@CurrentUser() u: AuthUser, @Query(zodBody(ratingQ)) q: z.infer<typeof ratingQ>) { return this.s.ratings(u.id, q); }
  @Get('transcripts') @RequirePermission('ticket.transcript') transcripts(@CurrentUser() u: AuthUser, @Query(zodBody(transcriptQ)) q: z.infer<typeof transcriptQ>) { return this.s.transcripts(u.id, q); }
  @Get('transcripts/:id') @RequirePermission('ticket.transcript')
  async transcript(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('download') download: string | undefined, @Res() res: Response) {
    const tr = await this.s.transcript(u.id, id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Transcript-HTML in einer Sandbox anzeigen: keine Skripte, kein Zugriff auf das Dashboard
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="transcript-${String(tr.ticketNumber).padStart(4, '0')}.html"`);
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

const botOpen = z.object({ categoryId: z.string().uuid(), panelId: z.string().uuid().optional(), guildId: snowflake, discordId: snowflake, discordName: z.string().trim().min(1).max(100), memberRoleIds: z.array(snowflake).max(250).default([]) });
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
  @BotService() @Post('open') open(@Body(zodBody(botOpen)) b: z.infer<typeof botOpen>) { return this.s.open(b, { userId: null, discordId: b.discordId, name: b.discordName, viaBot: true }); }
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
