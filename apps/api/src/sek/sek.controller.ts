import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { SekService } from './sek.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const target = z.object({ userId: z.string().uuid().optional(), discordId: z.string().regex(/^\d{15,25}$/).optional() }).refine((v) => !!v.userId !== !!v.discordId, 'Provide exactly one of userId or discordId.');
const report = z.object({ occurredAt: z.coerce.date().optional(), missionType: z.string().trim().min(2).max(100), description: z.string().trim().min(5).max(4000) });
const application = z.object({ serviceTime: z.string().trim().min(1).max(100), motivation: z.string().trim().min(10).max(2000), experience: z.string().trim().max(1000).optional() });
const decision = z.object({ status: z.enum(['ACCEPTED', 'REJECTED']) });
const list = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25) });
const appList = z.object({ status: z.enum(['OPEN', 'ACCEPTED', 'REJECTED']).optional() });

@ApiTags('sek')
@Controller('sek')
export class SekController {
  constructor(private readonly s: SekService) {}

  /** Eigener Stand: Mitglied? offene Bewerbung? (für Web und Bot) */
  @Get('me') @RequirePermission('team.view')
  me(@CurrentActor() a: Actor) { return this.s.me(a.userId!); }

  @Get('members') @RequirePermission('sek.view')
  members() { return this.s.members(); }
  @Post('members') @HttpCode(200) @RequirePermission('sek.manage')
  add(@CurrentActor() a: Actor, @Body(zodBody(target)) b: z.infer<typeof target>) { return this.s.addMember(a, b); }
  @Post('members/remove') @HttpCode(200) @RequirePermission('sek.manage')
  remove(@CurrentActor() a: Actor, @Body(zodBody(target)) b: z.infer<typeof target>) { return this.s.removeMember(a, b); }

  @Get('reports') @RequirePermission('sek.view')
  reports(@Query(zodBody(list)) q: z.infer<typeof list>) { return this.s.reports(q.limit); }
  @Post('reports') @RequirePermission('sek.report')
  createReport(@CurrentActor() a: Actor, @Body(zodBody(report)) b: z.infer<typeof report>) { return this.s.createReport(a, b); }

  /** Bewerben darf jeder Polizeibenutzer. */
  @Post('applications') @RequirePermission('team.view')
  apply(@CurrentActor() a: Actor, @Body(zodBody(application)) b: z.infer<typeof application>) { return this.s.apply(a, b); }
  @Get('applications') @RequirePermission('sek.manage')
  applications(@Query(zodBody(appList)) q: z.infer<typeof appList>) { return this.s.applications(q.status); }
  @Post('applications/:id/decision') @HttpCode(200) @RequirePermission('sek.manage')
  decide(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(decision)) b: z.infer<typeof decision>) { return this.s.decide(a, id, b.status); }
}
