import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { BotService, CurrentActor, CurrentUser, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import type { AuthUser } from '../common/request-context';
import { zodBody } from '../common/zod.pipe';
import { categorySchema, channelsConfigSchema, copyDocSchema, createDocSchema, docKind, MessageBuilderService, templateExportQuery, templateImportSchema, updateDocSchema } from './message-builder.service';
import { editSchema, loadedSchema, loadLinkSchema, MessageBuilderMessagesService, messagesQuery, renameSchema } from './message-builder-messages.service';
import { finishSchema, historyQuery, interactionSchema, itemResultSchema, MessageBuilderSendService, sendSchema, webhookCreateSchema, webhookUpdateSchema } from './message-builder-send.service';

const kindQuery = z.object({ kind: docKind });
const sendRate = process.env.NODE_ENV === 'test' ? 10_000 : 20;

/**
 * Discord Message Builder. Alle Routen brauchen mindestens `messagebuilder.view`; Entwürfe/Vorlagen/Versand prüfen
 * im Service zusätzlich das jeweilige Recht (Entwurf vs. Vorlage, Bot vs. Webhook vs. Test).
 */
@ApiTags('message-builder')
@Controller('message-builder')
export class MessageBuilderController {
  constructor(private readonly s: MessageBuilderService, private readonly send: MessageBuilderSendService, private readonly msgs: MessageBuilderMessagesService) {}

  @Get('server') @RequirePermission('messagebuilder.view') server() { return this.s.serverInfo(); }
  @Get('documents') @RequirePermission('messagebuilder.view') list(@CurrentActor() a: Actor, @Query(zodBody(kindQuery)) q: z.infer<typeof kindQuery>) { return this.s.list(a, q.kind); }
  @Get('documents/:id') @RequirePermission('messagebuilder.view') get(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.get(a, id); }
  @Post('documents') @RequirePermission('messagebuilder.view') create(@CurrentActor() a: Actor, @Body(zodBody(createDocSchema)) b: z.infer<typeof createDocSchema>) { return this.s.create(a, b); }
  @Put('documents/:id') @RequirePermission('messagebuilder.view') update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(updateDocSchema)) b: z.infer<typeof updateDocSchema>) { return this.s.update(a, id, b); }
  @Post('documents/:id/copy') @RequirePermission('messagebuilder.view') copy(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(copyDocSchema)) b: z.infer<typeof copyDocSchema>) { return this.s.copy(a, id, b); }
  @Delete('documents/:id') @HttpCode(204) @RequirePermission('messagebuilder.view') remove(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.remove(a, id); }

  @Get('templates/export') @RequirePermission('messagebuilder.view') exportTemplates(@Query(zodBody(templateExportQuery)) q: z.infer<typeof templateExportQuery>) { return this.s.exportTemplates(q.ids?.split(',').filter((x) => /^[0-9a-f-]{36}$/.test(x))); }
  @Post('templates/import') @RequirePermission('messagebuilder.templates_create') importTemplates(@CurrentActor() a: Actor, @Body(zodBody(templateImportSchema)) b: z.infer<typeof templateImportSchema>) { return this.s.importTemplates(a, b); }
  @Post('templates/examples') @RequirePermission('messagebuilder.templates_create') examples(@CurrentActor() a: Actor) { return this.s.addExamples(a); }

  @Get('categories') @RequirePermission('messagebuilder.view') categories() { return this.s.categories(); }
  @Post('categories') @RequirePermission('messagebuilder.templates_edit') createCategory(@CurrentActor() a: Actor, @Body(zodBody(categorySchema)) b: z.infer<typeof categorySchema>) { return this.s.createCategory(a, b); }
  @Put('categories/:id') @RequirePermission('messagebuilder.templates_edit') updateCategory(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(categorySchema)) b: z.infer<typeof categorySchema>) { return this.s.updateCategory(a, id, b); }
  @Delete('categories/:id') @HttpCode(204) @RequirePermission('messagebuilder.templates_edit') removeCategory(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.removeCategory(a, id); }

  @Get('channels/config') @RequirePermission('messagebuilder.channels') channelsConfig() { return this.s.allowedChannelIds().then((channelIds) => ({ channelIds })); }
  @Put('channels/config') @RequirePermission('messagebuilder.channels') setChannels(@CurrentActor() a: Actor, @Body(zodBody(channelsConfigSchema)) b: z.infer<typeof channelsConfigSchema>) { return this.s.setAllowedChannels(a, b); }

  @Post('send') @Throttle({ default: { limit: sendRate, ttl: 60_000 } }) @RequirePermission('messagebuilder.view')
  doSend(@CurrentActor() a: Actor, @CurrentUser() u: AuthUser, @Body(zodBody(sendSchema)) b: z.infer<typeof sendSchema>) { return this.send.send(a, u.displayName, b); }
  @Get('sends') @RequirePermission('messagebuilder.history') history(@Query(zodBody(historyQuery)) q: z.infer<typeof historyQuery>) { return this.send.history(q); }
  @Get('sends/:id') @RequirePermission('messagebuilder.view') sendStatus(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.send.get(a, id); }
  @Post('sends/:id/draft') @RequirePermission('messagebuilder.create') sendToDraft(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.send.toDraft(a, id); }

  // Gespeicherte Discord-Nachrichten: Links, laden per Link, bearbeiten
  @Get('messages') @RequirePermission('messagebuilder.view') messages(@CurrentActor() a: Actor, @Query(zodBody(messagesQuery)) q: z.infer<typeof messagesQuery>) { return this.msgs.list(a, q); }
  @Get('messages/:id') @RequirePermission('messagebuilder.view') message(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.msgs.get(a, id); }
  @Post('messages/load') @RequirePermission('messagebuilder.edit') loadMessage(@CurrentActor() a: Actor, @CurrentUser() u: AuthUser, @Body(zodBody(loadLinkSchema)) b: z.infer<typeof loadLinkSchema>) { return this.msgs.loadByLink(a, u.displayName, b); }
  @Post('messages/:id/reload') @RequirePermission('messagebuilder.edit') reloadMessage(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.msgs.reload(a, id); }
  @Put('messages/:id') @RequirePermission('messagebuilder.edit') renameMessage(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(renameSchema)) b: z.infer<typeof renameSchema>) { return this.msgs.rename(a, id, b); }
  @Delete('messages/:id') @HttpCode(204) @RequirePermission('messagebuilder.edit') removeMessage(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.msgs.remove(a, id); }
  @Post('messages/:id/edit') @Throttle({ default: { limit: sendRate, ttl: 60_000 } }) @RequirePermission('messagebuilder.edit')
  editMessage(@CurrentActor() a: Actor, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(editSchema)) b: z.infer<typeof editSchema>) { return this.msgs.edit(a, u.displayName, id, b); }

  @Get('webhooks') @RequirePermission('messagebuilder.webhooks') webhooks() { return this.send.listWebhooks(); }
  @Post('webhooks') @RequirePermission('messagebuilder.webhooks') createWebhook(@CurrentActor() a: Actor, @Body(zodBody(webhookCreateSchema)) b: z.infer<typeof webhookCreateSchema>) { return this.send.createWebhook(a, b); }
  @Put('webhooks/:id') @RequirePermission('messagebuilder.webhooks') updateWebhook(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(webhookUpdateSchema)) b: z.infer<typeof webhookUpdateSchema>) { return this.send.updateWebhook(a, id, b); }
  @Post('webhooks/:id/test') @HttpCode(200) @Throttle({ default: { limit: sendRate, ttl: 60_000 } }) @RequirePermission('messagebuilder.webhooks') testWebhook(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.send.testWebhook(a, id); }
  @Delete('webhooks/:id') @HttpCode(204) @RequirePermission('messagebuilder.webhooks') removeWebhook(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.send.removeWebhook(a, id); }
}

