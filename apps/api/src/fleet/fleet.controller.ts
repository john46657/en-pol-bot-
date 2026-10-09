import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { fleetConfigSchema, fleetInternalSchema, fleetModelSchema, type FleetInternalInput, type FleetModelInput } from '@enrp/shared';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { FleetService } from './fleet.service';

/** Polizeifahrzeuge: Live-Liste (ER:LC), Details, interne Daten, Modellkatalog, Einstellungen. Alle Rechte serverseitig. */
@ApiTags('fleet')
@Controller('fleet')
export class FleetController {
  constructor(private readonly s: FleetService) {}

  @Get('config') @RequirePermission('fleet.view')
  config() { return this.s.config(); }
  @Put('config') @RequirePermission('fleet.manage')
  saveConfig(@CurrentActor() a: Actor, @Body(zodBody(fleetConfigSchema.partial())) b: Partial<z.infer<typeof fleetConfigSchema>>) { return this.s.saveConfig(a, b); }

  @Get('vehicles') @RequirePermission('fleet.view')
  list(@Query(zodBody(z.object({ active: z.enum(['active', 'inactive', 'all']).optional(), serverId: z.string().uuid().optional() }))) q: { active?: 'active' | 'inactive' | 'all'; serverId?: string }) { return this.s.list(q); }
  @Get('vehicles/:id') @RequirePermission('fleet.view_details')
  get(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.get(a, id); }
  /** Interne Felder; Einheit braucht zusätzlich fleet.assign, alles andere fleet.edit (im Service geprüft). */
  @Patch('vehicles/:id') @RequirePermission('fleet.view_details')
  update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(fleetInternalSchema.extend({ version: z.number().int().optional() }))) b: FleetInternalInput & { version?: number }) {
    const { version, ...rest } = b;
    return this.s.updateInternal(a, id, version, rest);
  }
  @Post('vehicles/:id/incidents') @HttpCode(200) @RequirePermission('fleet.edit')
  incident(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ incidentId: z.string().uuid(), note: z.string().trim().max(500).nullish() }))) b: { incidentId: string; note?: string | null }) { return this.s.documentIncident(a, id, b.incidentId, b.note); }

  @Get('catalog') @RequirePermission('fleet.view')
  catalog() { return this.s.catalog(); }
  @Get('catalog/suggestions') @RequirePermission('fleet.manage_catalog')
  suggestions() { return this.s.suggestions(); }
  @Post('catalog') @RequirePermission('fleet.manage_catalog')
  createModel(@CurrentActor() a: Actor, @Body(zodBody(fleetModelSchema)) b: FleetModelInput) { return this.s.createModel(a, b); }
  @Patch('catalog/:id') @RequirePermission('fleet.manage_catalog')
  updateModel(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(fleetModelSchema.partial())) b: Partial<FleetModelInput>) { return this.s.updateModel(a, id, b); }
  @Delete('catalog/:id') @HttpCode(204) @RequirePermission('fleet.manage_catalog')
  deleteModel(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.deleteModel(a, id); }
  @Post('catalog/:id/image') @RequirePermission('fleet.manage_catalog') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  image(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined) { return this.s.setModelImage(a, id, file); }
}
