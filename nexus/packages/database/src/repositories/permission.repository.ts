import type { Prisma } from '@prisma/client';
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
        effect: 'ALLOW',
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
      select: {
        key: true,
        effect: true,
        scope: true,
        scopeRef: true,
        role: { select: { discordId: true, name: true, deletedAt: true } },
      },
    });
    const grants = new Map<
      string,
      { keys: string[]; deny: string[]; entries: ProfileEntry[]; name: string; deleted: boolean }
    >();
    for (const r of rows) {
      const g = grants.get(r.role.discordId) ?? {
        keys: [],
        deny: [],
        entries: [],
        name: r.role.name,
        deleted: r.role.deletedAt !== null,
      };
      (r.effect === 'DENY' ? g.deny : g.keys).push(r.key);
      g.entries.push({ key: r.key, effect: r.effect, scope: r.scope, scopeRef: r.scopeRef });
      grants.set(r.role.discordId, g);
    }
    for (const g of grants.values()) {
      g.keys.sort();
      g.deny.sort();
    }
    return grants;
  },

  /**
   * Ersetzt die Permissions einer Rolle (leere Liste entfernt alle). Legt die Rolle bei Bedarf an
   * (`snapshot` = aktueller Discord-Stand). Transaktional und je Rolle serialisiert.
   */
  async setPermissionsForRole(
    guildId: string,
    roleDiscordId: string,
    keysOrEntries: (string | ProfileEntry)[],
    snapshot?: { name: string; position?: number; color?: number },
  ) {
    const gid = assertGuildId(guildId);
    // Strings = Erlaubnis serverweit (Rückwärtskompatibilität)
    const wanted = keysOrEntries.map((e): ProfileEntry =>
      typeof e === 'string' ? { key: e, effect: 'ALLOW', scope: 'SERVER', scopeRef: '' } : e,
    );
    const sig = (e: ProfileEntry) => `${e.effect}|${e.key}|${e.scope}|${e.scopeRef}`;
    const unique = [...new Map(wanted.map((e) => [sig(e), e])).values()];
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
      const rows = await tx.permission.findMany({ where: { guildId: gid, roleId: role.id } });
      const label = (e: ProfileEntry) => (e.effect === 'DENY' ? `!${e.key}` : e.key);
      const before = rows.map((r) => label(r)).sort();
      await tx.permission.deleteMany({ where: { guildId: gid, roleId: role.id } });
      if (unique.length > 0) {
        await tx.permission.createMany({
          data: unique.map((e) => ({ guildId: gid, roleId: role.id, ...e })),
        });
      }
      return { before, after: unique.map(label).sort() };
    });
  },

  /**
   * Alle für diese Rollen/diesen Benutzer geltenden Zuordnungen: direkte Rollen-Einträge, Profile der Rollen
   * und benutzerbezogene Ausnahmen. Gelöschte Rollen werden ignoriert.
   */
  async loadGrants(
    guildId: string,
    roleDiscordIds: string[],
    userId?: string,
  ): Promise<GrantRow[]> {
    const gid = assertGuildId(guildId);
    const [direct, profiles, user] = await Promise.all([
      prisma.permission.findMany({
        where: { guildId: gid, role: { discordId: { in: roleDiscordIds }, deletedAt: null } },
        select: {
          key: true,
          effect: true,
          scope: true,
          scopeRef: true,
          role: { select: { discordId: true, name: true } },
        },
      }),
      prisma.roleProfile.findMany({
        where: { guildId: gid, role: { discordId: { in: roleDiscordIds }, deletedAt: null } },
        select: {
          role: { select: { discordId: true, name: true } },
          profile: { select: { id: true, name: true, entries: true } },
        },
      }),
      userId
        ? prisma.userPermission.findMany({ where: { guildId: gid, userId } })
        : Promise.resolve([]),
    ]);
    const out: GrantRow[] = [];
    for (const d of direct) {
      out.push({
        key: d.key,
        effect: d.effect,
        scope: d.scope,
        scopeRef: d.scopeRef,
        source: { kind: 'role', roleId: d.role.discordId, roleName: d.role.name },
      });
    }
    for (const rp of profiles) {
      for (const e of readEntries(rp.profile.entries)) {
        out.push({
          ...e,
          source: {
            kind: 'profile',
            roleId: rp.role.discordId,
            roleName: rp.role.name,
            profileId: rp.profile.id,
            profileName: rp.profile.name,
          },
        });
      }
    }
    for (const u of user) {
      out.push({
        key: u.key,
        effect: u.effect,
        scope: u.scope,
        scopeRef: u.scopeRef,
        source: { kind: 'user', note: u.note ?? undefined },
      });
    }
    return out;
  },

  /** Alle Zuordnungen eines Servers auf einmal (für Übersichten): je Rolle (Discord-ID) und je Benutzer. */
  async loadGrantIndex(guildId: string) {
    const gid = assertGuildId(guildId);
    const [direct, profiles, users] = await Promise.all([
      prisma.permission.findMany({
        where: { guildId: gid, role: { deletedAt: null } },
        select: {
          key: true,
          effect: true,
          scope: true,
          scopeRef: true,
          role: { select: { discordId: true, name: true } },
        },
      }),
      prisma.roleProfile.findMany({
        where: { guildId: gid, role: { deletedAt: null } },
        select: {
          role: { select: { discordId: true, name: true } },
          profile: { select: { id: true, name: true, entries: true } },
        },
      }),
      prisma.userPermission.findMany({ where: { guildId: gid } }),
    ]);
    const byRole = new Map<string, GrantRow[]>();
    const push = (roleId: string, row: GrantRow) =>
      byRole.set(roleId, [...(byRole.get(roleId) ?? []), row]);
    for (const d of direct) {
      push(d.role.discordId, {
        key: d.key,
        effect: d.effect,
        scope: d.scope,
        scopeRef: d.scopeRef,
        source: { kind: 'role', roleId: d.role.discordId, roleName: d.role.name },
      });
    }
    for (const rp of profiles) {
      for (const e of readEntries(rp.profile.entries)) {
        push(rp.role.discordId, {
          ...e,
          source: {
            kind: 'profile',
            roleId: rp.role.discordId,
            roleName: rp.role.name,
            profileId: rp.profile.id,
            profileName: rp.profile.name,
          },
        });
      }
    }
    const byUser = new Map<string, GrantRow[]>();
    for (const u of users) {
      byUser.set(u.userId, [
        ...(byUser.get(u.userId) ?? []),
        {
          key: u.key,
          effect: u.effect,
          scope: u.scope,
          scopeRef: u.scopeRef,
          source: { kind: 'user', note: u.note ?? undefined },
        },
      ]);
    }
    return { byRole, byUser };
  },

  // --- Profile -------------------------------------------------------------

  async listProfiles(guildId: string) {
    const rows = await prisma.permissionProfile.findMany({
      where: { guildId: assertGuildId(guildId) },
      orderBy: { name: 'asc' },
      include: { roles: { select: { role: { select: { discordId: true, name: true } } } } },
    });
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      templateKey: p.templateKey,
      entries: readEntries(p.entries),
      roles: p.roles.map((r) => ({ id: r.role.discordId, name: r.role.name })),
    }));
  },

  async getProfile(guildId: string, profileId: string) {
    return prisma.permissionProfile.findFirst({
      where: { id: profileId, guildId: assertGuildId(guildId) },
    });
  },

  async createProfile(
    guildId: string,
    data: {
      name: string;
      description?: string | undefined;
      entries: ProfileEntry[];
      templateKey?: string | undefined;
      createdBy?: string | undefined;
    },
  ) {
    return prisma.permissionProfile.create({
      data: {
        guildId: assertGuildId(guildId),
        name: data.name,
        description: data.description ?? null,
        entries: data.entries as unknown as Prisma.InputJsonValue,
        templateKey: data.templateKey ?? null,
        createdBy: data.createdBy ?? null,
      },
    });
  },

  async updateProfile(
    guildId: string,
    profileId: string,
    data: {
      name?: string | undefined;
      description?: string | null | undefined;
      entries?: ProfileEntry[] | undefined;
    },
  ) {
    const res = await prisma.permissionProfile.updateMany({
      where: { id: profileId, guildId: assertGuildId(guildId) },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.entries !== undefined
          ? { entries: data.entries as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
    return res.count > 0 ? this.getProfile(guildId, profileId) : null;
  },

  async deleteProfile(guildId: string, profileId: string) {
    const res = await prisma.permissionProfile.deleteMany({
      where: { id: profileId, guildId: assertGuildId(guildId) },
    });
    return res.count > 0;
  },

  /** Profile einer Rolle ersetzen. Die Rolle wird bei Bedarf aus dem Snapshot angelegt. */
  async setProfilesForRole(
    guildId: string,
    roleDiscordId: string,
    profileIds: string[],
    snapshot?: { name: string; position?: number; color?: number },
  ) {
    const gid = assertGuildId(guildId);
    const unique = [...new Set(profileIds)];
    return prisma.$transaction(async (tx) => {
      const profiles = await tx.permissionProfile.findMany({
        where: { guildId: gid, id: { in: unique } },
        select: { id: true },
      });
      if (profiles.length !== unique.length) throw new Error('Unbekanntes Profil.');
      let role = await tx.discordRole.findUnique({
        where: { guildId_discordId: { guildId: gid, discordId: roleDiscordId } },
      });
      if (!role) {
        if (unique.length === 0) return { before: [] as string[], after: [] as string[] };
        if (!snapshot) throw new Error('Rolle ist nicht gespiegelt.');
        role = await tx.discordRole.create({
          data: { guildId: gid, discordId: roleDiscordId, ...snapshot },
        });
      }
      await tx.$queryRaw`SELECT 1 FROM discord_roles WHERE id = ${role.id} FOR UPDATE`;
      const before = (
        await tx.roleProfile.findMany({ where: { roleId: role.id }, select: { profileId: true } })
      )
        .map((r) => r.profileId)
        .sort();
      await tx.roleProfile.deleteMany({ where: { roleId: role.id } });
      if (unique.length > 0)
        await tx.roleProfile.createMany({
          data: unique.map((profileId) => ({ guildId: gid, roleId: role!.id, profileId })),
        });
      return { before, after: [...unique].sort() };
    });
  },

  async getProfilesByRole(guildId: string) {
    const rows = await prisma.roleProfile.findMany({
      where: { guildId: assertGuildId(guildId) },
      select: { profileId: true, role: { select: { discordId: true } } },
    });
    const map = new Map<string, string[]>();
    for (const r of rows)
      map.set(r.role.discordId, [...(map.get(r.role.discordId) ?? []), r.profileId]);
    return map;
  },

  // --- Benutzerbezogene Ausnahmen ---------------------------------------------

  async listUserOverrides(guildId: string, userId: string) {
    return prisma.userPermission.findMany({
      where: { guildId: assertGuildId(guildId), userId },
      orderBy: { createdAt: 'asc' },
    });
  },

  async addUserOverride(
    guildId: string,
    data: {
      userId: string;
      key: string;
      effect: 'ALLOW' | 'DENY';
      scope?: 'SERVER' | 'TEAM' | 'RECORD';
      scopeRef?: string;
      note?: string | undefined;
      createdBy?: string | undefined;
    },
  ) {
    const gid = assertGuildId(guildId);
    const where = {
      guildId: gid,
      userId: data.userId,
      key: data.key,
      effect: data.effect,
      scope: data.scope ?? 'SERVER',
      scopeRef: data.scopeRef ?? '',
    };
    return prisma.userPermission.upsert({
      where: { guildId_userId_key_effect_scope_scopeRef: where },
      create: { ...where, note: data.note ?? null, createdBy: data.createdBy ?? null },
      update: { note: data.note ?? null },
    });
  },

  async removeUserOverride(guildId: string, id: string) {
    const res = await prisma.userPermission.deleteMany({
      where: { id, guildId: assertGuildId(guildId) },
    });
    return res.count > 0;
  },
};

export interface ProfileEntry {
  key: string;
  effect: 'ALLOW' | 'DENY';
  scope: 'SERVER' | 'TEAM' | 'RECORD';
  scopeRef: string;
}

export interface GrantRow extends ProfileEntry {
  source: {
    kind: 'role' | 'profile' | 'user';
    roleId?: string | undefined;
    roleName?: string | undefined;
    profileId?: string | undefined;
    profileName?: string | undefined;
    note?: string | undefined;
  };
}

/** Liest `entries` defensiv (JSON aus der Datenbank). */
export function readEntries(raw: unknown): ProfileEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileEntry[] = [];
  for (const e of raw as Record<string, unknown>[]) {
    if (!e || typeof e['key'] !== 'string') continue;
    out.push({
      key: e['key'],
      effect: e['effect'] === 'DENY' ? 'DENY' : 'ALLOW',
      scope: e['scope'] === 'TEAM' || e['scope'] === 'RECORD' ? e['scope'] : 'SERVER',
      scopeRef: typeof e['scopeRef'] === 'string' ? e['scopeRef'] : '',
    });
  }
  return out;
}
