import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CASE_LINK_TYPES, CASE_STATUSES } from '@enrp/shared';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { CasesService } from './cases.service';

const linkType = z.enum(CASE_LINK_TYPES);
const link = z.object({ entityType: linkType, entityId: z.string().uuid(), role: z.string().trim().max(40).nullish(), note: z.string().trim().max(500).nullish() });
const listQ = z.object({
  q: z.string().trim().max(80).optional(), status: z.enum(CASE_STATUSES).optional(), from: z.string().date().optional(), to: z.string().date().optional(),
  incidentNumber: z.string().trim().max(40).optional(), entityType: linkType.optional(), entityId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(200).optional(),
});
const createB = z.object({ title: z.string().trim().min(3).max(200), description: z.string().trim().max(4000).nullish(), links: z.array(link).max(50).optional() });
const updateB = z.object({ version: z.number().int(), title: z.string().trim().min(3).max(200).optional(), description: z.string().trim().max(4000).nullable().optional(), status: z.enum(CASE_STATUSES).optional(), reason: z.string().trim().max(500).optional() });
const decideB = z.object({ keepId: z.string().uuid(), otherId: z.string().uuid(), decision: z.enum(['NOT_DUPLICATE', 'MERGE']), note: z.string().trim().max(500).optional() });

@ApiTags('cases')
@Controller('cases')
export class CasesController {
  constructor(private readonly s: CasesService) {}
  @Get() @RequirePermission('cases.view') list(@CurrentActor() a: Actor, @Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.s.list(a, q); }
  @Get('duplicates') @RequirePermission('cases.manage') duplicates() { return this.s.duplicates(); }
  @Post('duplicates/decide') @HttpCode(200) @RequirePermission('cases.manage') decide(@CurrentActor() a: Actor, @Body(zodBody(decideB)) b: z.infer<typeof decideB>) { return this.s.decideDuplicate(a, b); }
  @Get('for/:type/:id') @RequirePermission('cases.view') forEntity(@Param('type', zodBody(linkType)) type: z.infer<typeof linkType>, @Param('id', ParseUUIDPipe) id: string) { return this.s.forEntity(type, id); }
  @Get(':id') @RequirePermission('cases.view') get(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.get(a, id); }
  @Post() @RequirePermission('cases.manage') create(@CurrentActor() a: Actor, @Body(zodBody(createB)) b: z.infer<typeof createB>) { return this.s.create(a, b); }
  @Patch(':id') @RequirePermission('cases.manage') update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(updateB)) b: z.infer<typeof updateB>) { return this.s.update(a, id, b); }
  @Post(':id/links') @RequirePermission('cases.manage') addLink(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(link)) b: z.infer<typeof link>) { return this.s.addLink(a, id, b); }
  @Delete(':id/links/:linkId') @HttpCode(204) @RequirePermission('cases.manage')
  removeLink(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('linkId', ParseUUIDPipe) linkId: string, @Body(zodBody(z.object({ reason: z.string().trim().min(3, 'Bitte begründen, warum die Verknüpfung gelöst wird.').max(500) }))) b: { reason: string }) { return this.s.removeLink(a, id, linkId, b.reason); }
}
