import type { Prisma } from '@prisma/client';
import { prisma } from '../client.js';
import { assertGuildId } from '../scoped.js';

export interface GuildInput {
  id: string;
  name: string;
  iconUrl?: string | null;
  ownerId?: string | null;
}

export interface GuildSettingsInput {
  locale?: string;
  timezone?: string;
  logChannelId?: string | null;
  data?: Prisma.InputJsonValue;
}

export const guildRepository = {
  /** Speichert (oder aktualisiert) einen Server, legt Default-Einstellungen an und markiert ihn als aktiv. */
  async upsert(input: GuildInput) {
    const data = {
      name: input.name,
      iconUrl: input.iconUrl ?? null,
      ownerId: input.ownerId ?? null,
    };
    return prisma.guild.upsert({
      where: { id: assertGuildId(input.id) },
      create: { id: input.id, ...data, leftAt: null, settings: { create: {} } },
      update: { ...data, leftAt: null, settings: { upsert: { create: {}, update: {} } } },
      include: { settings: true },
    });
  },

  async get(guildId: string) {
    return prisma.guild.findUnique({
      where: { id: assertGuildId(guildId) },
      include: { settings: true },
    });
  },

  /** Bot hat den Server verlassen: Daten bleiben, Guild wird nur markiert. */
  async markLeft(guildId: string) {
    return prisma.guild.update({
      where: { id: assertGuildId(guildId) },
      data: { leftAt: new Date() },
    });
  },

  async getSettings(guildId: string) {
    return prisma.guildSettings.findUnique({ where: { guildId: assertGuildId(guildId) } });
  },

  async updateSettings(guildId: string, input: GuildSettingsInput) {
    const id = assertGuildId(guildId);
    return prisma.guildSettings.upsert({
      where: { guildId: id },
      create: { guildId: id, ...input },
      update: input,
    });
  },
};
