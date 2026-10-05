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

  /** Gespeicherte Auswahlen (Slot → Discord-ID) aus `settings.data.selections`. */
  async getSelections(guildId: string): Promise<Record<string, string>> {
    const settings = await this.getSettings(guildId);
    return readSelections(settings?.data);
  },

  /** Setzt oder löscht (`null`) eine Auswahl. Transaktion, damit parallele Änderungen anderer Slots nicht verloren gehen. */
  async setSelection(guildId: string, slot: string, value: string | null) {
    const id = assertGuildId(guildId);
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM guild_settings WHERE "guildId" = ${id} FOR UPDATE`;
      const row = await tx.guildSettings.findUnique({ where: { guildId: id } });
      const data = (
        row?.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data : {}
      ) as Record<string, unknown>;
      const selections = readSelections(row?.data);
      const before = selections[slot] ?? null;
      if (value === null) delete selections[slot];
      else selections[slot] = value;
      const next = { ...data, selections } as Prisma.InputJsonValue;
      await tx.guildSettings.upsert({
        where: { guildId: id },
        create: { guildId: id, data: next },
        update: { data: next },
      });
      return { before, after: value };
    });
  },

  /** Roh gespeicherter Modul-Zustand (`settings.data.modules`); Auswertung über `@nexus/modules`. */
  async getModuleState(guildId: string): Promise<unknown> {
    const settings = await this.getSettings(guildId);
    const data = settings?.data;
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as { modules?: unknown }).modules ?? null : null;
  },

  /** Speichert den Modul-Zustand (Transaktion wie bei den Auswahlen); gibt den vorherigen Rohwert zurück. */
  async setModuleState(guildId: string, state: { disabled: string[]; disabledCommands: string[] }): Promise<{ before: unknown }> {
    const id = assertGuildId(guildId);
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM guild_settings WHERE "guildId" = ${id} FOR UPDATE`;
      const row = await tx.guildSettings.findUnique({ where: { guildId: id } });
      const data = (row?.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data : {}) as Record<string, unknown>;
      const next = { ...data, modules: state } as Prisma.InputJsonValue;
      await tx.guildSettings.upsert({ where: { guildId: id }, create: { guildId: id, data: next }, update: { data: next } });
      return { before: data['modules'] ?? null };
    });
  },
};

export function readSelections(data: unknown): Record<string, string> {
  const raw =
    data && typeof data === 'object' ? (data as { selections?: unknown }).selections : undefined;
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'string')) as Record<
    string,
    string
  >;
}
