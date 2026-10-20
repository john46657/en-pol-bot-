import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { MODULE_KEYS } from '@enrp/shared';
import { BotService, CurrentActor, ServiceAuthorized } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { pageQuery } from '../common/pagination';
import { ServersService } from './servers.service';

const sf = z.string().regex(/^\d{15,25}$/, 'Discord-ID (15–25 Ziffern)');
const version = z.number().int().min(0);
const name = z.string().trim().min(1).max(80);
const createServer = z.object({ guildId: sf, name }).strict();
const patchServer = z.object({ name: name.optional(), status: z.enum(['ACTIVE', 'DISABLED']).optional(), version }).strict();
const member = z.object({ userId: z.string().uuid(), member: z.boolean() }).strict();
const moduleKey = z.string().refine((k) => MODULE_KEYS.includes(k), 'Unbekanntes Modul.');
const patchModule = z.object({ enabled: z.boolean().optional(), settings: z.unknown().optional(), version }).strict();
const roleFields = { description: z.string().max(300).nullable().optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(), icon: z.string().max(40).nullable().optional(), active: z.boolean().optional(), priority: z.number().int().min(2).max(10_000).optional(), discordRoleIds: z.array(sf).max(25).optional() };
const createRole = z.object({ name: z.string().trim().min(2).max(64), ...roleFields }).strict();
const updateRole = z.object({ name: z.string().trim().min(2).max(64).optional(), ...roleFields }).strict();
const grants = z.object({ grants: z.array(z.object({ permission: z.string().max(80), effect: z.enum(['ALLOW', 'DENY']) })).max(500) }).strict();
const mappings = z.object({ mappings: z.array(z.object({ discordRoleId: sf, roleId: z.string().uuid() })).max(200) }).strict();
const auditQuery = pageQuery.extend({ action: z.string().max(60).optional() });

/**
 * Server, Module, Rollen & Rechte je Server. Autorisierung im Service gegen den Server aus dem PFAD
 * (AuthorizationService: Mitgliedschaft, Modul, Recht) – Header oder Body können ihn nicht übersteuern.
 */
@ApiTags('servers')
@ServiceAuthorized()
@Controller('servers')
export class ServersController {
  constructor(private readonly s: ServersService) {}
  @Get() list(@CurrentActor() a: Actor) { return this.s.list(a); }
  @Post() create(@CurrentActor() a: Actor, @Body(zodBody(createServer)) b: z.infer<typeof createServer>) { return this.s.create(a, b); }
  @Get(':serverId') get(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string) { return this.s.access(a, id, 'servers.view'); }
  @Patch(':serverId') patch(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string, @Body(zodBody(patchServer)) b: z.infer<typeof patchServer>) { return this.s.update(a, id, b); }
  @Delete(':serverId') remove(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string) { return this.s.archive(a, id); }

  @Get(':serverId/members') members(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string) { return this.s.members(a, id); }
  @Put(':serverId/members') setMember(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string, @Body(zodBody(member)) b: z.infer<typeof member>) { return this.s.setManualMember(a, id, b.userId, b.member); }

  @Get(':serverId/modules') modules(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string) { return this.s.modules(a, id); }
  @Get(':serverId/modules/:moduleKey') module(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string, @Param('moduleKey', zodBody(moduleKey)) key: string) { return this.s.module(a, id, key); }
  @Patch(':serverId/modules/:moduleKey') patchModule(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string, @Param('moduleKey', zodBody(moduleKey)) key: string, @Body(zodBody(patchModule)) b: z.infer<typeof patchModule>) { return this.s.patchModule(a, id, key, b); }

  @Get(':serverId/roles') roles(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string) { return this.s.listRoles(a, id); }
  @Post(':serverId/roles') createRole(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string, @Body(zodBody(createRole)) b: z.infer<typeof createRole>) { return this.s.createRole(a, id, b); }
  @Patch(':serverId/roles/:roleId') updateRole(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string, @Param('roleId', ParseUUIDPipe) roleId: string, @Body(zodBody(updateRole)) b: z.infer<typeof updateRole>) { return this.s.updateRole(a, id, roleId, b); }
  @Delete(':serverId/roles/:roleId') @HttpCode(204) async deleteRole(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string, @Param('roleId', ParseUUIDPipe) roleId: string) { await this.s.deleteRole(a, id, roleId); }

  @Get(':serverId/permissions') permissions(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string) { return this.s.permissionCatalog(a, id); }
  @Get(':serverId/roles/:roleId/permissions') rolePermissions(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string, @Param('roleId', ParseUUIDPipe) roleId: string) { return this.s.rolePermissions(a, id, roleId); }
  @Put(':serverId/roles/:roleId/permissions') setRolePermissions(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string, @Param('roleId', ParseUUIDPipe) roleId: string, @Body(zodBody(grants)) b: z.infer<typeof grants>) { return this.s.setRolePermissions(a, id, roleId, b.grants); }
  @Get(':serverId/users/:userId/effective-permissions') effective(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) { return this.s.effective(a, id, userId); }

  @Get(':serverId/role-mappings') roleMappings(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string) { return this.s.roleMappings(a, id); }
  @Put(':serverId/role-mappings') setRoleMappings(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string, @Body(zodBody(mappings)) b: z.infer<typeof mappings>) { return this.s.setRoleMappings(a, id, b.mappings); }

  @Get(':serverId/audit-logs') audit(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string, @Query(zodBody(auditQuery)) q: z.infer<typeof auditQuery>) { return this.s.auditLogs(a, id, q); }
}


/** Für den Bot: abgeschaltete Module eines Servers (Befehle werden je Server danach registriert). Nur per Bot-Token. */
@ApiTags('bot')
@Controller('bot/servers')
export class BotServersController {
  constructor(private readonly s: ServersService) {}
  @BotService() @Get(':guildId/modules') modules(@Param('guildId', zodBody(sf)) guildId: string) { return this.s.botModules(guildId); }
}
