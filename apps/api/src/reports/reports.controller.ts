import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { REPORT_STATUSES, REPORT_TYPES } from '@enrp/shared';
import { ReportsService } from './reports.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { pageQuery } from '../common/pagination';

const content = z.record(z.string(), z.unknown());
const create = z.object({ type: z.enum(REPORT_TYPES), title: z.string().trim().min(3).max(200), content, incidentId: z.string().uuid().optional(), personIds: z.array(z.string().uuid()).max(50).optional() });
const edit = z.object({ version: z.number().int(), title: z.string().trim().min(3).max(200).optional(), content, changeSummary: z.string().trim().min(3).max(300) });
const reason = z.object({ reason: z.string().trim().min(3).max(1000).optional() });
const listQ = pageQuery.extend({ status: z.enum(REPORT_STATUSES).optional() });

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly r: ReportsService) {}
  @Get() @RequirePermission('reports.view')
  list(@CurrentActor() a: Actor, @Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.r.list(a, q, q.status); }
  @Get(':id') @RequirePermission('reports.view')
  get(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.r.get(a, id); }
  @Post() @RequirePermission('reports.create')
  create(@CurrentActor() a: Actor, @Body(zodBody(create)) b: z.infer<typeof create>) { return this.r.create(a, b as never); }
  @Patch(':id') @RequirePermission('reports.create')
  edit(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(edit)) b: z.infer<typeof edit>) { return this.r.edit(a, id, b as never); }
  @Post(':id/submit') @RequirePermission('reports.submit')
  submit(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.r.transition(a, id, 'SUBMITTED'); }
  @Post(':id/start-review') @RequirePermission('reports.review')
  review(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.r.transition(a, id, 'UNDER_REVIEW'); }
  @Post(':id/approve') @RequirePermission('reports.approve')
  approve(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.r.transition(a, id, 'APPROVED'); }
  @Post(':id/reject') @RequirePermission('reports.reject')
  reject(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(reason)) b: z.infer<typeof reason>) { return this.r.transition(a, id, 'REJECTED', b.reason); }
  @Post(':id/archive') @RequirePermission('reports.archive')
  archive(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.r.transition(a, id, 'ARCHIVED'); }
}
