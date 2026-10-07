import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { EVIDENCE_CUSTODY_STATES } from '@enrp/shared';
import { EvidenceService } from './evidence.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { pageQuery } from '../common/pagination';

const create = z.object({ type: z.string().trim().min(2).max(64), description: z.string().trim().min(3).max(5000), source: z.string().max(200).optional(), caseRef: z.string().max(40).optional(), storageLocation: z.string().max(200).optional(), personIds: z.array(z.string().uuid()).max(50).optional() });
const transfer = z.object({ to: z.enum(EVIDENCE_CUSTODY_STATES).refine((s) => s !== 'RELEASED', 'Freigeben bitte über die Freigabe-Aktion.'), toUserId: z.string().uuid().optional(), reason: z.string().trim().min(3).max(500), storageLocation: z.string().max(200).optional() });

@ApiTags('evidence')
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly e: EvidenceService) {}
  @Get() @RequirePermission('evidence.view')
  list(@Query(zodBody(pageQuery)) q: z.infer<typeof pageQuery>) { return this.e.list(q); }
  @Get(':id') @RequirePermission('evidence.view')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.e.get(id); }
  @Post() @RequirePermission('evidence.create')
  create(@CurrentActor() a: Actor, @Body(zodBody(create)) b: z.infer<typeof create>) { return this.e.create(a, b); }
  @Post(':id/transfer') @RequirePermission('evidence.transfer')
  transfer(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(transfer)) b: z.infer<typeof transfer>) { return this.e.transfer(a, id, b); }
  @Post(':id/release') @RequirePermission('evidence.release')
  release(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ reason: z.string().trim().min(3).max(500) }))) b: { reason: string }) { return this.e.transfer(a, id, { to: 'RELEASED', reason: b.reason }); }
  @Post(':id/confirm') @RequirePermission('evidence.transfer')
  confirm(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.e.confirm(a, id); }
}