/** Nur für den Bot: Versandaufträge abholen und Ergebnisse je Nachricht melden, Aktionen interaktiver Komponenten auflösen. */
@ApiTags('bot')
@Controller('bot/message-builder')
export class BotMessageBuilderController {
  constructor(private readonly send: MessageBuilderSendService, private readonly msgs: MessageBuilderMessagesService) {}
  @BotService() @Get('messages/:id') target(@Param('id', ParseUUIDPipe) id: string) { return this.msgs.botTarget(id); }
  @BotService() @Post('messages/:id/loaded') @HttpCode(204) async loaded(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(loadedSchema)) b: z.infer<typeof loadedSchema>) { await this.msgs.loaded(id, b); }
  @BotService() @Post('sends/:id/start') @HttpCode(200) start(@Param('id', ParseUUIDPipe) id: string) { return this.send.start(id); }
  @BotService() @Post('sends/:id/items/:position') @HttpCode(204)
  async item(@Param('id', ParseUUIDPipe) id: string, @Param('position', ParseIntPipe) position: number, @Body(zodBody(itemResultSchema)) b: z.infer<typeof itemResultSchema>) { await this.send.itemResult(id, position, b); }
  @BotService() @Post('sends/:id/finish') @HttpCode(204) async finish(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(finishSchema)) b: z.infer<typeof finishSchema>) { await this.send.finish(id, b); }
  @BotService() @Post('interactions') @HttpCode(200) interaction(@Body(zodBody(interactionSchema)) b: z.infer<typeof interactionSchema>) { return this.send.interaction(b); }
}
