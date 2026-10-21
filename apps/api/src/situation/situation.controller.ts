import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { SituationService } from './situation.service';

@ApiTags('situation')
@Controller('situation')
export class SituationController {
  constructor(private readonly s: SituationService) {}
  @Get() @RequirePermission('situation.view') overview(@CurrentActor() a: Actor) { return this.s.overview(a); }
  @Get('reports') @RequirePermission('situation.view') reports() { return this.s.listReports(); }
  @Get('reports/:id') @RequirePermission('situation.view') report(@Param('id', ParseUUIDPipe) id: string) { return this.s.getReport(id); }
  @Post('reports') @RequirePermission('situation.create')
  create(@CurrentActor() a: Actor, @Body(zodBody(z.object({ note: z.string().trim().max(2000).nullish() }))) b: { note?: string | null }) { return this.s.createReport(a, b.note ?? null); }
}
