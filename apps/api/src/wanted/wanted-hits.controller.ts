import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { pageQuery } from '../common/pagination';
import { currentGuild } from '../common/guild-context';
import { HIT_REVIEW_STATUSES, MATCH_TYPES, matchSettingsSchema, WantedMatchService } from './wanted-match.service';

const listQ = pageQuery.extend({ status: z.enum(HIT_REVIEW_STATUSES).optional(), matchType: z.enum(MATCH_TYPES).optional(), wantedId: z.string().uuid().optional() });
const review = z.object({ decision: z.enum(['VERIFIED', 'DISMISSED']), note: z.string().trim().min(3).max(1000), storeRobloxId: z.boolean().optional() });
const settings = matchSettingsSchema.partial().strict();

/** ER:LC-Fahndungstreffer (automatischer Abgleich). Alle Rechte werden serverseitig geprüft. */
@ApiTags('wanted')
@Controller('wanted-hits')
export class WantedHitsController {
  constructor(private readonly m: WantedMatchService) {}
  @Get() @RequirePermission('wanted.view')
  list(@Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.m.list(q, q); }
  @Get('summary') @RequirePermission('wanted.view')
  summary() { return this.m.summary(currentGuild()); }
  @Get('settings') @RequirePermission('wanted.view')
  getSettings() { return this.m.settings(); }
  @Put('settings') @RequirePermission('wanted.manage_matching')
  putSettings(@CurrentActor() a: Actor, @Body(zodBody(settings)) b: z.infer<typeof settings>) { return this.m.saveSettings(a, b); }
  @Get(':id') @RequirePermission('wanted.view')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.m.get(id); }
  @Post(':id/review') @RequirePermission('wanted.review_hits')
  review(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(review)) b: z.infer<typeof review>) { return this.m.review(a, id, b); }
}
