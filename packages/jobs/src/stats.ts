import { prisma, type Prisma } from '@nexus/database';
import { leaderboard, overview, type Period } from '@nexus/shifts';

/**
 * Automatische Statistiken und Leaderboards: Je Server werden Ranglisten (Tag/Woche/Monat/Gesamt) und die
 * Übersicht regelmäßig vorberechnet und als Snapshot gespeichert (`stat_snapshots`) – schnell abrufbar und als
 * Verlauf nutzbar. Die Werte stammen aus denselben Funktionen wie die Live-Abfragen (Phase 13).
 */
export const SNAPSHOT_PERIODS: Period[] = ['day', 'week', 'month', 'all'];

export async function computeSnapshots(now = new Date()): Promise<{ guilds: number; snapshots: number }> {
  const guilds = await prisma.guild.findMany({ select: { id: true } });
  let snapshots = 0;
  for (const g of guilds) {
    const save = async (key: string, data: unknown) => {
      await prisma.statSnapshot.upsert({ where: { guildId_key: { guildId: g.id, key } }, create: { guildId: g.id, key, data: data as Prisma.InputJsonValue, computedAt: now }, update: { data: data as Prisma.InputJsonValue, computedAt: now } });
      snapshots++;
    };
    for (const period of SNAPSHOT_PERIODS) await save(`leaderboard:${period}`, await leaderboard({ guildId: g.id, period, limit: 20, restrictToTeams: null, now }));
    await save('overview', await overview({ guildId: g.id, restrictToTeams: null, now }));
  }
  return { guilds: guilds.length, snapshots };
}

export const getSnapshot = (guildId: string, key: string) => prisma.statSnapshot.findUnique({ where: { guildId_key: { guildId, key } } });
