import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { auditRepository, logForwardRepository } from '@nexus/database';
import { AREAS } from '@nexus/audit';
import { resolveTemplate } from '@nexus/types';
import {
  RequireDashboardAccess,
  RequireGuildAdmin,
} from '../../common/decorators/guild-admin.decorator.js';
import { AccessService } from './access.service.js';
import { PermissionsAdminService } from './permissions.service.js';
import { SetRolePermissionsDto } from './permissions.dto.js';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { SelectionsService } from './selections.service.js';
import { SetSelectionDto } from './selections.dto.js';
import type { ChannelKind } from './bot-access.js';
import { GuildService } from './guild.service.js';
import { RightsService } from './rights.service.js';
import { NexusRolesService } from './nexus-roles.service.js';
import { Access, type RequestAccess } from '../../common/decorators/scope.decorator.js';
import { DiscordService } from './discord.service.js';

/**
 * GuildController (§4/§8/§30/§35/§36) – Guild-Daten für das Dashboard.
 *
 * Channel/Rollen-Auswahlen liefert Discord (nie manuelle IDs tippen, §8),
 * die Verwaltbarkeit des Bots wird serverseitig geprüft (§30).
 */
@ApiTags('Guild')
@ApiBearerAuth()
@Controller('guilds/:guildId')
export class GuildController {
  constructor(
    private readonly guilds: GuildService,
    private readonly discord: DiscordService,
    private readonly selections: SelectionsService,
    private readonly permissionsAdmin: PermissionsAdminService,
    private readonly access: AccessService,
    private readonly rights: RightsService,
    private readonly nexusRoles: NexusRolesService,
  ) {}

  /** Server-Overview + Configuration Health (§4/§36). */
  @Get()
  @RequireDashboardAccess()
  getOverview(@GuildId() guildId: string) {
    return this.guilds.getOverview(guildId);
  }

  /** Discord-Channel dieser Guild (§8: Auswahlen statt IDs tippen). */
  @Get('discord/channels')
  @RequirePermissions('applications.view')
  listChannels(@GuildId() guildId: string, @Query('kind') kind?: string) {
    const allowed = ['text', 'voice', 'category'];
    return this.discord.listChannels(
      guildId,
      allowed.includes(kind ?? '') ? (kind as ChannelKind) : undefined,
    );
  }

  /** Discord-Rollen dieser Guild inkl. Verwaltbarkeits-Check (§30). */
  @Get('discord/roles')
  @RequirePermissions('applications.view')
  listRoles(@GuildId() guildId: string) {
    return this.discord.listRoles(guildId);
  }

  /** Server-Rechte des Bots (Kanäle ansehen, Nachrichten, Embeds, Rollen verwalten). */
  @Get('discord/bot-permissions')
  @RequirePermissions('applications.view')
  botPermissions(@GuildId() guildId: string) {
    return this.discord.getBotPermissions(guildId);
  }

  /** Konfigurierbare Rollen-/Kanal-Felder mit aktuellem Wert. */
  @Get('selections')
  @RequirePermissions('applications.view')
  listSelections(@GuildId() guildId: string) {
    return this.selections.list(guildId);
  }

  /** Speichert (oder löscht mit `value: null`) die Auswahl eines Feldes. Serverseitig validiert + im Audit-Log. */
  @Put('selections/:slot')
  @RequirePermissions('applications.manage')
  setSelection(
    @GuildId() guildId: string,
    @Param('slot') slot: string,
    @Body() body: SetSelectionDto,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.selections.set(guildId, user?.id ?? 'unknown', slot, body.value ?? null);
  }

  /** Rolle → Permission-Zuordnung (nur Server-Verwalter). */
  @Get('permissions')
  @RequirePermissions('permissions.view')
  permissionsOverview(@GuildId() guildId: string) {
    return this.permissionsAdmin.overview(guildId);
  }

  @Put('permissions/:roleId')
  @RequirePermissions('permissions.edit')
  async setRolePermissions(
    @GuildId() guildId: string,
    @Param('roleId') roleId: string,
    @Body() body: SetRolePermissionsDto,
    @Access() access: RequestAccess,
    @CurrentUser() user?: RequestUser,
  ) {
    if (!/^\d{5,25}$/.test(roleId)) throw new BadRequestException('Ungültige Rollen-ID.');
    await this.rights.forSetRole(guildId, access, roleId, body);
    return this.permissionsAdmin.setForRole(guildId, user?.id ?? 'unknown', roleId, body);
  }

