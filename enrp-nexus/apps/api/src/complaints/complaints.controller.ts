import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { COMPLAINT_STATUSES } from '@enrp/shared';
import { ComplaintsService } from './complaints.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { pageQuery } from '../common/pagination';

const create = z.object({ complainantId: z.string().uuid().optional(), subjectId: z.string().uuid().optional(), officerId: z.string().uuid().optional(), category: z.string().trim().min(2).max(64), description: z.string().trim().min(10).max(10000) });
const assign = z.object({ investigatorId: z.string().uuid() });
const note = z.object({ findings: z.string().max(10000).optional(), internalNotes: z.string().max(10000).optional() });
const resolve = z.object({ resolution: z.string().trim().min(3).max(5000), findings: z.string().max(10000).optional() });
const listQ = pageQuery.extend({ status: z.enum(COMPLAINT_STATUSES).optional() });

@ApiTags('complaints')
@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly c: ComplaintsService) {}
  @Get() @RequirePermission('complaints.view')
  list(@CurrentActor() a: Actor, @Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.c.list(a, q, q.status); }
  @Get(':id') @RequirePermission('complaints.view')
  get(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.c.get(a, id); }
  @Post() @RequirePermission('complaints.create')
  create(@CurrentActor() a: Actor, @Body(zodBody(create)) b: z.infer<typeof create>) { return this.c.create(a, b); }
  @Post(':id/screen') @RequirePermission('complaints.assign')
  screen(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.c.transition(a, id, 'SCREENING'); }
  @Post(':id/assign') @RequirePermission('complaints.assign')
  assign(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(assign)) b: z.infer<typeof assign>) { return this.c.transition(a, id, 'ASSIGNED', b); }
  @Post(':id/investigate') @RequirePermission('complaints.investigate')
  investigate(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(note)) b: z.infer<typeof note>) { return this.c.transition(a, id, 'INVESTIGATION', b); }
  @Post(':id/review') @RequirePermission('complaints.investigate')
  review(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(note)) b: z.infer<typeof note>) { return this.c.transition(a, id, 'REVIEW', b); }
  @Post(':id/resolve') @RequirePermission('complaints.resolve')
  resolve(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(resolve)) b: z.infer<typeof resolve>) { return this.c.transition(a, id, 'RESOLVED', b); }
  @Post(':id/close') @RequirePermission('complaints.close')
  close(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.c.transition(a, id, 'CLOSED'); }
}
