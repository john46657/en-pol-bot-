import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { VehiclesService } from './vehicles.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { pageQuery } from '../common/pagination';

const create = z.object({ plate: z.string().trim().min(2).max(16), model: z.string().max(64).optional(), color: z.string().max(32).optional(), ownerId: z.string().uuid().optional(), notes: z.string().max(2000).optional(), erlcReference: z.string().max(64).optional(), custom: z.record(z.string(), z.unknown()).optional() });
const archive = z.object({ reason: z.string().trim().min(3).max(500) });

@ApiTags('vehicles')
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get() @RequirePermission('vehicles.view')
  list(@Query(zodBody(pageQuery)) q: z.infer<typeof pageQuery>) { return this.vehicles.list(q); }

  @Get(':id') @RequirePermission('vehicles.view')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.vehicles.get(id); }

  @Post() @RequirePermission('vehicles.create')
  create(@CurrentActor() a: Actor, @Body(zodBody(create)) b: z.infer<typeof create>) { return this.vehicles.create(a, b); }

  @Post(':id/archive') @RequirePermission('vehicles.archive')
  archive(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(archive)) b: z.infer<typeof archive>) { return this.vehicles.archive(a, id, b.reason); }
}
