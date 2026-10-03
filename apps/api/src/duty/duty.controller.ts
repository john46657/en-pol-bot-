import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { DUTY_STATUSES } from '@enrp/shared';
import { DutyService } from './duty.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const body = z.object({ status: z.enum(DUTY_STATUSES), unitId: z.string().uuid().optional(), callsign: z.string().max(16).optional() });

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
  @Put('me/status') @RequirePermission('team.view')
  set(@CurrentActor() a: Actor, @Body(zodBody(body)) b: z.infer<typeof body>) { return this.d.setStatus(a, b.status, b); }

  /** Muss NACH `me/status` stehen, sonst würde `:userId` den Pfad `me` verschlucken. */
  @Put(':userId/status') @RequirePermission('team.manage')
  setFor(@CurrentActor() a: Actor, @Param('userId', ParseUUIDPipe) userId: string, @Body(zodBody(body)) b: z.infer<typeof body>) { return this.d.setStatus(a, b.status, b, userId); }
}
