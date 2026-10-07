import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { DUTY_STATUSES } from '@enrp/shared';
import { DutyService } from './duty.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const hoursQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) });
const logQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(7), userId: z.string().uuid().optional(), shiftType: z.string().regex(/^[a-z0-9-]{1,40}$/).optional() });
const body = z.object({ status: z.enum(DUTY_STATUSES), unitId: z.string().uuid().optional(), callsign: z.string().max(16).optional(), shiftType: z.string().regex(/^[a-z0-9-]{1,40}$/).optional() });

@ApiTags('team')
@Controller('team')
export class DutyController {
  constructor(private readonly d: DutyService) {}
  @Get() @RequirePermission('team.view')
  team() { return this.d.team(); }
  @Get('overview') @RequirePermission('team.view')
  overview() { return this.d.overview(); }
  @Get('me') @RequirePermission('team.view')
  mine(@CurrentActor() a: Actor) { return this.d.mine(a.userId!); }
  /** Eigene Dienststunden. */
  @Get('me/hours') @RequirePermission('team.view')
  myHours(@CurrentActor() a: Actor, @Query(zodBody(hoursQuery)) f: z.infer<typeof hoursQuery>) { return this.d.hours(f.days, a.userId!); }
  /** Dienststunden aller Beamten (Schichtleitung). */
  @Get('hours') @RequirePermission('team.manage')
  hours(@Query(zodBody(hoursQuery)) f: z.infer<typeof hoursQuery>) { return this.d.hours(f.days); }
  /** Schicht-Logs: wer wann welche Schicht gestartet/beendet hat (Schichtleitung). */
  @Get('shifts') @RequirePermission('team.manage')
  shiftLog(@Query(zodBody(logQuery)) f: z.infer<typeof logQuery>) { return this.d.shiftLog(f); }
  /** „Bin noch im Dienst“ (Erinnerung) bzw. echte Aktivität im Dashboard/MDT. */
  @Post('me/active') @HttpCode(200) @RequirePermission('team.view')
  active(@CurrentActor() a: Actor) { return this.d.active(a.userId!); }
  @Put('me/status') @RequirePermission('team.view')
  set(@CurrentActor() a: Actor, @Body(zodBody(body)) b: z.infer<typeof body>) { return this.d.setStatus(a, b.status, b); }

  /** Muss NACH `me/status` stehen, sonst würde `:userId` den Pfad `me` verschlucken. */
  @Put(':userId/status') @RequirePermission('team.manage')
  setFor(@CurrentActor() a: Actor, @Param('userId', ParseUUIDPipe) userId: string, @Body(zodBody(body)) b: z.infer<typeof body>) { return this.d.setStatus(a, b.status, b, userId); }
}
