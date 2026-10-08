import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { WelcomeConfig } from '@enrp/shared';
import { welcomeConfigSchema, WelcomeService } from './welcome.service';
import { BotService, CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { currentGuild } from '../common/guild-context';
import { AppError } from '../common/errors';

const sf = z.string().regex(/^\d{15,25}$/);
const guildQ = z.object({ guildId: sf.optional() });
const memberBody = z.object({ guildId: sf, discordId: sf });

/** Admin → Welcome & Goodbye. Server = `guildId` oder der oben gewählte Server; ohne Server die gemeinsame Grundeinstellung. */
@ApiTags('welcome')
@Controller('welcome')
export class WelcomeController {
  constructor(private readonly s: WelcomeService) {}
  @Get('config') @RequirePermission('settings.view')
  config(@Query(zodBody(guildQ)) q: z.infer<typeof guildQ>) { return this.s.config(q.guildId ?? currentGuild()); }
  @Put('config') @RequirePermission('settings.manage')
  save(@CurrentActor() a: Actor, @Query(zodBody(guildQ)) q: z.infer<typeof guildQ>, @Body(zodBody(welcomeConfigSchema)) b: WelcomeConfig) { return this.s.save(a, b, q.guildId ?? currentGuild()); }
  /** Test-Nachricht in Discord (gespeicherte Einstellungen, dein Profil als Beispiel-Mitglied). */
  @Post('test') @HttpCode(200) @RequirePermission('settings.manage')
  test(@CurrentActor() a: Actor, @Query(zodBody(guildQ)) q: z.infer<typeof guildQ>, @Body(zodBody(z.object({ kind: z.enum(['welcome', 'goodbye', 'dm']) }))) b: { kind: 'welcome' | 'goodbye' | 'dm' }) { return this.s.test(a, q.guildId ?? currentGuild(), b.kind); }
  @Delete('config') @RequirePermission('settings.manage')
  reset(@CurrentActor() a: Actor, @Query(zodBody(guildQ)) q: z.infer<typeof guildQ>) {
    const g = q.guildId ?? currentGuild();
    if (!g) throw new AppError('VALIDATION_FAILED', 'Wähle zuerst einen Server.');
    return this.s.reset(a, g);
  }
}

/** Dienstweg des Bots: Einstellungen beim Beitritt lesen, Austritt melden. */
@ApiTags('bot')
@Controller('bot')
export class BotWelcomeController {
  constructor(private readonly s: WelcomeService) {}
  @BotService() @Get('welcome')
  config(@Query(zodBody(z.object({ guildId: sf }))) q: { guildId: string }) { return this.s.config(q.guildId); }
  @BotService() @Get('welcome/banner/:id') banner(@Param('id', ParseUUIDPipe) id: string) { return this.s.banner(id); }
  @BotService() @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 120, ttl: 60_000 } }) @Post('member-left') @HttpCode(200)
  memberLeft(@Body(zodBody(memberBody)) b: z.infer<typeof memberBody>) { return this.s.memberLeft(b.guildId, b.discordId); }
}
