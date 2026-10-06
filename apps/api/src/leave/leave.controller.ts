import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { LEAVE_STATUSES, leaveConfigSchema, LeaveService, type LeaveConfig } from './leave.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const requestBody = z.object({ startsAt: z.coerce.date(), endsAt: z.coerce.date(), reason: z.string().trim().min(3).max(1000), guildId: z.string().regex(/^\d{15,25}$/).optional() });
const listQ = z.object({ status: z.enum([...LEAVE_STATUSES, 'ACTIVE', 'UPCOMING', 'ALL']).optional(), mine: z.enum(['true', 'false']).optional() });
const decision = z.object({ status: z.enum(['APPROVED', 'DENIED']), reason: z.string().trim().max(1000).optional() });

/** Abmeldungen (Leave of Absences). Beantragen: leave.request · alle sehen: leave.view · entscheiden: leave.manage. */
@ApiTags('leave')
@Controller('leave')
export class LeaveController {
  constructor(private readonly s: LeaveService) {}
  @Get('config') @RequirePermission('team.view')
  config() { return this.s.config(); }
  @Put('config') @RequirePermission('settings.manage')
  saveConfig(@CurrentActor() a: Actor, @Body(zodBody(leaveConfigSchema)) b: LeaveConfig) { return this.s.saveConfig(a, b); }
  @Get() @RequirePermission('leave.request')
  list(@CurrentActor() a: Actor, @Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.s.list(a, { status: q.status, mine: q.mine === 'true' }); }
  @Post() @RequirePermission('leave.request')
  request(@CurrentActor() a: Actor, @Body(zodBody(requestBody)) b: z.infer<typeof requestBody>) { return this.s.request(a, b); }
  @Post(':id/decision') @HttpCode(200) @RequirePermission('leave.manage')
  decide(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(decision)) b: z.infer<typeof decision>) { return this.s.decide(a, id, b.status, b.reason); }
  /** Eigene zurückziehen; Leitung (leave.manage) kann jede beenden. */
  @Post(':id/cancel') @HttpCode(200) @RequirePermission('leave.request')
  cancel(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.cancel(a, id); }
}
