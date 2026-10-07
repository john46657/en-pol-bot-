import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { embedSchema, EmbedsService, type EmbedDoc } from './embeds.service';
import { BotService, CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { currentGuild } from '../common/guild-context';
import { AppError } from '../common/errors';

const sf = z.string().regex(/^\d{15,25}$/);

/** Administration → Embeds. */
@ApiTags('embeds')
@Controller('embeds')
export class EmbedsController {
  constructor(private readonly s: EmbedsService) {}
  @Get() @RequirePermission('settings.view') list() { return this.s.all(currentGuild()); }
  @Put(':id') @RequirePermission('settings.manage')
  save(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(embedSchema)) b: EmbedDoc) {
    if (b.id !== id) throw new AppError('VALIDATION_FAILED', 'ID passt nicht.');
    return this.s.save(a, b);
  }
  @Post(':id/duplicate') @RequirePermission('settings.manage') duplicate(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.duplicate(a, id); }
  @Delete(':id') @HttpCode(204) @RequirePermission('settings.manage') remove(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.remove(a, id); }
  @Post(':id/send') @HttpCode(202) @RequirePermission('settings.manage')
  send(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ mode: z.enum(['update', 'new']).default('update') }))) b: { mode: 'update' | 'new' }) { return this.s.send(a, id, b.mode); }
}

@ApiTags('bot')
@Controller('bot/embeds')
export class BotEmbedsController {
  constructor(private readonly s: EmbedsService) {}
  @BotService() @Post(':id/posted') @HttpCode(204)
  async posted(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ channelId: sf, messageId: sf }))) b: { channelId: string; messageId: string }) { await this.s.posted(id, b.channelId, b.messageId); }
}