  /** Audit-Log des Servers, neueste zuerst, seitenweise (`cursor` = ID des letzten Eintrags). Nur Server-Verwalter. */
  @Get('audit')
  @RequirePermissions('audit.view')
  async audit(
    @GuildId() guildId: string,
    @Query('action') action?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const rows = await auditRepository.list(guildId, {
      limit: take + 1,
      ...(action ? { action } : {}),
      ...(cursor ? { cursor } : {}),
    });
    const items = rows.slice(0, take);
    return { items, nextCursor: rows.length > take ? (items.at(-1)?.id ?? null) : null };
  }

  // --- Profile & Vorlagen ----------------------------------------------------

  @Get('permission-profiles')
  @RequirePermissions('permissions.view')
  listProfiles(@GuildId() guildId: string) {
    return this.access.listProfiles(guildId);
  }

  @Post('permission-profiles')
  @RequirePermissions('permissions.edit')
  async createProfile(
    @GuildId() guildId: string,
    @Body() body: unknown,
    @Access() access: RequestAccess,
    @CurrentUser() user?: RequestUser,
  ) {
    await this.rights.forProfileCreate(guildId, access, allowKeysOf(body));
    return this.access.createProfile(guildId, user?.id ?? 'unknown', body);
  }

  /** Legt aus einer Standardvorlage ein frei änderbares Profil an. */
  @Post('permission-profiles/from-template')
  @RequirePermissions('permissions.edit')
  async fromTemplate(
    @GuildId() guildId: string,
    @Body() body: { templateKey?: unknown; name?: unknown },
    @Access() access: RequestAccess,
    @CurrentUser() user?: RequestUser,
  ) {
    await this.rights.forProfileCreate(guildId, access, resolveTemplateAllowKeys(body.templateKey));
    return this.access.createFromTemplate(guildId, user?.id ?? 'unknown', body);
  }

  /** Profil duplizieren („Kopie von …“): gleiche Rechte, eigener Name, standardmäßig aktiv. */
  @Post('permission-profiles/:profileId/duplicate')
  @RequirePermissions('permissions.edit')
  async duplicateProfile(
    @GuildId() guildId: string,
    @Param('profileId') profileId: string,
    @Access() access: RequestAccess,
    @CurrentUser() user?: RequestUser,
  ) {
    const source = (await this.access.listProfiles(guildId)).find((p) => p.id === profileId);
    await this.rights.forProfileCreate(guildId, access, source ? source.entries.filter((e) => e.effect === 'ALLOW').map((e) => e.key) : []);
    return this.access.duplicateProfile(guildId, user?.id ?? 'unknown', profileId);
  }

  @Put('permission-profiles/:profileId')
  @RequirePermissions('permissions.edit')
  async updateProfile(
    @GuildId() guildId: string,
    @Param('profileId') profileId: string,
    @Body() body: unknown,
    @Access() access: RequestAccess,
    @CurrentUser() user?: RequestUser,
  ) {
    await this.rights.forProfileChange(guildId, access, profileId, allowKeysOf(body));
    return this.access.updateProfile(guildId, user?.id ?? 'unknown', profileId, body);
  }

  @Delete('permission-profiles/:profileId')
  @RequirePermissions('permissions.edit')
  async deleteProfile(
    @GuildId() guildId: string,
    @Param('profileId') profileId: string,
    @Access() access: RequestAccess,
    @CurrentUser() user?: RequestUser,
  ) {
    await this.rights.forProfileChange(guildId, access, profileId);
    return this.access.deleteProfile(guildId, user?.id ?? 'unknown', profileId);
  }

  // --- Log-Weiterleitung (Audit-Log → Discord-Kanäle) -------------------------

