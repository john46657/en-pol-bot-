import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PRIORITIES, WANTED_STATUSES } from '@enrp/shared';
import { WantedService } from './wanted.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { pageQuery } from '../common/pagination';

const create = z.object({ personId: z.string().uuid().optional(), vehicleId: z.string().uuid().optional(), reason: z.string().trim().min(3).max(500), description: z.string().max(5000).optional(), priority: z.enum(PRIORITIES).optional(), expiresAt: z.coerce.date().optional() });
const reason = z.object({ reason: z.string().trim().min(3).max(500) });
const listQ = pageQuery.extend({ status: z.enum(WANTED_STATUSES).optional() });

@ApiTags('wanted')
@Controller('wanted')
export class WantedController {
  constructor(private readonly w: WantedService) {}
  @Get() @RequirePermission('wanted.view')
  list(@Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.w.list(q, q.status); }
  @Get(':id') @RequirePermission('wanted.view')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.w.get(id); }
  @Post() @RequirePermission('wanted.create')
  create(@CurrentActor() a: Actor, @Body(zodBody(create)) b: z.infer<typeof create>) { return this.w.create(a, b); }
  @Post(':id/activate') @RequirePermission('wanted.activate')
  activate(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(reason)) b: z.infer<typeof reason>) { return this.w.setStatus(a, id, 'ACTIVE', b.reason); }
  @Post(':id/clear') @RequirePermission('wanted.clear')
  clear(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(reason)) b: z.infer<typeof reason>) { return this.w.setStatus(a, id, 'CLEARED', b.reason); }
  @Post(':id/cancel') @RequirePermission('wanted.edit')
  cancel(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(reason)) b: z.infer<typeof reason>) { return this.w.setStatus(a, id, 'CANCELLED', b.reason); }
  @Post(':id/archive') @RequirePermission('wanted.edit')
  archive(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(reason)) b: z.infer<typeof reason>) { return this.w.setStatus(a, id, 'ARCHIVED', b.reason); }
}
