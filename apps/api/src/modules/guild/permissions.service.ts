import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { auditRepository, guildRepository, prisma } from '@nexus/database';
import { PERMISSIONS } from '@nexus/types';
import { DiscordService } from './discord.service.js';

/** Verwaltung der Zuordnung Discord-Rolle → NEXUS-Permissions (serverseitig validiert, auditiert). */
@Injectable()
export class PermissionsAdminService {
  constructor(private readonly discord: DiscordService) {}

  async overview(guildId: string) {
    const [mapping, roles] = await Promise.all([
      guildRepository.getRolePermissions(guildId),
      this.discord.listRoles(guildId),
    ]);
    const known = new Set(roles.map((r) => r.id));
    return {
      available: PERMISSIONS,
      roles: roles
        .filter((r) => r.blockedReason !== 'everyone')
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.color,
          position: r.position,
          permissions: mapping[r.id] ?? [],
        })),
      /** Zuordnungen zu Rollen, die auf Discord nicht mehr existieren. */
      orphaned: Object.entries(mapping)
        .filter(([id]) => !known.has(id))
        .map(([roleId, permissions]) => ({ roleId, permissions })),
    };
  }

  async setForRole(guildId: string, actorId: string, roleId: string, permissions: string[]) {
    const invalid = permissions.filter((p) => !(PERMISSIONS as readonly string[]).includes(p));
    if (invalid.length > 0)
      throw new BadRequestException(`Unbekannte Permission: ${invalid.join(', ')}`);
    if (!(await prisma.guild.findUnique({ where: { id: guildId }, select: { id: true } }))) {
      throw new NotFoundException('Der Bot ist mit diesem Server nicht verbunden.');
    }
    // Verwaiste Zuordnungen dürfen gelöscht (leere Liste), neue nur für existierende Rollen angelegt werden.
    if (permissions.length > 0) {
      const roles = await this.discord.listRoles(guildId);
      if (!roles.some((r) => r.id === roleId && r.blockedReason !== 'everyone')) {
        throw new BadRequestException('Diese Rolle existiert auf dem Server nicht.');
      }
    }
    const { before, after } = await guildRepository.setRolePermissions(
      guildId,
      roleId,
      permissions,
    );
    await auditRepository.create({
      guildId,
      actorType: 'USER',
      actorId,
      action: 'permissions.role.set',
      resourceType: 'DiscordRole',
      resourceId: roleId,
      before: { permissions: before },
      after: { permissions: after },
    });
    return { roleId, permissions: after };
  }
}
