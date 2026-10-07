import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { VerifyConfig } from '@enrp/shared';
import { verifyConfigSchema, VerificationService } from './verification.service';
import { BotService, CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { currentGuild } from '../common/guild-context';
import { AppError } from '../common/errors';

const sf = z.string().regex(/^\d{15,25}$/);
const guildQ = z.object({ guildId: sf.optional() });
const listQ = z.object({ q: z.string().trim().max(64).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
const member = z.object({ guildId: sf.optional(), discordId: sf, discordName: z.string().trim().max(100).optional() });
const did = (v: string) => { if (!/^\d{15,25}$/.test(v)) throw new AppError('VALIDATION_FAILED', 'Ungültige Discord-ID.'); return v; };
const fast = { default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 600, ttl: 60_000 } };

/** Administration → Roblox-Verifizierung. */
@ApiTags('verification')
@Controller('verification')
export class VerificationController {
  constructor(private readonly s: VerificationService) {}
  @Get('config') @RequirePermission('settings.view')
  config(@Query(zodBody(guildQ)) q: z.infer<typeof guildQ>) { return this.s.config(q.guildId ?? currentGuild()); }
  @Put('config') @RequirePermission('settings.manage')
  save(@CurrentActor() a: Actor, @Query(zodBody(guildQ)) q: z.infer<typeof guildQ>, @Body(zodBody(verifyConfigSchema)) b: VerifyConfig) { return this.s.save(a, b, q.guildId ?? currentGuild()); }
  @Post('panel') @HttpCode(200) @RequirePermission('settings.manage')
  panel(@CurrentActor() a: Actor, @Query(zodBody(guildQ)) q: z.infer<typeof guildQ>) { return this.s.postPanel(a, q.guildId ?? currentGuild() ?? null); }
  @Get('links') @RequirePermission('settings.view')
  list(@Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.s.list(q); }
  @Delete('links/:discordId') @RequirePermission('settings.manage')
  unlink(@CurrentActor() a: Actor, @Param('discordId') id: string) { return this.s.unlink(a, did(id)); }
  @Post('links/:discordId/refresh') @HttpCode(200) @RequirePermission('settings.manage')
  refresh(@Param('discordId') id: string) { return this.s.refresh(did(id)); }
}

/** Dienstweg des Bots: Verifizieren, Status (Beitritt, /aktualisieren), Panel-Ort melden. */
@ApiTags('bot')
@Controller('bot/verify')
export class BotVerificationController {
  constructor(private readonly s: VerificationService) {}
  @BotService() @Get('config') config(@Query(zodBody(z.object({ guildId: sf }))) q: { guildId: string }) { return this.s.config(q.guildId); }
  @BotService() @Throttle(fast) @Post('start') @HttpCode(200)
  start(@Body(zodBody(member.extend({ roblox: z.string().trim().min(1).max(100) }))) b: z.infer<typeof member> & { roblox: string }) { return this.s.start(b.guildId, b.discordId, b.roblox); }
  @BotService() @Throttle(fast) @Post('check') @HttpCode(200)
  check(@Body(zodBody(member)) b: z.infer<typeof member>) { return this.s.check(b.guildId, b.discordId, b.discordName); }
  @BotService() @Throttle(fast) @Post('status') @HttpCode(200)
  status(@Body(zodBody(member)) b: z.infer<typeof member>) { return this.s.status(b.guildId, b.discordId, b.discordName); }
  @BotService() @Get('whois') whois(@Query(zodBody(z.object({ discordId: sf }))) q: { discordId: string }) { return this.s.whois(q.discordId); }
  @BotService() @Post('unlink') @HttpCode(200) unlink(@Body(zodBody(z.object({ discordId: sf }))) b: { discordId: string }) { return this.s.unlink(null, b.discordId); }
  @BotService() @Post('panel-posted') @HttpCode(200)
  posted(@Body(zodBody(z.object({ guildId: sf.nullish(), channelId: sf, messageId: sf }))) b: { guildId?: string | null; channelId: string; messageId: string }) { return this.s.panelPosted(b.guildId ?? null, b.channelId, b.messageId); }
}
