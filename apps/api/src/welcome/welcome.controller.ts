import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { WelcomeConfig } from '@enrp/shared';
import { welcomeConfigSchema, WelcomeService } from './welcome.service';
import { BotService, CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const sf = z.string().regex(/^\d{15,25}$/);
const memberBody = z.object({ guildId: sf, discordId: sf });

/** Admin → Welcome & Goodbye. */
@ApiTags('welcome')
@Controller('welcome')
export class WelcomeController {
  constructor(private readonly s: WelcomeService) {}
  @Get('config') @RequirePermission('settings.view')
  config() { return this.s.config(); }
  @Put('config') @RequirePermission('settings.manage')
  save(@CurrentActor() a: Actor, @Body(zodBody(welcomeConfigSchema)) b: WelcomeConfig) { return this.s.save(a, b); }
  /** Test-Nachricht in Discord (gespeicherte Einstellungen, dein Profil als Beispiel-Mitglied). */
  @Post('test') @HttpCode(200) @RequirePermission('settings.manage')
  test(@CurrentActor() a: Actor, @Body(zodBody(z.object({ kind: z.enum(['welcome', 'goodbye', 'dm']) }))) b: { kind: 'welcome' | 'goodbye' | 'dm' }) { return this.s.test(a, b.kind); }
}

/** Dienstweg des Bots: Einstellungen beim Beitritt lesen, Austritt melden. */
@ApiTags('bot')
@Controller('bot')
export class BotWelcomeController {
  constructor(private readonly s: WelcomeService) {}
  @BotService() @Get('welcome')
  config() { return this.s.config(); }
  @BotService() @Get('welcome/banner/:id') banner(@Param('id', ParseUUIDPipe) id: string) { return this.s.banner(id); }
  @BotService() @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 120, ttl: 60_000 } }) @Post('member-left') @HttpCode(200)
  memberLeft(@Body(zodBody(memberBody)) b: z.infer<typeof memberBody>) { return this.s.memberLeft(b.guildId, b.discordId); }
}
