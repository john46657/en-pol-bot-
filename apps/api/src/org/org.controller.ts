import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { orgUnitSchema, type OrgUnitInput } from '@enrp/shared';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { OrgService } from './org.service';

const uuid = z.string().uuid();
const updateSchema = orgUnitSchema.partial().extend({ version: z.number().int().optional() });

/** Organigramm (Dashboard-Editor, MDT-/Leitstellen-Übersicht, Bot). */
@ApiTags('org')
@Controller('org')
export class OrgController {
  constructor(private readonly s: OrgService) {}
  @Get('units') @RequirePermission('org.view')
  units(@Query(zodBody(z.object({ inactive: z.enum(['1', '0']).optional() }))) q: { inactive?: string }) { return this.s.structure({ includeInactive: q.inactive === '1' }); }
  /** Führungsstruktur ohne Mitgliederlisten (MDT, Leitstelle, Bot) */
  @Get('summary') @RequirePermission('org.view') summary() { return this.s.summary(); }
  @Get('units/:id') @RequirePermission('org.view') detail(@Param('id', ParseUUIDPipe) id: string) { return this.s.detail(id); }
  @Get('people/:personnelId') @RequirePermission('org.view') unitsOf(@Param('personnelId', ParseUUIDPipe) id: string) { return this.s.unitsOf(id); }

  @Post('units') @RequirePermission('org.edit') create(@CurrentActor() a: Actor, @Body(zodBody(orgUnitSchema)) b: OrgUnitInput) { return this.s.create(a, b); }
  @Patch('units/:id') @RequirePermission('org.edit') update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(updateSchema)) b: z.infer<typeof updateSchema>) { return this.s.update(a, id, b); }
  @Post('units/:id/deactivate') @HttpCode(200) @RequirePermission('org.edit') deactivate(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.setActive(a, id, false); }
  @Post('units/:id/activate') @HttpCode(200) @RequirePermission('org.edit') activate(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.setActive(a, id, true); }
  @Post('units/:id/members') @RequirePermission('org.edit')
  assign(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ personnelId: uuid, function: z.string().trim().max(80).nullable().optional() }))) b: { personnelId: string; function?: string | null }) { return this.s.assign(a, id, b); }
  @Delete('units/:id/members/:personnelId') @HttpCode(200) @RequirePermission('org.edit')
  unassign(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('personnelId', ParseUUIDPipe) pid: string) { return this.s.unassign(a, id, pid); }
  @Post('import-departments') @HttpCode(200) @RequirePermission('org.hierarchy')
  importDepartments(@CurrentActor() a: Actor, @Body(zodBody(z.object({ parentId: uuid.nullable().optional() }))) b: { parentId?: string | null }) { return this.s.importDepartments(a, b.parentId); }
}
