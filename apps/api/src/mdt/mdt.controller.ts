import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { mdtConfigSchema, personDetailsSchema } from '@enrp/shared';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { pageQuery } from '../common/pagination';
import { MdtService } from './mdt.service';

const citizenQ = pageQuery.extend({ flag: z.string().max(32).optional() });
const citizenUpdate = personDetailsSchema.extend({ version: z.number().int(), notes: z.string().max(5000).nullish() });

/** Polizei-MDT (Streifen-Terminal): Bürger, Fahrzeuge, Haftbefehle. Gleiche Akten und Rechte wie im Dashboard. */
@ApiTags('mdt')
@Controller('mdt')
export class MdtController {
  constructor(private readonly s: MdtService) {}

  @Get('config') @RequirePermission('dashboard.view')
  config() { return this.s.config(); }
  @Put('config') @RequirePermission('settings.manage')
  saveConfig(@CurrentActor() a: Actor, @Body(zodBody(mdtConfigSchema.partial())) b: Partial<z.infer<typeof mdtConfigSchema>>) { return this.s.saveConfig(a, b); }

  @Get('citizens') @RequirePermission('persons.view')
  citizens(@Query(zodBody(citizenQ)) q: z.infer<typeof citizenQ>) { return this.s.citizens(q); }
  @Get('citizens/:id') @RequirePermission('persons.view')
  citizen(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.profile(a, id); }
  @Get('citizens/:id/roblox') @RequirePermission('persons.view')
  citizenRoblox(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.robloxProfile(a, id); }
  @Patch('citizens/:id') @RequirePermission('persons.edit')
  updateCitizen(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(citizenUpdate)) b: z.infer<typeof citizenUpdate>) {
    const { version, ...rest } = b;
    return this.s.updateCitizen(a, id, version, rest);
  }
  @Post('citizens/:id/photo') @RequirePermission('persons.edit') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } }))
  photo(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined) { return this.s.setPhoto(a, id, file); }

  @Get('vehicles') @RequirePermission('vehicles.view')
  vehicles(@Query(zodBody(pageQuery)) q: z.infer<typeof pageQuery>) { return this.s.vehicles(q); }
  @Get('vehicles/:id') @RequirePermission('vehicles.view')
  vehicle(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.vehicle(a, id); }

  @Get('warrants') @RequirePermission('wanted.view')
  warrants(@Query(zodBody(z.object({ status: z.enum(['ACTIVE', 'ALL']).optional() }))) q: { status?: 'ACTIVE' | 'ALL' }) { return this.s.warrants(q.status ?? 'ACTIVE'); }
}
