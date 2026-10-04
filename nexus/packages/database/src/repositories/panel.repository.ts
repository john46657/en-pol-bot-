import type { Prisma } from '@prisma/client';
import { prisma } from '../client.js';
import { assertGuildId } from '../scoped.js';

/** Universelle Panels. Jede Funktion verlangt die guildId; Zugriffe über fremde Server liefern `null`. */
export const panelRepository = {
  async list(guildId: string) {
    return prisma.panel.findMany({
      where: { guildId: assertGuildId(guildId) },
      orderBy: { updatedAt: 'desc' },
    });
  },

  async get(guildId: string, panelId: string) {
    return prisma.panel.findFirst({ where: { id: panelId, guildId: assertGuildId(guildId) } });
  },

  async create(
    guildId: string,
    data: { name: string; config: Prisma.InputJsonValue; autoUpdate?: boolean; createdBy?: string },
  ) {
    return prisma.panel.create({ data: { ...data, guildId: assertGuildId(guildId) } });
  },

  /** @returns das aktualisierte Panel oder `null`, wenn es auf diesem Server nicht existiert. */
  async update(
    guildId: string,
    panelId: string,
    data: { name?: string; config?: Prisma.InputJsonValue; autoUpdate?: boolean },
  ) {
    const res = await prisma.panel.updateMany({
      where: { id: panelId, guildId: assertGuildId(guildId) },
      data,
    });
    return res.count === 0 ? null : this.get(guildId, panelId);
  },

  async markSent(guildId: string, panelId: string, channelId: string, messageId: string) {
    const res = await prisma.panel.updateMany({
      where: { id: panelId, guildId: assertGuildId(guildId) },
      data: { channelId, messageId, lastSentAt: new Date() },
    });
    return res.count > 0;
  },

  async clearSent(guildId: string, panelId: string) {
    await prisma.panel.updateMany({
      where: { id: panelId, guildId: assertGuildId(guildId) },
      data: { channelId: null, messageId: null, lastSentAt: null },
    });
  },

  async delete(guildId: string, panelId: string) {
    const res = await prisma.panel.deleteMany({
      where: { id: panelId, guildId: assertGuildId(guildId) },
    });
    return res.count > 0;
  },
};
