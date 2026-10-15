import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { BotService, CurrentActor, CurrentUser, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import type { AuthUser } from '../common/request-context';
import { zodBody } from '../common/zod.pipe';
import { categorySchema, channelsConfigSchema, copyDocSchema, createDocSchema, docKind, MessageBuilderService, updateDocSchema } from './message-builder.service';
import { finishSchema, historyQuery, interactionSchema, itemResultSchema, MessageBuilderSendService, sendSchema, webhookCreateSchema } from './message-builder-send.service';

const kindQuery = z.object({ kind: docKind });
const sendRate = process.env.NODE_ENV === 'test' ? 10_000 : 20;

/**
 * Discord Message Builder. Alle Routen brauchen mindestens `messagebuilder.view`; Entwürfe/Vorlagen/Versand prüfen
 * im Service zusätzlich das jeweilige Recht (Entwurf vs. Vorlage, Bot vs. Webhook vs. Test).
 */
@ApiTags('message-builder')
@Controller('message-builder')
export class MessageBuilderController {
  constructor(private readonly s: MessageBuilderService, private readonly send: MessageBuilderSendService) {}

  @Get('server') @RequirePermission('messagebuilder.view') server() { return this.s.serverInfo(); }
  @Get('documents') @RequirePermission('messagebuilder.view') list(@CurrentActor() a: Actor, @Query(zodBody(kindQuery)) q: z.infer<typeof kindQuery>) { return this.s.list(a, q.kind); }
  @Get('documents/:id') @RequirePermission('messagebuilder.view') get(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.get(a, id); }
  @Post('documents') @RequirePermission('messagebuilder.view') create(@CurrentActor() a: Actor, @Body(zodBody(createDocSchema)) b: z.infer<typeof createDocSchema>) { return this.s.create(a, b); }
  @Put('documents/:id') @RequirePermission('messagebuilder.view') update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(updateDocSchema)) b: z.infer<typeof updateDocSchema>) { return this.s.update(a, id, b); }
  @Post('documents/:id/copy') @RequirePermission('messagebuilder.view') copy(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(copyDocSchema)) b: z.infer<typeof copyDocSchema>) { return this.s.copy(a, id, b); }
  @Delete('documents/:id') @HttpCode(204) @RequirePermission('messagebuilder.view') remove(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.remove(a, id); }

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

  @Get('webhooks') @RequirePermission('messagebuilder.webhooks') webhooks() { return this.send.listWebhooks(); }
  @Post('webhooks') @RequirePermission('messagebuilder.webhooks') createWebhook(@CurrentActor() a: Actor, @Body(zodBody(webhookCreateSchema)) b: z.infer<typeof webhookCreateSchema>) { return this.send.createWebhook(a, b); }
  @Delete('webhooks/:id') @HttpCode(204) @RequirePermission('messagebuilder.webhooks') removeWebhook(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.send.removeWebhook(a, id); }
}

/** Nur für den Bot: Versandaufträge abholen und Ergebnisse je Nachricht melden, Aktionen interaktiver Komponenten auflösen. */
@ApiTags('bot')
@Controller('bot/message-builder')
export class BotMessageBuilderController {
  constructor(private readonly send: MessageBuilderSendService) {}
  @BotService() @Post('sends/:id/start') @HttpCode(200) start(@Param('id', ParseUUIDPipe) id: string) { return this.send.start(id); }
  @BotService() @Post('sends/:id/items/:position') @HttpCode(204)
  async item(@Param('id', ParseUUIDPipe) id: string, @Param('position', ParseIntPipe) position: number, @Body(zodBody(itemResultSchema)) b: z.infer<typeof itemResultSchema>) { await this.send.itemResult(id, position, b); }
  @BotService() @Post('sends/:id/finish') @HttpCode(204) async finish(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(finishSchema)) b: z.infer<typeof finishSchema>) { await this.send.finish(id, b); }
  @BotService() @Post('interactions') @HttpCode(200) interaction(@Body(zodBody(interactionSchema)) b: z.infer<typeof interactionSchema>) { return this.send.interaction(b); }
}
