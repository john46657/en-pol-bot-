import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { dangerConfigSchema, DangerService } from './danger.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const body = z.object({ level: z.string().trim().min(1).max(40), reason: z.string().trim().max(200).optional() });

@ApiTags('danger')
@Controller('danger-level')
export class DangerController {
  constructor(private readonly d: DangerService) {}
  @Get() @RequirePermission('dashboard.view')
  get() { return this.d.get(); }
  @Put() @RequirePermission('dispatch.manage')
  set(@CurrentActor() a: Actor, @Body(zodBody(body)) b: z.infer<typeof body>) { return this.d.set(a, b.level, b.reason); }
  /** Stufen, Texte, Farben, Buttons und Pings (Dashboard). */
  @Get('config') @RequirePermission('dashboard.view')
  config() { return this.d.config(); }
  @Put('config') @RequirePermission('settings.manage')
  saveConfig(@CurrentActor() a: Actor, @Body(zodBody(dangerConfigSchema)) b: z.infer<typeof dangerConfigSchema>) { return this.d.saveConfig(a, b); }
}
