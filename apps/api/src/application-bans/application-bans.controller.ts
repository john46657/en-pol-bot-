import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { BotService, CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { ApplicationBansService } from './application-bans.service';

const scope = z.string().regex(/^(\*|[a-z0-9_-]{2,24})$/);
const createBody = z.object({
  discordId: z.string().trim().regex(/^\d{15,25}$/, 'Discord-ID: 15–25 Ziffern').nullish().or(z.literal('')),
  roblox: z.string().trim().max(32).nullish(), name: z.string().trim().max(80).nullish(),
  scopes: z.array(scope).min(1).max(20), reason: z.string().trim().min(3).max(500), expiresAt: z.string().datetime().nullish(),
});

@ApiTags('applications')
@Controller('application-bans')
export class ApplicationBansController {
  constructor(private readonly s: ApplicationBansService) {}
  @Get() @RequirePermission('applications.view')
  list(@Query(zodBody(z.object({ all: z.enum(['true', 'false']).optional() }))) q: { all?: string }) { return this.s.list(q.all === 'true'); }
  @Post() @RequirePermission('applications.decide')
  create(@CurrentActor() a: Actor, @Body(zodBody(createBody)) b: z.infer<typeof createBody>) { return this.s.create(a, { ...b, discordId: b.discordId || null }); }
  @Post(':id/lift') @HttpCode(200) @RequirePermission('applications.decide')
  lift(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.lift(a, id); }
}

/** Für den Bot: vor dem Start einer Bewerbung prüfen (auch ohne verknüpftes Konto). */
@ApiTags('bot')
@Controller('bot/application-bans')
export class BotApplicationBansController {
  constructor(private readonly s: ApplicationBansService) {}
  @BotService() @Get('check')
  check(@Query(zodBody(z.object({ discordId: z.string().regex(/^\d{15,25}$/), scope, name: z.string().max(80).optional(), guildId: z.string().regex(/^\d{15,25}$/).optional() }))) q: { discordId: string; scope: string; name?: string; guildId?: string }) { return this.s.check(q.discordId, q.scope, q.name ?? 'diese Bewerbung', q.guildId ?? null); }
}
