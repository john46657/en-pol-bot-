import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { ForecastService } from './forecast.service';

const q = z.object({ weeks: z.coerce.number().int().min(2).max(52).default(8), minStaff: z.coerce.number().min(0.5).max(50).default(2), department: z.string().trim().max(64).optional() });

@ApiTags('forecast')
@Controller('forecast')
export class ForecastController {
  constructor(private readonly s: ForecastService) {}
  @Get() @RequirePermission('forecast.view') get(@CurrentActor() a: Actor, @Query(zodBody(q)) query: z.infer<typeof q>) { return this.s.forecast(a, query); }
}
