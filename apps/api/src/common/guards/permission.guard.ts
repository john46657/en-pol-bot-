import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { permissionDeniedMessage, permissions } from '@nexus/permissions';
import type { Permission } from '@nexus/types';
import { DiscordRolesService } from '../../modules/auth/discord-roles.service.js';
import { DASHBOARD_ACCESS_KEY, GUILD_ADMIN_KEY } from '../decorators/guild-admin.decorator.js';
import type { RequestUser } from '../decorators/current-user.decorator.js';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';

/**
 * Permission Guard (§78/§114): serverseitiger Permission Check.
 *
 * AuthN (Discord OAuth2 via Session-JWT) macht der JwtAuthGuard; dieser Guard prüft die Autorisierung:
 *  1. Ist der Benutzer (noch) Mitglied des Servers? (sonst Zugriff verweigert)
 *  2. Ist er Besitzer/Administrator/„Server verwalten“? (darf alles)
 *  3. Sonst: zentrale Engine (Rollen → Profile → Rechte, Sperren, Benutzer-Ausnahmen).
 * Fehlermeldungen nennen nur verständliche Bezeichnungen, nie interne Schlüssel.
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
    const dashboard = this.reflector.getAllAndOverride<boolean>(DASHBOARD_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if ((!required || required.length === 0) && !adminOnly && !dashboard) return true;

    const request = context.switchToHttp().getRequest<{
      user?: RequestUser;
      params: { guildId?: string };
    }>();
    const userId = request.user?.['id'];
    const guildId = request.params['guildId'];
    if (!userId || !guildId) {
      throw new ForbiddenException('Authentifizierung oder Guild-Context fehlt.');
    }

    // Rollen des Users (Discord) – serverseitig autoritativ. Eine vom Dev-Header gesetzte Rollenliste
    // (nur außerhalb von production) überspringt die Abfrage.
    let roleIds = request.user?.roleIds;
    if (!roleIds || roleIds.length === 0) {
      const member = await this.discordRoles.getMember(guildId, userId);
      if (!member.isMember) {
        throw new ForbiddenException('Du bist nicht (mehr) Mitglied dieses Servers.');
      }
      roleIds = member.roleIds;
    }

    const access = await this.discordRoles.getMemberAccess(guildId, userId, roleIds);
    if (adminOnly && !access.canManageGuild) {
      throw new ForbiddenException(
        'Keine Berechtigung. Du benötigst Server-Verwalter-Rechte. Wende dich an einen Administrator.',
      );
    }

    const ctx = { guildId, roleIds, bypass: access.canManageGuild, userId };
    if (dashboard && !required?.length && !adminOnly) {
      if (await permissions.hasAnyPermission(ctx)) return true;
      throw new ForbiddenException(
        'Du hast keinen Zugriff auf das Dashboard dieses Servers. Wende dich an einen Administrator.',
      );
    }
    if (!(await permissions.canAll(ctx, required ?? []))) {
      if (!(await permissions.hasAnyPermission(ctx))) {
        throw new ForbiddenException(
          'Du hast keinen Zugriff auf das Dashboard dieses Servers. Wende dich an einen Administrator.',
        );
      }
      throw new ForbiddenException(permissionDeniedMessage(required ?? []));
    }
    return true;
  }
}
