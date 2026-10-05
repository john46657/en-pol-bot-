import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseFilters } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TYPES, TYPE_LABEL, listCases, moderate, restModerationPort, revoke, userSummary } from '@nexus/moderation';
import { listGuildMembers } from '@nexus/discord';
import { permissions } from '@nexus/permissions';
import type { Permission } from '@nexus/types';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequireDashboardAccess } from '../../common/decorators/guild-admin.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { Access, type RequestAccess } from '../../common/decorators/scope.decorator.js';
import { ModerationErrorFilter } from './moderation-error.filter.js';

type Body_ = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

/** Moderation: Fälle ansehen (moderation.view), verwarnen/Timeout/Kick/Bann (je eigenes Recht), aufheben (moderation.revoke). */
@ApiTags('Moderation')
@ApiBearerAuth()
@UseFilters(ModerationErrorFilter)
@Controller('guilds/:guildId/moderation')
export class ModerationController {
  constructor(private readonly config: ConfigService) {}
  private port() {
    return restModerationPort(this.config.get<string>('DISCORD_TOKEN') ?? '');
  }
  private async need(access: RequestAccess, key: Permission): Promise<void> {
    if (!(access.bypass || (await permissions.can(access, key)))) throw new ForbiddenException('Dafür fehlt dir die Berechtigung.');
  }

  @Get('types')
  @RequirePermissions('moderation.view')
  types() {
    return TYPES.map((t) => ({ type: t, label: TYPE_LABEL[t] }));
  }

  /** Mitgliedersuche für die Auswahl im Dashboard (nur Name und Rollen-Anzahl, kein Zugriff auf die Rechteverwaltung nötig). */
  @Get('members')
  @RequirePermissions('moderation.view')
  async members(@GuildId() guildId: string, @Query('query') query?: string) {
    const q = query?.trim();
    if (!q || q.length < 2) return [];
    const rows = await listGuildMembers(this.config.get<string>('DISCORD_TOKEN') ?? '', guildId, { query: q, limit: 15 });
    return rows.map((m) => ({ id: m.userId, username: m.username, displayName: m.globalName ?? m.username }));
  }

  @Get('cases')
  @RequirePermissions('moderation.view')
  list(@GuildId() guildId: string, @Query() q: Record<string, string | undefined>) {
    return listCases({ guildId, userId: q['userId'] || undefined, type: q['type'], status: q['status'], limit: Number(q['limit']) || 100 });
  }

  @Get('users/:userId')
  @RequirePermissions('moderation.view')
  user(@GuildId() guildId: string, @Param('userId') userId: string) {
    return userSummary(guildId, userId);
  }

  /** Maßnahme verhängen; das nötige Recht hängt von der Art ab (`moderation.warn|timeout|kick|ban`). */
  @Post('cases')
  @RequireDashboardAccess()
  async create(@GuildId() guildId: string, @Body() b: Body_, @Access() access: RequestAccess, @CurrentUser() user: RequestUser) {
    const type = str(b['type']) ?? '';
    if (!(TYPES as readonly string[]).includes(type)) await this.need(access, 'moderation.view'); // unbekannte Art: Dienst meldet „unbekannt“
    else await this.need(access, `moderation.${type.toLowerCase()}` as Permission);
    return moderate({ guildId, type, userId: str(b['userId']) ?? '', reason: str(b['reason']) ?? '', durationMin: num(b['durationMin']), deleteDays: num(b['deleteDays']), actor: { userId: user.id, roleIds: access.roleIds } }, this.port());
  }

  @Post('cases/:id/revoke')
  @RequirePermissions('moderation.revoke')
  revoke(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @Access() access: RequestAccess, @CurrentUser() user: RequestUser) {
    return revoke(guildId, id, str(b['reason']), { userId: user.id, roleIds: access.roleIds }, this.port());
  }
}
