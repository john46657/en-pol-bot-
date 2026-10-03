import { BadRequestException, Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { auditRepository } from '@nexus/database';
import { RequireGuildAdmin } from '../../common/decorators/guild-admin.decorator.js';
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
  ) {}

  /** Server-Overview + Configuration Health (§4/§36). */
  @Get()
  @RequirePermissions('applications.view')
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
    return this.permissionsAdmin.setForRole(
      guildId,
      user?.id ?? 'unknown',
      roleId,
      body.permissions,
    );
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
}
