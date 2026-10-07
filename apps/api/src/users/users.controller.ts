import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { UsersService } from './users.service';
import { TwoFactorService } from '../auth/two-factor.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { pageQuery } from '../common/pagination';

const createUser = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
  displayName: z.string().trim().min(1).max(64),
  password: z.string().min(12).max(256),
  email: z.string().email().optional(),
  roleIds: z.array(z.string().uuid()).optional(),
});
const roblox = z.object({ robloxUserId: z.string().nullable(), robloxUsername: z.string().trim().max(64).optional() });
const active = z.object({ active: z.boolean(), reason: z.string().max(500).optional() });
const roles = z.object({ roleIds: z.array(z.string().uuid()) });
const override = z.object({ permission: z.string(), effect: z.enum(['ALLOW', 'DENY']), reason: z.string().max(500).optional() });

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService, private readonly twoFactor: TwoFactorService) {}

  @Get() @RequirePermission('users.view')
  list(@Query(zodBody(pageQuery)) q: z.infer<typeof pageQuery>) { return this.users.list(q); }

  @Get(':id') @RequirePermission('users.view')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.users.get(id); }

  @Post() @RequirePermission('users.manage')
  create(@CurrentActor() a: Actor, @Body(zodBody(createUser)) b: z.infer<typeof createUser>) { return this.users.create(a, b); }

  @Put(':id/roblox') @RequirePermission('users.manage')
  setRoblox(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(roblox)) b: z.infer<typeof roblox>) { return this.users.setRoblox(a, id, b); }

  @Put(':id/active') @RequirePermission('users.manage')
  setActive(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(active)) b: z.infer<typeof active>) { return this.users.setActive(a, id, b.active, b.reason); }

  /** Zwei-Faktor eines Kontos zurücksetzen (Handy verloren, keine Wiederherstellungscodes). */
  @Post(':id/2fa/reset') @HttpCode(204) @RequirePermission('users.manage')
  async resetTwoFactor(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { await this.twoFactor.adminReset(a, id); }

  @Put(':id/roles') @RequirePermission('roles.manage')
  setRoles(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(roles)) b: z.infer<typeof roles>) { return this.users.setRoles(a, id, b.roleIds); }

  @Put(':id/overrides') @RequirePermission('roles.manage')
  setOverride(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(override)) b: z.infer<typeof override>) { return this.users.setOverride(a, id, b); }

  @Delete(':id/overrides/:permission') @HttpCode(204) @RequirePermission('roles.manage')
  removeOverride(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('permission') p: string) { return this.users.removeOverride(a, id, p); }
}
