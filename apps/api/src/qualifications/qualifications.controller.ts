import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { QualificationsService } from './qualifications.service';
import { saveSchema } from './qualifications.config';
import { BotService, CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const discordId = z.string().regex(/^\d{15,25}$/);
const list = z.object({ unit: z.string().max(24).optional(), status: z.enum(['OPEN', 'ACCEPTED', 'REJECTED']).optional() });
const decision = z.object({ status: z.enum(['ACCEPTED', 'REJECTED']), reason: z.string().trim().max(1000).optional() });
const historyQ = z.object({ discordId });
const submit = z.object({ unit: z.string().max(24), discordId, discordName: z.string().trim().min(1).max(100), durationSec: z.number().int().min(0).max(86_400).optional(), joinedAt: z.coerce.date().optional(), answers: z.array(z.object({ question: z.string().max(300), answer: z.union([z.string().max(5000), z.array(z.string().max(100)).max(25)]).nullable() })).min(1).max(50) });
const openQ = z.object({ discordId, unit: z.string().max(24).optional() });

@ApiTags('qualifications')
@Controller('qualifications')
export class QualificationsController {
  constructor(private readonly q: QualificationsService) {}
  /** Panels, Einheiten und die Fragen der Polizei-Bewerbung (`policeForm`). */
  @Get('config') @RequirePermission('qualifications.view')
  config() { return this.q.setup(); }
  @Put('config') @RequirePermission('qualifications.manage')
  save(@CurrentActor() a: Actor, @Body(zodBody(saveSchema)) b: z.infer<typeof saveSchema>) { return this.q.saveConfig(a, b); }
  @Get('applications') @RequirePermission('qualifications.view')
  list(@Query(zodBody(list)) f: z.infer<typeof list>) { return this.q.list(f); }
  @Get('history') @RequirePermission('qualifications.view')
  history(@Query(zodBody(historyQ)) q: z.infer<typeof historyQ>) { return this.q.history(q.discordId); }
  @Get('applications/:id') @RequirePermission('qualifications.view')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.q.get(id); }
  /** Auch vom Bot (Button im Team-Channel) mit den Rechten des klickenden Benutzers. */
  @Post('applications/:id/decision') @HttpCode(200) @RequirePermission('qualifications.decide')
  decide(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(decision)) b: z.infer<typeof decision>) { return this.q.decide(a, id, b.status, b.reason); }
}

/** Dienst-Endpunkte für das Discord-Panel – Bewerben geht auch ohne verknüpftes Konto. */
@ApiTags('bot')
@Controller('bot/qualifications')
export class BotQualificationsController {
  constructor(private readonly q: QualificationsService) {}
  @BotService() @Get() config() { return this.q.config(); }
  @BotService() @Get('open') open(@Query(zodBody(openQ)) f: z.infer<typeof openQ>) { return this.q.openFor(f.discordId, f.unit); }
  @BotService() @Post('applications') submit(@Body(zodBody(submit)) b: z.infer<typeof submit>) { return this.q.submit(b); }
}
