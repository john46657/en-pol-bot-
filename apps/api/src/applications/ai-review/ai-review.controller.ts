import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { aiReviewSettingsSchema, type AiReviewSettings } from '@enrp/shared';
import { BotService, CurrentActor, CurrentUser, DiscordManagerAllows, RequirePermission } from '../../authz/decorators';
import type { Actor } from '../../audit/audit.service';
import type { AuthUser } from '../../common/request-context';
import { currentGuild } from '../../common/guild-context';
import { zodBody } from '../../common/zod.pipe';
import { AiReviewService } from './ai-review.service';

const startBody = z.object({ force: z.boolean().optional() });
const guildQ = z.object({ guildId: z.string().regex(/^\d{15,25}$/).optional() });
const who = (a: Actor, u: AuthUser) => ({ ...a, name: u?.displayName ?? null });
const via = (u: AuthUser) => (u?.sessionId === 'bot' ? 'DISCORD' as const : 'WEB' as const);
/** Gegen versehentliche Mehrfach-Klicks zusätzlich zur Sperre im Service (10 Starts pro Minute und Benutzer/IP). */
const START_LIMIT = { default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 10, ttl: 60_000 } };

/** KI-Prüfung der Polizei-Bewerbung: Ansehen und Starten nur für Prüfer (applications.review) bzw. Discord-Manager-Rollen. */
@ApiTags('applications')
@Controller('applications')
export class PoliceAiReviewController {
  constructor(private readonly ai: AiReviewService) {}
  /** Gespeicherter Stand – startet nie eine Analyse. */
  @Get(':id/ai-review') @RequirePermission('applications.review') @DiscordManagerAllows('police')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.ai.state('POLICE', id); }
  /** Analyse ausdrücklich starten (`force` = trotz aktuellem Ergebnis neu analysieren). */
  @Post(':id/ai-review') @HttpCode(202) @Throttle(START_LIMIT) @RequirePermission('applications.review') @DiscordManagerAllows('police')
  start(@CurrentActor() a: Actor, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(startBody)) b: z.infer<typeof startBody>) {
    return this.ai.start(who(a, u), 'POLICE', id, { force: b.force, via: via(u) });
  }
}

/** KI-Prüfung der Bewerbungen für Einheiten (SEK, Flugstaffel …): wer über sie entscheiden darf (qualifications.decide). */
@ApiTags('qualifications')
@Controller('qualifications/applications')
export class QualificationAiReviewController {
  constructor(private readonly ai: AiReviewService) {}
  @Get(':id/ai-review') @RequirePermission('qualifications.decide') @DiscordManagerAllows('quali')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.ai.state('QUALIFICATION', id); }
  @Post(':id/ai-review') @HttpCode(202) @Throttle(START_LIMIT) @RequirePermission('qualifications.decide') @DiscordManagerAllows('quali')
  start(@CurrentActor() a: Actor, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(startBody)) b: z.infer<typeof startBody>) {
    return this.ai.start(who(a, u), 'QUALIFICATION', id, { force: b.force, via: via(u) });
  }
}

/** Einstellungen (RP-Regeln, Auswahlkriterien, an/aus) je Server und Status (Schlüssel hinterlegt, Modell, Nutzung). */
@ApiTags('applications')
@Controller('application-ai-review')
export class AiReviewSettingsController {
  constructor(private readonly ai: AiReviewService) {}
  @Get('status') @RequirePermission('applications.view')
  status(@Query(zodBody(guildQ)) q: z.infer<typeof guildQ>) { return this.ai.status(q.guildId ?? currentGuild()); }
  @Get('settings') @RequirePermission('applications.view')
  settings(@Query(zodBody(guildQ)) q: z.infer<typeof guildQ>) { return this.ai.settings(q.guildId ?? currentGuild()); }
  @Put('settings') @RequirePermission('qualifications.manage')
  save(@CurrentActor() a: Actor, @Query(zodBody(guildQ)) q: z.infer<typeof guildQ>, @Body(zodBody(aiReviewSettingsSchema)) b: AiReviewSettings) {
    return this.ai.saveSettings(a, q.guildId ?? currentGuild(), b);
  }
}

/** Integrationsdiagnose im Bot (`/system integrations`): nur ob eingerichtet, Modell und Nutzung – nie der Schlüssel. */
@ApiTags('bot')
@Controller('bot/ai-review')
export class BotAiReviewController {
  constructor(private readonly ai: AiReviewService) {}
  @BotService() @Get('status')
  status(@Query(zodBody(guildQ)) q: z.infer<typeof guildQ>) { return this.ai.status(q.guildId ?? null); }
}
