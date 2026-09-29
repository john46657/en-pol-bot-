import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import type { RequestUser } from '../decorators/current-user.decorator.js';
import { resolvePermissions } from '@nexus/permissions';
import { prisma } from '@nexus/database';
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
    if (!required || required.length === 0) return true;

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
    const guildRow = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { rolePermissions: true },
    });
    const rolePermissions = new Map<string, readonly Permission[]>();
    const raw = (guildRow?.rolePermissions ?? {}) as Record<string, Permission[]>;
    for (const [roleId, perms] of Object.entries(raw)) {
      if (Array.isArray(perms)) rolePermissions.set(roleId, perms);
    }

    const userPermissions = resolvePermissions(rolePermissions, roleIds);
    const hasAll = required.every(
      (p) => userPermissions.has(p) || userPermissions.has('applications.manage' as Permission),
    );
    if (!hasAll) {
      throw new ForbiddenException(
        'Dir fehlen die erforderlichen Berechtigungen für diese Aktion.',
      );
    }
    return true;
  }
}