  @Get('log-forwards')
  @RequirePermissions('logs.view')
  async logForwards(@GuildId() guildId: string) {
    return { areas: [{ key: '*', label: 'Alle Bereiche' }, ...AREAS.map((a) => ({ key: a.key, label: a.label })), { key: 'other', label: 'Sonstiges' }], forwards: (await logForwardRepository.list(guildId)).map((f) => ({ area: f.area, channelId: f.channelId, enabled: f.enabled })) };
  }

  @Put('log-forwards')
  @RequirePermissions('logs.manage')
  async setLogForwards(@GuildId() guildId: string, @Body() body: { forwards?: unknown }, @CurrentUser() user?: RequestUser) {
    const valid = new Set(['*', 'other', ...AREAS.map((a) => a.key)]);
    const raw = Array.isArray(body?.forwards) ? (body.forwards as { area?: unknown; channelId?: unknown; enabled?: unknown }[]) : null;
    if (!raw || raw.length > 40) throw new BadRequestException('Ungültige Weiterleitungen.');
    const channels = new Set((await this.discord.listChannels(guildId, 'text')).map((c) => c.id));
    const seen = new Set<string>();
    const rows = raw.map((r) => {
      if (typeof r.area !== 'string' || !valid.has(r.area)) throw new BadRequestException('Unbekannter Bereich.');
      if (seen.has(r.area)) throw new BadRequestException('Jeder Bereich darf nur einmal vorkommen.');
      seen.add(r.area);
      if (typeof r.channelId !== 'string' || !channels.has(r.channelId)) throw new BadRequestException('Der Kanal gehört nicht zu diesem Server oder ist kein Textkanal.');
      return { area: r.area, channelId: r.channelId, enabled: r.enabled !== false };
    });
    const { before, after } = await logForwardRepository.replace(guildId, rows, user?.id ?? 'unknown');
    const sum = (l: { area: string; channelId: string; enabled: boolean }[]) => l.map((f) => `${f.area}→${f.channelId}${f.enabled ? '' : ' (aus)'}`).sort();
    await auditRepository.create({ guildId, actorType: 'USER', actorId: user?.id ?? 'unknown', action: 'config.logs.forward.update', resourceType: 'LogForward', resourceId: guildId, permission: 'logs.manage', result: 'success', before: sum(before) as never, after: sum(after) as never });
    return { forwards: after.map((f) => ({ area: f.area, channelId: f.channelId, enabled: f.enabled })) };
  }

  // --- Dashboard-Rollen (eigene Rollen, optional an Discord gekoppelt) ---------

  @Get('nexus-roles')
  @RequirePermissions('permissions.view')
  listNexusRoles(@GuildId() guildId: string) {
    return this.nexusRoles.list(guildId);
  }

  @Post('nexus-roles')
  @RequirePermissions('permissions.edit')
  async createNexusRole(@GuildId() guildId: string, @Body() body: unknown, @Access() access: RequestAccess, @CurrentUser() user?: RequestUser) {
    const d = this.nexusRoles.validate(body);
    await this.rights.forNexusRole(guildId, access, { priority: d.priority ?? 0, allowKeys: d.entries.filter((e) => e.effect === 'ALLOW').map((e) => e.key) });
    return this.nexusRoles.create(guildId, user?.id ?? 'unknown', body);
  }

  @Put('nexus-roles/:id')
  @RequirePermissions('permissions.edit')
  async updateNexusRole(@GuildId() guildId: string, @Param('id') id: string, @Body() body: unknown, @Access() access: RequestAccess, @CurrentUser() user?: RequestUser) {
    const d = this.nexusRoles.validate(body);
    await this.rights.forNexusRole(guildId, access, { roleId: id, ...(d.priority !== undefined ? { priority: d.priority } : {}), allowKeys: d.entries.filter((e) => e.effect === 'ALLOW').map((e) => e.key) });
    return this.nexusRoles.update(guildId, user?.id ?? 'unknown', id, body);
  }

  @Post('nexus-roles/:id/duplicate')
  @RequirePermissions('permissions.edit')
  async duplicateNexusRole(@GuildId() guildId: string, @Param('id') id: string, @Access() access: RequestAccess, @CurrentUser() user?: RequestUser) {
    const src = (await this.nexusRoles.list(guildId)).find((r) => r.id === id);
    await this.rights.forNexusRole(guildId, access, { ...(src ? { priority: src.priority } : {}), allowKeys: src ? src.entries.filter((e) => e.effect === 'ALLOW').map((e) => e.key) : [] });
    return this.nexusRoles.duplicate(guildId, user?.id ?? 'unknown', id);
  }

