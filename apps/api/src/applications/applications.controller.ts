import { currentGuild } from '../common/guild-context';
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { APPLICATION_STATUSES } from '@enrp/shared';
import { ApplicationsService } from './applications.service';
import { ApplicationsAnalyticsService } from './applications-analytics.service';
import { CurrentActor, Public, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { RobloxService } from '../persons/roblox.service';
import { pageQuery } from '../common/pagination';

const submit = z.object({ robloxUsername: z.string().trim().min(1).max(64), robloxUserId: z.string().max(20).optional(), answers: z.record(z.string(), z.union([z.string().max(5000), z.array(z.string().max(100)).max(25)])) });
const move = z.object({ status: z.enum(APPLICATION_STATUSES).refine((s) => s !== 'ACCEPTED' && s !== 'REJECTED', 'Annehmen oder Ablehnen bitte über die Entscheidung.'), reason: z.string().trim().min(3).max(1000).optional() });
/** `OPEN` = alle noch nicht entschiedenen (eingereicht, Prüfung, Gespräch, Entscheidung offen). */
const listQ = pageQuery.extend({ status: z.union([z.enum(APPLICATION_STATUSES), z.literal('OPEN')]).optional(), guildId: z.string().regex(/^\d{15,25}$/).optional() });
const guildQ = z.object({ guildId: z.string().regex(/^\d{15,25}$/).optional() });

const analyticsQ = z.object({ type: z.string().max(80).optional(), status: z.enum(['APPROVED', 'PENDING', 'REJECTED']).optional(), reviewer: z.string().uuid().optional(), days: z.coerce.number().int().min(7).max(365).default(30) });

@ApiTags('applications')
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly a: ApplicationsService, private readonly stats: ApplicationsAnalyticsService, private readonly roblox: RobloxService) {}
  /** `?guildId=` – Formular eines Servers (für den Bot); ohne: das gemeinsame (Web-Seite /apply). */
  /** Frage „Roblox User“: Konto suchen (Name, Anzeigename, Bild – keine internen Daten). Öffentlich, begrenzt. */
  @Public() @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 30, ttl: 60_000 } }) @Get('roblox')
  async robloxLookup(@Query(zodBody(z.object({ q: z.string().trim().min(3).max(20).regex(/^@?[A-Za-z0-9_]+$/) }))) q: { q: string }) {
    return { profile: await this.roblox.publicLookup(q.q.replace(/^@/, '')) };
  }

  @Public() @Get('form')
  form(@Query(zodBody(guildQ)) q: z.infer<typeof guildQ>) { return this.a.form(q.guildId); }
  @Public() @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 5, ttl: 3_600_000 } }) @Post()
  submit(@Body(zodBody(submit)) b: z.infer<typeof submit>) { return this.a.submit(b); }
  @Get() @RequirePermission('applications.view')
  list(@Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.a.list(q, q.status, q.guildId ?? currentGuild() ?? undefined); } // Server getrennt: gewählter Server
  /** Statistik (Filter: Name, Status, Prüfer; Zeitraum in Tagen, verglichen mit der Vorperiode). Server getrennt wie die Liste. */
  @Get('analytics') @RequirePermission('applications.view')
  analytics(@Query(zodBody(analyticsQ)) q: z.infer<typeof analyticsQ>) { return this.stats.overview({ ...q, guildId: currentGuild() }); }
  @Get('history') @RequirePermission('applications.view')
  history(@Query(zodBody(z.object({ discordId: z.string().regex(/^\d{15,25}$/) }))) q: { discordId: string }) { return this.a.history(q.discordId); }
  @Get(':id') @RequirePermission('applications.view')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.a.get(id); }
  /** Prüfschritte benötigen applications.review; Entscheidungen applications.decide. */
  @Put(':id/status') @RequirePermission('applications.review')
  move(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(move)) b: z.infer<typeof move>) {
    return this.a.transition(a, id, b.status, b.reason);
  }
  @Post(':id/decide') @RequirePermission('applications.decide')
  decide(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ accept: z.boolean(), reason: z.string().trim().min(3).max(1000) }))) b: { accept: boolean; reason: string }) {
    return this.a.transition(a, id, b.accept ? 'ACCEPTED' : 'REJECTED', b.reason);
  }
  /** Annehmen/Ablehnen per Discord-Button (aus jedem offenen Status); optionaler Grund geht per DM an die Person. */
  @Post(':id/discord-decision') @HttpCode(200) @RequirePermission('applications.decide')
  discordDecide(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ status: z.enum(['ACCEPTED', 'REJECTED']), reason: z.string().trim().max(1000).optional() }))) b: { status: 'ACCEPTED' | 'REJECTED'; reason?: string }) {
    return this.a.discordDecide(a, id, b.status, b.reason);
  }
}
