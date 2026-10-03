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

  /** Alle Zuordnungen eines Servers: Rolle (Discord-ID) → Permission-Keys, inkl. Rollen, die es auf Discord nicht mehr gibt. */
  async getGrants(guildId: string) {
    const rows = await prisma.permission.findMany({
      where: { guildId: assertGuildId(guildId) },
      select: { key: true, role: { select: { discordId: true, name: true, deletedAt: true } } },
    });
    const grants = new Map<string, { keys: string[]; name: string; deleted: boolean }>();
    for (const r of rows) {
      const g = grants.get(r.role.discordId) ?? {
        keys: [],
        name: r.role.name,
        deleted: r.role.deletedAt !== null,
      };
      g.keys.push(r.key);
      grants.set(r.role.discordId, g);
    }
    for (const g of grants.values()) g.keys.sort();
    return grants;
  },

  /**
   * Ersetzt die Permissions einer Rolle (leere Liste entfernt alle). Legt die Rolle bei Bedarf an
   * (`snapshot` = aktueller Discord-Stand). Transaktional und je Rolle serialisiert.
   */
  async setPermissionsForRole(
    guildId: string,
    roleDiscordId: string,
    keys: string[],
    snapshot?: { name: string; position?: number; color?: number },
  ) {
    const gid = assertGuildId(guildId);
    const unique = [...new Set(keys)].sort();
    return prisma.$transaction(async (tx) => {
      const existing = await tx.discordRole.findUnique({
        where: { guildId_discordId: { guildId: gid, discordId: roleDiscordId } },
      });
      if (!existing && unique.length === 0)
        return { before: [] as string[], after: [] as string[] };
      if (!existing && !snapshot) throw new Error('Rolle ist nicht gespiegelt.');
      const role =
        existing ??
        (await tx.discordRole.create({
          data: { guildId: gid, discordId: roleDiscordId, ...snapshot! },
        }));
      // Zeile sperren, damit parallele Änderungen derselben Rolle nacheinander laufen.
      await tx.$queryRaw`SELECT 1 FROM discord_roles WHERE id = ${role.id} FOR UPDATE`;
      const before = (
        await tx.permission.findMany({
          where: { guildId: gid, roleId: role.id },
          select: { key: true },
        })
      )
        .map((p) => p.key)
        .sort();
      await tx.permission.deleteMany({ where: { guildId: gid, roleId: role.id } });
      if (unique.length > 0) {
        await tx.permission.createMany({
          data: unique.map((key) => ({ guildId: gid, key, roleId: role.id })),
        });
      }
      return { before, after: unique };
    });
  },
};
