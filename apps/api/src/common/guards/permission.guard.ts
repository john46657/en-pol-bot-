import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import { GUILD_ADMIN_KEY } from '../decorators/guild-admin.decorator.js';
import type { RequestUser } from '../decorators/current-user.decorator.js';
import { permissions } from '@nexus/permissions';
import { DiscordRolesService } from '../../modules/auth/discord-roles.service.js';
import type { Permission } from '@nexus/types';

/**
 * Permission Guard (§78/§114): serverseitiger Permission Check.
 *
 * AuthN (Discord OAuth2 via Session-JWT) macht der JwtAuthGuard; dieser Guard
 * prüft die Authorisierung: Welche NEXUS-Permissions hat der User durch seine
 * Rollen in dieser Guild?
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    private readonly discordRoles: DiscordRolesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const adminOnly = this.reflector.getAllAndOverride<boolean>(GUILD_ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if ((!required || required.length === 0) && !adminOnly) return true;

    const request = context.switchToHttp().getRequest<{
      user?: RequestUser;
      params: { guildId?: string };
    }>();
    const userId = request.user?.['id'];
    const guildId = request.params['guildId'];
    if (!userId || !guildId) {
      throw new ForbiddenException('Authentifizierung oder Guild-Context fehlt.');
    }

    // Rollen des Users in dieser Guild (Discord) – serverseitig autoritativ:
    // aus dem Auth-Layer-Cache (request.user.roleIds) oder via Bot-Token
    // bei Discord angefordert (§114).
    let roleIds = request.user?.roleIds;
    if (!roleIds || roleIds.length === 0) {
      roleIds = await this.discordRoles.getMemberRoles(guildId, userId);
    }

    // Besitzer, Administratoren und „Server verwalten“ dürfen immer (Bootstrap + Konsistenz mit der Serverauswahl).
    const access = await this.discordRoles.getMemberAccess(guildId, userId, roleIds);
    if (adminOnly && !access.canManageGuild) {
      throw new ForbiddenException(
        'Dafür sind Server-Verwalter-Rechte (Besitzer/Administrator) nötig.',
      );
    }

    // Zentrale Permission-Engine (dieselbe Prüfung wie im Bot).
    const allowed = await permissions.canAll(
      { guildId, roleIds, bypass: access.canManageGuild },
      required ?? [],
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Dir fehlen die erforderlichen Berechtigungen für diese Aktion.',
      );
    }
    return true;
  }
}
