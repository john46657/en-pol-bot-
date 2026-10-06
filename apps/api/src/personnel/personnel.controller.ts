import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PersonnelService } from './personnel.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { pageQuery } from '../common/pagination';

const create = z.object({ userId: z.string().uuid(), rank: z.string().max(64).optional(), team: z.string().max(64).optional(), office: z.string().max(64).optional(), serviceNumber: z.string().trim().min(1).max(16).optional(), callsign: z.string().trim().min(2).max(16).optional(), qualifications: z.array(z.string().max(64)).max(50).optional() });
const update = z.object({ team: z.string().max(64).optional(), office: z.string().max(64).nullable().optional(), serviceNumber: z.string().trim().min(1).max(16).nullable().optional(), callsign: z.string().trim().min(2).max(16).optional(), employmentStatus: z.enum(['ACTIVE', 'LOA', 'SUSPENDED', 'RESIGNED', 'TERMINATED']).optional(), qualifications: z.array(z.string().max(64)).max(50).optional() });
const promote = z.object({ rank: z.string().trim().min(2).max(64), reason: z.string().trim().min(3).max(1000) });
const record = z.object({ type: z.enum(['AWARD', 'DISCIPLINE', 'NOTE']), summary: z.string().trim().min(3).max(300), details: z.string().max(5000).optional() });

@ApiTags('personnel')
@Controller('personnel')
export class PersonnelController {
  constructor(private readonly p: PersonnelService) {}
  @Get() @RequirePermission('personnel.view')
  list(@Query(zodBody(pageQuery)) q: z.infer<typeof pageQuery>) { return this.p.list(q); }
  @Get(':id') @RequirePermission('personnel.view')
  get(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.p.get(a, id); }
  @Post() @RequirePermission('personnel.create')
  create(@CurrentActor() a: Actor, @Body(zodBody(create)) b: z.infer<typeof create>) { return this.p.create(a, b); }
  @Patch(':id') @RequirePermission('personnel.edit')
  update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(update)) b: z.infer<typeof update>) { return this.p.update(a, id, b); }
  @Post(':id/promote') @RequirePermission('personnel.promote')
  promote(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(promote)) b: z.infer<typeof promote>) { return this.p.promote(a, id, b.rank, b.reason); }
  @Post(':id/records') @RequirePermission('personnel.discipline')
  record(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(record)) b: z.infer<typeof record>) { return this.p.addRecord(a, id, b); }
}
