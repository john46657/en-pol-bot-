import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { DiscordService } from './discord.service';
import { BotService, CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const redeem = z.object({ code: z.string().trim().min(8).max(12), discordId: z.string().regex(/^\d{15,25}$/) });
const ack = z.object({ ok: z.boolean(), error: z.string().max(300).optional() });
const outboxQ = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });
const rate = process.env.NODE_ENV === 'test' ? 10_000 : 20;

/** Web-Seite: eigenes Konto verknüpfen. Authentifiziert per Session; Bot-Zugang ist hier nicht erlaubt. */
@ApiTags('discord')
@Controller('discord')
export class DiscordController {
  constructor(private readonly d: DiscordService) {}
  @Get('link') link(@CurrentActor() a: Actor) { return this.d.status(a.userId!); }
  @Post('link-code') @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 10, ttl: 60_000 } })
  linkCode(@CurrentActor() a: Actor) { return this.d.createLinkCode(a); }
  @Delete('link') @HttpCode(204) unlinkSelf(@CurrentActor() a: Actor) { return this.d.unlink(a, a.userId!); }
  @Delete('links/:userId') @HttpCode(204) @RequirePermission('users.manage')
  unlinkUser(@CurrentActor() a: Actor, @Param('userId', ParseUUIDPipe) userId: string) { return this.d.unlink(a, userId); }
}

/** Dienst-zu-Dienst-Endpunkte des Bots (Header `Authorization: Bot <BOT_API_TOKEN>`); ohne Benutzerkontext. */
@ApiTags('bot')
@Controller('bot')
export class BotController {
  constructor(private readonly d: DiscordService) {}
  @BotService() @Throttle({ default: { limit: rate, ttl: 60_000 } }) @Post('link') @HttpCode(200)
  redeem(@Body(zodBody(redeem)) b: z.infer<typeof redeem>) { return this.d.redeem(b.code, b.discordId); }
  @BotService() @Get('config') config() { return this.d.channels(); }
  @BotService() @Get('outbox') outbox(@Query(zodBody(outboxQ)) q: z.infer<typeof outboxQ>) { return this.d.pending(q.limit); }
  @BotService() @Post('outbox/:id/ack') @HttpCode(204)
  ack(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(ack)) b: z.infer<typeof ack>) { return this.d.ack(id, b.ok, b.error); }
}
