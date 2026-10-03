import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { RolesService } from './roles.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const createRole = z.object({ name: z.string().trim().min(2).max(64), description: z.string().max(500).optional() });
const grants = z.object({ grants: z.array(z.object({ permission: z.string(), effect: z.enum(['ALLOW', 'DENY']) })).max(500) });

@ApiTags('roles')
@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('roles') @RequirePermission('roles.view')
  list() { return this.roles.list(); }

  @Get('permissions') @RequirePermission('roles.view')
  catalog() { return this.roles.catalog(); }

  @Post('roles') @RequirePermission('roles.manage')
  create(@CurrentActor() a: Actor, @Body(zodBody(createRole)) b: z.infer<typeof createRole>) { return this.roles.create(a, b); }

  @Put('roles/:id/permissions') @RequirePermission('roles.manage')
  setPermissions(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(grants)) b: z.infer<typeof grants>) { return this.roles.setPermissions(a, id, b.grants); }
}
