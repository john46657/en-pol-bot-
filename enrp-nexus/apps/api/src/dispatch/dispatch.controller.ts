import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { DISPATCH_STATUSES, PRIORITIES, UNIT_STATUSES } from '@enrp/shared';
import { DispatchService } from './dispatch.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { pageQuery } from '../common/pagination';

const prio = z.enum(PRIORITIES);
const create = z.object({ title: z.string().trim().min(3).max(200), description: z.string().max(5000).optional(), priority: prio.optional(), location: z.string().max(200).optional(), personIds: z.array(z.string().uuid()).max(50).optional(), vehicleIds: z.array(z.string().uuid()).max(50).optional() });
const update = z.object({ version: z.number().int(), title: z.string().trim().min(3).max(200).optional(), description: z.string().max(5000).optional(), priority: prio.optional(), location: z.string().max(200).optional(), supervisorId: z.string().uuid().nullable().optional() });
const status = z.object({ status: z.enum(DISPATCH_STATUSES), note: z.string().max(500).optional() });
const listQ = pageQuery.extend({ status: z.enum(DISPATCH_STATUSES).optional(), active: z.coerce.boolean().optional() });
const attach = z.object({ personIds: z.array(z.string().uuid()).optional(), vehicleIds: z.array(z.string().uuid()).optional() });
const unit = z.object({ callsign: z.string().trim().min(2).max(16), vehicle: z.string().max(64).optional(), notes: z.string().max(1000).optional(), memberIds: z.array(z.string().uuid()).optional() });

@ApiTags('incidents')
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly d: DispatchService) {}
  @Get() @RequirePermission('incidents.view')
  list(@Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.d.list(q, q.status, q.active); }
  @Get(':id') @RequirePermission('incidents.view')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.d.get(id); }
  @Post() @RequirePermission('incidents.create')
  create(@CurrentActor() a: Actor, @Body(zodBody(create)) b: z.infer<typeof create>) { return this.d.create(a, b); }
  @Patch(':id') @RequirePermission('incidents.edit')
  update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(update)) b: z.infer<typeof update>) { const { version, ...r } = b; return this.d.update(a, id, version, r); }
  @Post(':id/attach') @RequirePermission('incidents.edit')
  attach(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(attach)) b: z.infer<typeof attach>) { return this.d.attachRecords(a, id, b); }
}

@ApiTags('dispatch')
@Controller('dispatch')
export class DispatchController {
  constructor(private readonly d: DispatchService) {}
  @Get('units') @RequirePermission('dispatch.view')
  units() { return this.d.listUnits(); }
  @Post('units') @RequirePermission('dispatch.manage')
  createUnit(@CurrentActor() a: Actor, @Body(zodBody(unit)) b: z.infer<typeof unit>) { return this.d.createUnit(a, b); }
  @Put('units/:id/status') @RequirePermission('dispatch.edit')
  unitStatus(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ status: z.enum(UNIT_STATUSES) }))) b: { status: (typeof UNIT_STATUSES)[number] }) { return this.d.setUnitStatus(a, id, b.status); }
  @Put('units/:id/members') @RequirePermission('dispatch.assign')
  members(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ userIds: z.array(z.string().uuid()).max(20) }))) b: { userIds: string[] }) { return this.d.setUnitMembers(a, id, b.userIds); }
  @Post('incidents/:id/assign') @RequirePermission('dispatch.assign')
  assign(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ unitId: z.string().uuid() }))) b: { unitId: string }) { return this.d.assignUnit(a, id, b.unitId); }
  @Put('incidents/:id/status') @RequirePermission('dispatch.edit')
  setStatus(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(status)) b: z.infer<typeof status>) { return this.d.setStatus(a, id, b.status, b.note); }
  @Post('incidents/:id/close') @RequirePermission('dispatch.close')
  close(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.d.setStatus(a, id, 'CLOSED'); }
}
