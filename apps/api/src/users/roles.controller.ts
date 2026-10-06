import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { RolesService } from './roles.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const discordId = z.string().regex(/^\d{15,25}$/, 'Discord role ID (15–25 digits)');
const fields = {
  description: z.string().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  icon: z.string().trim().max(32).nullable().optional(),
  active: z.boolean().optional(),
  priority: z.number().int().min(1).max(100_000).optional(),
  discordRoleIds: z.array(discordId).max(25).optional(),
};
const createRole = z.object({ name: z.string().trim().min(2).max(64), guildId: z.string().regex(/^\d{15,25}$/).nullable().optional(), ...fields });
const updateRole = z.object({ name: z.string().trim().min(2).max(64).optional(), ...fields });
const grants = z.object({ grants: z.array(z.object({ permission: z.string(), effect: z.enum(['ALLOW', 'DENY']) })).max(500) });
const single = z.object({ permission: z.string().max(80), effect: z.enum(['ALLOW', 'DENY', 'NONE']) });
const order = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });
const dup = z.object({ name: z.string().trim().min(2).max(64).optional() });

@ApiTags('roles')
@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('roles') @RequirePermission('roles.view')
  list() { return this.roles.list(); }

  @Get('roles/my-rank') @RequirePermission('roles.view')
  myRank(@CurrentActor() a: Actor) { return this.roles.myRank(a.userId!); }

  @Get('permissions') @RequirePermission('roles.view')
  catalog() { return this.roles.catalog(); }

  @Post('roles') @RequirePermission('roles.manage')
  create(@CurrentActor() a: Actor, @Body(zodBody(createRole)) b: z.infer<typeof createRole>) { return this.roles.create(a, b); }

  @Put('roles/order') @RequirePermission('roles.manage')
  reorder(@CurrentActor() a: Actor, @Body(zodBody(order)) b: z.infer<typeof order>) { return this.roles.reorder(a, b.ids); }

  @Patch('roles/:id') @RequirePermission('roles.manage')
  update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(updateRole)) b: z.infer<typeof updateRole>) { return this.roles.update(a, id, b); }

  @Delete('roles/:id') @HttpCode(204) @RequirePermission('roles.manage')
  remove(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.roles.remove(a, id); }

  @Post('roles/:id/duplicate') @RequirePermission('roles.manage')
  duplicate(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(dup)) b: z.infer<typeof dup>) { return this.roles.duplicate(a, id, b.name); }

  @Put('roles/:id/permissions') @RequirePermission('roles.manage')
  setPermissions(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(grants)) b: z.infer<typeof grants>) { return this.roles.setPermissions(a, id, b.grants); }

  @Patch('roles/:id/permissions') @RequirePermission('roles.manage')
  setPermission(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(single)) b: z.infer<typeof single>) { return this.roles.setPermission(a, id, b.permission, b.effect); }
}
