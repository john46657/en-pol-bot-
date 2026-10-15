import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { RadioCodesService } from './radio-codes.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const fields = { meaning: z.string().trim().min(1).max(200), category: z.string().trim().max(64).nullable().optional(), description: z.string().trim().max(1000).nullable().optional() };
const create = z.object({ code: z.string().trim().min(1).max(32), ...fields, guildId: z.string().regex(/^\d{15,25}$/).nullable().optional() });
const update = z.object({ code: z.string().trim().min(1).max(32).optional(), meaning: fields.meaning.optional(), category: fields.category, description: fields.description });
const listQ = z.object({ q: z.string().max(64).optional() });
const discordCfg = z.object({ channelId: z.string().regex(/^\d{15,25}$/).nullable(), title: z.string().max(256), description: z.string().max(2000), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), groupByCategory: z.boolean(), showDescription: z.boolean(), autoUpdate: z.boolean() });
const order = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

@ApiTags('radio-codes')
@Controller('radio-codes')
export class RadioCodesController {
  constructor(private readonly s: RadioCodesService) {}
  @Get() @RequirePermission('radio.view') list(@Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.s.list(q.q); }
  @Get('discord') @RequirePermission('radio.view') discord() { return this.s.discordConfig(); }
  @Put('discord') @RequirePermission('radio.manage') saveDiscord(@CurrentActor() a: Actor, @Body(zodBody(discordCfg)) b: z.infer<typeof discordCfg>) { return this.s.saveDiscordConfig(a, b); }
  @Post('discord/send') @HttpCode(202) @RequirePermission('radio.manage') send(@CurrentActor() a: Actor, @Body(zodBody(z.object({ mode: z.enum(['update', 'new']).default('update') }))) b: { mode: 'update' | 'new' }) { return this.s.sendToDiscord(a, b.mode); }
  @Post() @RequirePermission('radio.manage') create(@CurrentActor() a: Actor, @Body(zodBody(create)) b: z.infer<typeof create>) { return this.s.create(a, b); }
  @Post('defaults') @HttpCode(200) @RequirePermission('radio.manage') defaults(@CurrentActor() a: Actor) { return this.s.insertDefaults(a); }
  @Put('order') @RequirePermission('radio.manage') reorder(@CurrentActor() a: Actor, @Body(zodBody(order)) b: z.infer<typeof order>) { return this.s.reorder(a, b.ids); }
  @Patch(':id') @RequirePermission('radio.manage') update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(update)) b: z.infer<typeof update>) { return this.s.update(a, id, b); }
  @Delete(':id') @HttpCode(204) @RequirePermission('radio.manage') remove(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.remove(a, id); }
}
