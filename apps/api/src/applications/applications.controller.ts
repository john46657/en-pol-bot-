import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { APPLICATION_STATUSES } from '@enrp/shared';
import { ApplicationsService } from './applications.service';
import { CurrentActor, Public, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { pageQuery } from '../common/pagination';

const submit = z.object({ robloxUsername: z.string().trim().min(1).max(64), robloxUserId: z.string().max(20).optional(), answers: z.record(z.string(), z.union([z.string().max(5000), z.array(z.string().max(100)).max(25)])) });
const move = z.object({ status: z.enum(APPLICATION_STATUSES).refine((s) => s !== 'ACCEPTED' && s !== 'REJECTED', 'Use the decide endpoint.'), reason: z.string().trim().min(3).max(1000).optional() });
const listQ = pageQuery.extend({ status: z.enum(APPLICATION_STATUSES).optional() });

@ApiTags('applications')
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly a: ApplicationsService) {}
  @Public() @Get('form')
  form() { return this.a.form(); }
  @Public() @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 5, ttl: 3_600_000 } }) @Post()
  submit(@Body(zodBody(submit)) b: z.infer<typeof submit>) { return this.a.submit(b); }
  @Get() @RequirePermission('applications.view')
  list(@Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.a.list(q, q.status); }
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
