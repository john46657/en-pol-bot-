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

  /** Rolle → Permission-Keys (Guild.rolePermissions). */
  async getRolePermissions(guildId: string): Promise<Record<string, string[]>> {
    const row = await prisma.guild.findUnique({
      where: { id: assertGuildId(guildId) },
      select: { rolePermissions: true },
    });
    return readRolePermissions(row?.rolePermissions);
  },

  /** Setzt die Permissions einer Rolle (leere Liste entfernt die Zuordnung). Transaktional, damit parallele Änderungen anderer Rollen nicht verloren gehen. */
  async setRolePermissions(guildId: string, roleId: string, permissions: string[]) {
    const id = assertGuildId(guildId);
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM guilds WHERE id = ${id} FOR UPDATE`;
      const row = await tx.guild.findUnique({ where: { id }, select: { rolePermissions: true } });
      if (!row) throw new Error('Server ist nicht in der Datenbank (Bot nicht verbunden).');
      const map = readRolePermissions(row.rolePermissions);
      const before = map[roleId] ?? [];
      if (permissions.length === 0) delete map[roleId];
      else map[roleId] = [...new Set(permissions)].sort();
      await tx.guild.update({ where: { id }, data: { rolePermissions: map } });
      return { before, after: map[roleId] ?? [] };
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

export function readRolePermissions(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [roleId, perms] of Object.entries(raw)) {
    if (Array.isArray(perms)) out[roleId] = perms.filter((p): p is string => typeof p === 'string');
  }
  return out;
}
