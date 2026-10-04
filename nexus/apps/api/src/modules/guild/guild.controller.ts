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
import { auditRepository } from '@nexus/database';
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
  @RequireGuildAdmin()
  permissionsOverview(@GuildId() guildId: string) {
    return this.permissionsAdmin.overview(guildId);
  }

  @Put('permissions/:roleId')
  @RequireGuildAdmin()
  setRolePermissions(
    @GuildId() guildId: string,
    @Param('roleId') roleId: string,
    @Body() body: SetRolePermissionsDto,
    @CurrentUser() user?: RequestUser,
  ) {
    if (!/^\d{5,25}$/.test(roleId)) throw new BadRequestException('Ungültige Rollen-ID.');
    return this.permissionsAdmin.setForRole(guildId, user?.id ?? 'unknown', roleId, body);
  }

  /** Audit-Log des Servers, neueste zuerst, seitenweise (`cursor` = ID des letzten Eintrags). Nur Server-Verwalter. */
  @Get('audit')
  @RequireGuildAdmin()
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
  @RequireGuildAdmin()
  listProfiles(@GuildId() guildId: string) {
    return this.access.listProfiles(guildId);
  }

  @Post('permission-profiles')
  @RequireGuildAdmin()
  createProfile(
    @GuildId() guildId: string,
    @Body() body: unknown,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.access.createProfile(guildId, user?.id ?? 'unknown', body);
  }

  /** Legt aus einer Standardvorlage ein frei änderbares Profil an. */
  @Post('permission-profiles/from-template')
  @RequireGuildAdmin()
  fromTemplate(
    @GuildId() guildId: string,
    @Body() body: { templateKey?: unknown; name?: unknown },
    @CurrentUser() user?: RequestUser,
  ) {
    return this.access.createFromTemplate(guildId, user?.id ?? 'unknown', body);
  }

  @Put('permission-profiles/:profileId')
  @RequireGuildAdmin()
  updateProfile(
    @GuildId() guildId: string,
    @Param('profileId') profileId: string,
    @Body() body: unknown,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.access.updateProfile(guildId, user?.id ?? 'unknown', profileId, body);
  }

  @Delete('permission-profiles/:profileId')
  @RequireGuildAdmin()
  deleteProfile(
    @GuildId() guildId: string,
    @Param('profileId') profileId: string,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.access.deleteProfile(guildId, user?.id ?? 'unknown', profileId);
  }

  // --- Benutzer-Übersicht ----------------------------------------------------

  @Get('members')
  @RequireGuildAdmin()
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
  @RequireGuildAdmin()
  memberAccess(@GuildId() guildId: string, @Param('userId') userId: string) {
    return this.access.memberAccess(guildId, userId);
  }

  @Post('members/:userId/overrides')
  @RequireGuildAdmin()
  addOverride(
    @GuildId() guildId: string,
    @Param('userId') userId: string,
    @Body() body: unknown,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.access.addOverride(guildId, user?.id ?? 'unknown', userId, body);
  }

  @Delete('members/:userId/overrides/:overrideId')
  @RequireGuildAdmin()
  removeOverride(
    @GuildId() guildId: string,
    @Param('userId') userId: string,
    @Param('overrideId') overrideId: string,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.access.removeOverride(guildId, user?.id ?? 'unknown', userId, overrideId);
  }
}
