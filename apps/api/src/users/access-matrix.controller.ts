import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ACCESS_AREAS, ACCESS_LEVELS, type AccessArea, type AccessLevel } from '@enrp/shared';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { AccessMatrixService } from './access-matrix.service';

const area = z.enum(ACCESS_AREAS as [AccessArea, ...AccessArea[]]);
const level = z.enum(ACCESS_LEVELS);

/** Zentraler Berechtigungseditor: Matrix Rolle × Bereich × Zugriffsstufe. */
@ApiTags('roles')
@Controller('access-matrix')
export class AccessMatrixController {
  constructor(private readonly s: AccessMatrixService) {}
  @Get() @RequirePermission('roles.view') matrix() { return this.s.matrix(); }
  @Get('preview') @RequirePermission('roles.view')
  preview(@Query(zodBody(z.object({ roleId: z.string().uuid(), area, level }))) q: { roleId: string; area: AccessArea; level: AccessLevel }) { return this.s.preview(q.roleId, q.area, q.level); }
  @Put('roles/:roleId/:area') @RequirePermission('roles.manage')
  set(@CurrentActor() a: Actor, @Param('roleId', ParseUUIDPipe) roleId: string, @Param('area', zodBody(area)) ar: AccessArea, @Body(zodBody(z.object({ level }))) b: { level: AccessLevel }) { return this.s.setLevel(a, roleId, ar, b.level); }
  @Get('users/:userId') @RequirePermission('users.view') user(@Param('userId', ParseUUIDPipe) id: string) { return this.s.userLevels(id); }
}
