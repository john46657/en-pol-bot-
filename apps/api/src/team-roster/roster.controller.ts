import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { RosterService } from './roster.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const key = z.string().regex(/^(discord:)?[0-9a-zA-Z-]{15,40}$/);
const limitQ = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) });

@ApiTags('team')
@Controller('team')
export class RosterController {
  constructor(private readonly r: RosterService) {}

  /** Teamliste (ohne Voice-Daten). Die Oberfläche lädt sie mindestens alle 60 Sekunden neu. */
  @Get('roster') @RequirePermission('team.view')
  roster() { return this.r.roster(); }

  /** „Jetzt aktualisieren“: Bot meldet sofort neu; Antwort ist der aktuelle Stand. */
  @Post('roster/refresh') @HttpCode(200) @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 12, ttl: 60_000 } }) @RequirePermission('team.view')
  async refresh() { await this.r.requestSync(); return this.r.roster(); }

  @Get('roster/:key') @RequirePermission('team.view')
  profile(@CurrentActor() a: Actor, @Param('key', zodBody(key)) k: string) { return this.r.profile(a.userId!, k); }

  @Get('structure') @RequirePermission('team.view')
  structure() { return this.r.structure(); }

  @Get('activity') @RequirePermission('team.view')
  activity(@Query(zodBody(limitQ)) q: z.infer<typeof limitQ>) { return this.r.activity(q.limit); }

  /** Aktive Voice-Channels – eigener Bereich mit eigenem Sichtbarkeitsrecht. */
  @Get('voice') @RequirePermission('team.view', 'dashboard.voice.view')
  voice() { return this.r.voice(); }
}
