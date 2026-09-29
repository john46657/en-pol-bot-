import type { Guild, GuildMember } from 'discord.js';
import { PERMISSIONS } from '@nexus/types';
import type { Permission, PermissionSet } from '@nexus/types';
import {
  canManageApplications,
  canReviewSubmissions,
  canViewSubmissions,
  resolvePermissions,
} from '@nexus/permissions';
import { prisma } from '@nexus/database';

/**
 * Permission-Auflösung aus Discord-Rollen (§79/§114).
 *
 * Die Zuordnung Rolle→Permissions liegt pro Guild in der Datenbank
 * (Guild.rolePermissions). Frontend-Permissions sind nur UI – hier wird
 * serverseitig geprüft.
 */
export async function readRolePermissions(
  guild: Guild,
): Promise<Map<string, readonly Permission[]>> {
  const map = new Map<string, readonly Permission[]>();
  const guildRow = await prisma.guild.findUnique({
    where: { id: guild.id },
    select: { rolePermissions: true },
  });
  const raw = guildRow?.rolePermissions;
  if (raw && typeof raw === 'object') {
    for (const [roleId, perms] of Object.entries(raw as Record<string, unknown>)) {
      if (!Array.isArray(perms)) continue;
      const valid = perms.filter(
        (p): p is Permission =>
          typeof p === 'string' && (PERMISSIONS as readonly string[]).includes(p),
      );
      if (valid.length > 0) map.set(roleId, valid);
    }
  }
  return map;
}

export function resolveMemberPermissions(
  rolePermissions: ReadonlyMap<string, readonly Permission[]>,
  member: GuildMember,
): PermissionSet {
  return resolvePermissions(rolePermissions, [...member.roles.cache.keys()]);
}

export function memberCanReview(
  rolePermissions: ReadonlyMap<string, readonly Permission[]>,
  member: GuildMember,
): boolean {
  return canReviewSubmissions(resolveMemberPermissions(rolePermissions, member));
}

export function memberCanViewSubmissions(
  rolePermissions: ReadonlyMap<string, readonly Permission[]>,
  member: GuildMember,
): boolean {
  return canViewSubmissions(resolveMemberPermissions(rolePermissions, member));
}

export function memberCanManage(
  rolePermissions: ReadonlyMap<string, readonly Permission[]>,
  member: GuildMember,
): boolean {
  return canManageApplications(resolveMemberPermissions(rolePermissions, member));
}

export function isValidPermissionString(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
