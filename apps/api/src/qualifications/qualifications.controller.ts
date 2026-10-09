import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { QualificationsService } from './qualifications.service';
import { saveSchema } from './qualifications.config';
import { WebApplyService } from './web-apply.service';
import { BotService, CurrentActor, Public, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const discordId = z.string().regex(/^\d{15,25}$/);
const list = z.object({ unit: z.string().max(24).optional(), status: z.enum(['OPEN', 'ACCEPTED', 'REJECTED', 'WITHDRAWN']).optional(), guildId: z.string().regex(/^\d{15,25}$/).optional() });
const decision = z.object({ status: z.enum(['ACCEPTED', 'REJECTED']), reason: z.string().trim().max(1000).optional() });
const historyQ = z.object({ discordId });
const submit = z.object({ guildId: z.string().regex(/^\d{15,25}$/).optional(), unit: z.string().max(24), discordId, discordName: z.string().trim().min(1).max(100), durationSec: z.number().int().min(0).max(86_400).optional(), joinedAt: z.coerce.date().optional(), answers: z.array(z.object({ question: z.string().max(300), answer: z.union([z.string().max(5000), z.array(z.string().max(100)).max(25)]).nullable() })).min(1).max(50) });
const openQ = z.object({ discordId, unit: z.string().max(24).optional() });
const webLink = z.object({ unit: z.string().max(24), discordId, discordName: z.string().trim().min(1).max(100), guildId: z.string().regex(/^\d{15,25}$/).optional(), joinedAt: z.coerce.date().optional() });
const token = z.string().regex(/^[\w-]{60,2000}$/, 'Ungültiger Bewerbungslink.');
const webSubmit = z.object({ robloxUsername: z.string().trim().max(64).optional(), answers: z.record(z.string(), z.union([z.string().max(5000), z.array(z.string().max(100)).max(25)])) });

const guildQ = z.object({ guildId: z.string().regex(/^\d{15,25}$/).optional() });
const guildRequired = z.object({ guildId: z.string().regex(/^\d{15,25}$/) });
@ApiTags('qualifications')
@Controller('qualifications')
export class QualificationsController {
  constructor(private readonly q: QualificationsService) {}
  /** Panels, Einheiten und die Fragen der Polizei-Bewerbung (`policeForm`). */
  /** `?guildId=` – Einstellungen eines Servers (ohne eigene: die gemeinsamen, `own: false`). */
  @Get('config') @RequirePermission('qualifications.view')
  config(@Query(zodBody(guildQ)) q: z.infer<typeof guildQ>) { return this.q.setup(q.guildId); }
  @Put('config') @RequirePermission('qualifications.manage')
  save(@CurrentActor() a: Actor, @Query(zodBody(guildQ)) q: z.infer<typeof guildQ>, @Body(zodBody(saveSchema)) b: z.infer<typeof saveSchema>) { return this.q.saveConfig(a, b, q.guildId); }
  /** Eigene Einstellungen eines Servers entfernen (zurück zur gemeinsamen Grundeinstellung). */
  @Delete('config') @RequirePermission('qualifications.manage')
  reset(@CurrentActor() a: Actor, @Query(zodBody(guildRequired)) q: z.infer<typeof guildRequired>) { return this.q.resetGuild(a, q.guildId); }
  @Get('applications') @RequirePermission('qualifications.view')
  list(@Query(zodBody(list)) f: z.infer<typeof list>) { return this.q.list(f); }
  @Get('history') @RequirePermission('qualifications.view')
  history(@Query(zodBody(historyQ)) q: z.infer<typeof historyQ>) { return this.q.history(q.discordId); }
  @Get('applications/:id') @RequirePermission('qualifications.view')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.q.get(id); }
  /** Auch vom Bot (Button im Team-Channel) mit den Rechten des klickenden Benutzers. */
  @Post('applications/:id/decision') @HttpCode(200) @RequirePermission('qualifications.decide')
  decide(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(decision)) b: z.infer<typeof decision>) { return this.q.decide(a, id, b.status, b.reason); }
  /** „Ticket mit Bewerber öffnen“ (wie der Discord-Button). */
  @Post('applications/:id/ticket') @HttpCode(202) @RequirePermission('qualifications.view')
  ticket(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.q.openTicket(a, id); }
}

/** Dienst-Endpunkte für das Discord-Panel – Bewerben geht auch ohne verknüpftes Konto. */
@ApiTags('bot')
@Controller('bot/qualifications')
export class BotQualificationsController {
  constructor(private readonly q: QualificationsService, private readonly web: WebApplyService) {}
  @BotService() @Get() config(@Query(zodBody(guildQ)) q: z.infer<typeof guildQ>) { return this.q.config(q.guildId); }
  @BotService() @Get('open') open(@Query(zodBody(openQ)) f: z.infer<typeof openQ>) { return this.q.openFor(f.discordId, f.unit); }
  @BotService() @Post('applications') submit(@Body(zodBody(submit)) b: z.infer<typeof submit>) { return this.q.submit(b); }
  /** Bewerbungsart „Web“: persönlicher, signierter Link zum Formular im Browser. */
  @BotService() @Post('web-link') @HttpCode(200) webLink(@Body(zodBody(webLink)) b: z.infer<typeof webLink>) { return this.web.link(b); }
}

/** Öffentliches Bewerbungsformular zu einem Link aus dem Bot (Bewerbungsart „Web“) – ohne Konto. */
@ApiTags('qualifications')
@Controller('web-apply')
export class WebApplyController {
  constructor(private readonly web: WebApplyService) {}
  @Public() @Get(':token') open(@Param('token', zodBody(token)) t: string) { return this.web.open(t); }
  @Public() @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 10, ttl: 600_000 } }) @Post(':token') @HttpCode(201)
  submit(@Param('token', zodBody(token)) t: string, @Body(zodBody(webSubmit)) b: z.infer<typeof webSubmit>) { return this.web.submit(t, b); }
}
