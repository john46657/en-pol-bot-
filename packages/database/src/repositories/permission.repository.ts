import { prisma } from '../client.js';
import { assertGuildId } from '../scoped.js';

export const permissionRepository = {
  /** Ersetzt die Rollen-Zuordnung eines Permission-Keys (nur Rollen derselben Guild). */
  async setRolesForKey(guildId: string, key: string, roleDiscordIds: string[]) {
    const gid = assertGuildId(guildId);
    return prisma.$transaction(async (tx) => {
      const roles = await tx.discordRole.findMany({
        where: { guildId: gid, deletedAt: null, discordId: { in: roleDiscordIds } },
        select: { id: true },
      });
      if (roles.length !== new Set(roleDiscordIds).size) {
        throw new Error('Unbekannte Rolle in der Zuordnung.');
      }
      await tx.permission.deleteMany({ where: { guildId: gid, key } });
      await tx.permission.createMany({
        data: roles.map((r) => ({ guildId: gid, key, roleId: r.id })),
      });
      return roles.length;
    });
  },

  /** Alle Rollen (Discord-IDs), die einen Permission-Key besitzen. */
  async getRoleIdsForKey(guildId: string, key: string): Promise<string[]> {
    const rows = await prisma.permission.findMany({
      where: { guildId: assertGuildId(guildId), key, role: { deletedAt: null } },
      select: { role: { select: { discordId: true } } },
    });
    return rows.map((r) => r.role.discordId);
  },

  /** Permission-Keys, die eine der übergebenen Discord-Rollen besitzt. */
  async getKeysForRoles(guildId: string, roleDiscordIds: string[]): Promise<string[]> {
    const rows = await prisma.permission.findMany({
      where: {
        guildId: assertGuildId(guildId),
        role: { discordId: { in: roleDiscordIds }, deletedAt: null },
      },
      select: { key: true },
      distinct: ['key'],
    });
    return rows.map((r) => r.key);
  },
};
