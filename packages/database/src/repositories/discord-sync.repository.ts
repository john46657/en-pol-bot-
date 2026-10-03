import { prisma } from '../client.js';
import { assertGuildId } from '../scoped.js';

export interface RoleInput {
  discordId: string;
  name: string;
  color?: number;
  position?: number;
  permissions?: string;
  managed?: boolean;
  mentionable?: boolean;
  hoist?: boolean;
}

export interface ChannelInput {
  discordId: string;
  name: string;
  type: number;
  parentId?: string | null;
  position?: number;
}

/**
 * Rollen und Kanäle eines Servers. `sync*` ersetzt den Datenbestand durch den Discord-Stand:
 * vorhandene Einträge werden aktualisiert, fehlende per Soft Delete markiert (damit
 * Permission-Zuordnungen und Logs weiter auflösbar bleiben).
 */
export const discordSyncRepository = {
  async syncRoles(guildId: string, roles: RoleInput[]) {
    const gid = assertGuildId(guildId);
    return prisma.$transaction(async (tx) => {
      for (const r of roles) {
        const { discordId, ...rest } = r;
        await tx.discordRole.upsert({
          where: { guildId_discordId: { guildId: gid, discordId } },
          create: { guildId: gid, discordId, ...rest },
          update: { ...rest, deletedAt: null },
        });
      }
      const removed = await tx.discordRole.updateMany({
        where: {
          guildId: gid,
          deletedAt: null,
          discordId: { notIn: roles.map((r) => r.discordId) },
        },
        data: { deletedAt: new Date() },
      });
      return { synced: roles.length, removed: removed.count };
    });
  },

  async listRoles(guildId: string) {
    return prisma.discordRole.findMany({
      where: { guildId: assertGuildId(guildId), deletedAt: null },
      orderBy: { position: 'desc' },
    });
  },

  async syncChannels(guildId: string, channels: ChannelInput[]) {
    const gid = assertGuildId(guildId);
    return prisma.$transaction(async (tx) => {
      for (const c of channels) {
        const { discordId, ...rest } = c;
        await tx.discordChannel.upsert({
          where: { guildId_discordId: { guildId: gid, discordId } },
          create: { guildId: gid, discordId, ...rest },
          update: { ...rest, deletedAt: null },
        });
      }
      const removed = await tx.discordChannel.updateMany({
        where: {
          guildId: gid,
          deletedAt: null,
          discordId: { notIn: channels.map((c) => c.discordId) },
        },
        data: { deletedAt: new Date() },
      });
      return { synced: channels.length, removed: removed.count };
    });
  },

  async listChannels(guildId: string, type?: number) {
    return prisma.discordChannel.findMany({
      where: {
        guildId: assertGuildId(guildId),
        deletedAt: null,
        ...(type === undefined ? {} : { type }),
      },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
  },
};
