import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { INVESTIGATION_STATUSES } from '@enrp/shared';
import { INVESTIGATION_ROLES, InvestigationsService } from './investigations.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { pageQuery } from '../common/pagination';

const role = z.enum(INVESTIGATION_ROLES);
const create = z.object({ title: z.string().trim().min(3).max(200), description: z.string().max(10000).optional(), leadId: z.string().uuid().optional(), persons: z.array(z.object({ personId: z.string().uuid(), role })).max(100).optional() });
const addPerson = z.object({ personId: z.string().uuid(), role });
const status = z.object({ status: z.enum(INVESTIGATION_STATUSES).refine((s) => s !== 'CLOSED', 'Use the close endpoint.'), reason: z.string().max(500).optional() });
const listQ = pageQuery.extend({ status: z.enum(INVESTIGATION_STATUSES).optional() });

@ApiTags('investigations')
@Controller('investigations')
export class InvestigationsController {
  constructor(private readonly i: InvestigationsService) {}
  @Get() @RequirePermission('investigations.view')
  list(@Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.i.list(q, q.status); }
  @Get(':id') @RequirePermission('investigations.view')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.i.get(id); }
  @Post() @RequirePermission('investigations.create')
  create(@CurrentActor() a: Actor, @Body(zodBody(create)) b: z.infer<typeof create>) { return this.i.create(a, b); }
  @Post(':id/persons') @RequirePermission('investigations.edit')
  addPerson(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(addPerson)) b: z.infer<typeof addPerson>) { return this.i.addPerson(a, id, b.personId, b.role); }
  @Put(':id/status') @RequirePermission('investigations.edit')
  setStatus(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(status)) b: z.infer<typeof status>) { return this.i.setStatus(a, id, b.status, b.reason); }
  @Post(':id/close') @RequirePermission('investigations.close')
  close(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ reason: z.string().trim().min(3).max(500) }))) b: { reason: string }) { return this.i.setStatus(a, id, 'CLOSED', b.reason); }
}
