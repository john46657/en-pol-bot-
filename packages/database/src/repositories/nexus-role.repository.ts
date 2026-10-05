import type { Prisma } from '@prisma/client';
import { prisma } from '../client.js';
import { assertGuildId } from '../scoped.js';

export interface NexusRoleEntry {
  key: string;
  effect: 'ALLOW' | 'DENY';
  scope: 'SERVER' | 'TEAM' | 'RECORD';
  scopeRef: string;
}

const entriesOf = (json: unknown): NexusRoleEntry[] => (Array.isArray(json) ? (json as NexusRoleEntry[]) : []);
const activeMember = (now = new Date()) => ({ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });

/** Eigene Dashboard-Rollen (`NexusRole`) und ihre Mitglieder. */
export const nexusRoleRepository = {
  entriesOf,

  async list(guildId: string) {
    const rows = await prisma.nexusRole.findMany({
      where: { guildId: assertGuildId(guildId) },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
      include: { members: { where: activeMember(), select: { userId: true, expiresAt: true, id: true } } },
    });
    return rows.map((r) => ({ ...r, entries: entriesOf(r.entries) }));
  },

  async get(guildId: string, id: string) {
    const r = await prisma.nexusRole.findFirst({
      where: { id, guildId: assertGuildId(guildId) },
      include: { members: { where: activeMember(), select: { userId: true, expiresAt: true, id: true } } },
    });
    return r ? { ...r, entries: entriesOf(r.entries) } : null;
  },

  create(
    guildId: string,
    d: { name: string; description?: string | null | undefined; color?: string | null | undefined; priority?: number | undefined; enabled?: boolean | undefined; discordRoleId?: string | null | undefined; entries: NexusRoleEntry[]; createdBy?: string },
  ) {
    return prisma.nexusRole.create({
      data: {
        guildId: assertGuildId(guildId),
        name: d.name,
        description: d.description ?? null,
        color: d.color ?? null,
        priority: d.priority ?? 0,
        enabled: d.enabled ?? true,
        discordRoleId: d.discordRoleId ?? null,
        entries: d.entries as unknown as Prisma.InputJsonValue,
        createdBy: d.createdBy ?? null,
      },
    });
  },

  async update(
    guildId: string,
    id: string,
    d: { name?: string | undefined; description?: string | null | undefined; color?: string | null | undefined; priority?: number | undefined; enabled?: boolean | undefined; discordRoleId?: string | null | undefined; entries?: NexusRoleEntry[] },
  ) {
    const res = await prisma.nexusRole.updateMany({
      where: { id, guildId: assertGuildId(guildId) },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
        ...(d.color !== undefined ? { color: d.color } : {}),
        ...(d.priority !== undefined ? { priority: d.priority } : {}),
        ...(d.enabled !== undefined ? { enabled: d.enabled } : {}),
        ...(d.discordRoleId !== undefined ? { discordRoleId: d.discordRoleId } : {}),
        ...(d.entries !== undefined ? { entries: d.entries as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    return res.count > 0;
  },

  async remove(guildId: string, id: string) {
    return (await prisma.nexusRole.deleteMany({ where: { id, guildId: assertGuildId(guildId) } })).count > 0;
  },

  addMember(guildId: string, roleId: string, userId: string, by: string, expiresAt: Date | null) {
    const gid = assertGuildId(guildId);
    return prisma.nexusRoleMember.upsert({
      where: { roleId_userId: { roleId, userId } },
      create: { roleId, guildId: gid, userId, expiresAt, createdBy: by },
      update: { expiresAt, createdBy: by },
    });
  },

  async removeMember(guildId: string, roleId: string, userId: string) {
    return (await prisma.nexusRoleMember.deleteMany({ where: { guildId: assertGuildId(guildId), roleId, userId } })).count > 0;
  },

  /** Aktive Rollen eines Benutzers (Mitgliedschaft oder getragene Discord-Rolle), nur aktivierte. */
  async rolesOfUser(guildId: string, userId: string | undefined, discordRoleIds: readonly string[]) {
    const rows = await prisma.nexusRole.findMany({
      where: {
        guildId: assertGuildId(guildId),
        enabled: true,
        OR: [
          ...(userId ? [{ members: { some: { userId, ...activeMember() } } }] : []),
          ...(discordRoleIds.length ? [{ discordRoleId: { in: [...discordRoleIds] } }] : []),
        ],
      },
    });
    return rows.map((r) => ({ ...r, entries: entriesOf(r.entries) }));
  },
};