  @Delete('nexus-roles/:id')
  @RequirePermissions('permissions.edit')
  async deleteNexusRole(@GuildId() guildId: string, @Param('id') id: string, @Access() access: RequestAccess, @CurrentUser() user?: RequestUser) {
    await this.rights.forNexusRole(guildId, access, { roleId: id });
    return this.nexusRoles.remove(guildId, user?.id ?? 'unknown', id);
  }

  @Post('nexus-roles/:id/members')
  @RequirePermissions('permissions.edit')
  async addNexusRoleMembers(@GuildId() guildId: string, @Param('id') id: string, @Body() body: unknown, @Access() access: RequestAccess, @CurrentUser() user?: RequestUser) {
    const d = this.nexusRoles.parseMembers(body);
    await this.rights.forNexusMember(guildId, access, id, d.userIds, true);
    return this.nexusRoles.addMembers(guildId, user?.id ?? 'unknown', id, body);
  }

  @Delete('nexus-roles/:id/members/:userId')
  @RequirePermissions('permissions.edit')
  async removeNexusRoleMember(@GuildId() guildId: string, @Param('id') id: string, @Param('userId') userId: string, @Access() access: RequestAccess, @CurrentUser() user?: RequestUser) {
    await this.rights.forNexusMember(guildId, access, id, [userId], false);
    return this.nexusRoles.removeMember(guildId, user?.id ?? 'unknown', id, userId);
  }

  // --- Benutzer-Übersicht ----------------------------------------------------

  @Get('members')
  @RequirePermissions('permissions.view')
  listMembers(
    @GuildId() guildId: string,
    @Query('query') query?: string,
    @Query('limit') limit?: string,
  ) {
    return this.access.listMembers(
      guildId,
      query?.trim() || undefined,
      Math.min(Math.max(Number(limit) || 50, 1), 200),
    );
  }

  @Get('members/:userId/access')
  @RequirePermissions('permissions.view')
  memberAccess(@GuildId() guildId: string, @Param('userId') userId: string) {
    return this.access.memberAccess(guildId, userId);
  }

  @Post('members/:userId/overrides')
  @RequirePermissions('permissions.edit')
  async addOverride(
    @GuildId() guildId: string,
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Access() access: RequestAccess,
    @CurrentUser() user?: RequestUser,
  ) {
    const b = (body ?? {}) as { key?: unknown; effect?: unknown };
    await this.rights.forOverride(guildId, access, userId, typeof b.key === 'string' && (b.effect === 'ALLOW' || b.effect === 'DENY') ? { key: b.key, effect: b.effect } : undefined);
    return this.access.addOverride(guildId, user?.id ?? 'unknown', userId, body);
  }

  @Delete('members/:userId/overrides/:overrideId')
  @RequirePermissions('permissions.edit')
  async removeOverride(
    @GuildId() guildId: string,
    @Param('userId') userId: string,
    @Param('overrideId') overrideId: string,
    @Access() access: RequestAccess,
    @CurrentUser() user?: RequestUser,
  ) {
    await this.rights.forOverride(guildId, access, userId);
    return this.access.removeOverride(guildId, user?.id ?? 'unknown', userId, overrideId);
  }
}

/** Erlaubte Schlüssel einer Profil-Eingabe (für die Rechteprüfung; Ungültiges prüft der Dienst selbst). */
function allowKeysOf(body: unknown): string[] {
  const entries = (body as { entries?: unknown } | null)?.entries;
  return Array.isArray(entries)
    ? entries.flatMap((e: { key?: unknown; effect?: unknown }) => (e && e.effect === 'ALLOW' && typeof e.key === 'string' ? [e.key] : []))
    : [];
}
function resolveTemplateAllowKeys(templateKey: unknown): string[] {
  const r = typeof templateKey === 'string' ? resolveTemplate(templateKey) : undefined;
  return r ? r.allow.map((a) => a.key) : [];
}
