import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { DANGER_LEVELS, DangerService } from './danger.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const body = z.object({ level: z.enum(DANGER_LEVELS), reason: z.string().trim().max(200).optional() });

@ApiTags('danger')
@Controller('danger-level')
export class DangerController {
  constructor(private readonly d: DangerService) {}
  @Get() @RequirePermission('dashboard.view')
  get() { return this.d.get(); }
  @Put() @RequirePermission('dispatch.manage')
  set(@CurrentActor() a: Actor, @Body(zodBody(body)) b: z.infer<typeof body>) { return this.d.set(a, b.level, b.reason); }
}
