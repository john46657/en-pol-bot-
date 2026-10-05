import { prisma } from '../client.js';
import { assertGuildId } from '../scoped.js';

export interface LogForwardInput {
  area: string;
  channelId: string;
  enabled: boolean;
}

/** Weiterleitung des Audit-Logs in Discord-Kanäle (Konfiguration + Fortschritts-Cursor). */
export const logForwardRepository = {
  list(guildId: string) {
    return prisma.logForward.findMany({ where: { guildId: assertGuildId(guildId) }, orderBy: { area: 'asc' } });
  },

  /** Ersetzt die Konfiguration des Servers; gibt vorher/nachher zurück. Beim ersten Aktivieren beginnt die Weiterleitung ab jetzt (kein Verlauf). */
  async replace(guildId: string, rows: LogForwardInput[], by: string, now = new Date()) {
    const gid = assertGuildId(guildId);
    return prisma.$transaction(async (tx) => {
      const before = await tx.logForward.findMany({ where: { guildId: gid } });
      await tx.logForward.deleteMany({ where: { guildId: gid } });
      if (rows.length > 0) await tx.logForward.createMany({ data: rows.map((r) => ({ guildId: gid, area: r.area, channelId: r.channelId, enabled: r.enabled, createdBy: by })) });
      if (rows.some((r) => r.enabled)) await tx.logForwardCursor.upsert({ where: { guildId: gid }, create: { guildId: gid, lastAt: now }, update: {} });
      return { before, after: await tx.logForward.findMany({ where: { guildId: gid } }) };
    });
  },

  /** Alle Server mit mindestens einer aktiven Weiterleitung samt Cursor. */
  async active() {
    const rows = await prisma.logForward.findMany({ where: { enabled: true } });
    const guilds = [...new Set(rows.map((r) => r.guildId))];
    const cursors = await prisma.logForwardCursor.findMany({ where: { guildId: { in: guilds } } });
    return guilds.map((g) => ({ guildId: g, forwards: rows.filter((r) => r.guildId === g), cursor: cursors.find((c) => c.guildId === g) ?? null }));
  },

  setCursor(guildId: string, lastAt: Date, lastId: string) {
    const gid = assertGuildId(guildId);
    return prisma.logForwardCursor.upsert({ where: { guildId: gid }, create: { guildId: gid, lastAt, lastId }, update: { lastAt, lastId } });
  },
};
