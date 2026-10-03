import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { auditRepository, guildRepository, permissionRepository } from '@nexus/database';
import { PERMISSION_CATALOG, PERMISSIONS } from '@nexus/types';
import { DiscordService } from './discord.service.js';

/** Verwaltung der Zuordnung Discord-Rolle → NEXUS-Permissions (serverseitig validiert, auditiert). */
@Injectable()
export class PermissionsAdminService {
  constructor(private readonly discord: DiscordService) {}

  async overview(guildId: string) {
    const [grants, roles] = await Promise.all([
      permissionRepository.getGrants(guildId),
      this.discord.listRoles(guildId),
    ]);
    const known = new Set(roles.map((r) => r.id));
    return {
      catalog: PERMISSION_CATALOG.map((m) => ({
        module: m.module,
        label: m.label,
        permissions: m.permissions.map(([key, label]) => ({ key, label })),
      })),
      roles: roles
        .filter((r) => r.blockedReason !== 'everyone')
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.color,
          position: r.position,
          permissions: grants.get(r.id)?.keys ?? [],
        })),
      /** Zuordnungen zu Rollen, die auf Discord nicht mehr existieren. */
      orphaned: [...grants.entries()]
        .filter(([id]) => !known.has(id))
        .map(([roleId, g]) => ({ roleId, name: g.name, permissions: g.keys })),
    };
  }

  async setForRole(guildId: string, actorId: string, roleId: string, permissions: string[]) {
    const invalid = permissions.filter((p) => !(PERMISSIONS as readonly string[]).includes(p));
    if (invalid.length > 0) {
      throw new BadRequestException(`Unbekannte Permission: ${invalid.join(', ')}`);
    }
    if (!(await guildRepository.get(guildId))) {
      throw new NotFoundException('Der Bot ist mit diesem Server nicht verbunden.');
    }
    // Verwaiste Zuordnungen dürfen gelöscht (leere Liste), neue nur für existierende Rollen angelegt werden.
    let snapshot: { name: string; position: number; color: number } | undefined;
    if (permissions.length > 0) {
      const role = (await this.discord.listRoles(guildId)).find(
        (r) => r.id === roleId && r.blockedReason !== 'everyone',
      );
      if (!role) throw new BadRequestException('Diese Rolle existiert auf dem Server nicht.');
      snapshot = { name: role.name, position: role.position, color: role.color };
    }
    const { before, after } = await permissionRepository.setPermissionsForRole(
      guildId,
      roleId,
      permissions,
      snapshot,
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
