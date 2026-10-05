import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, assertGuildId } from '@nexus/database';
import { computeStats } from './team-chance-stats.js';

/**
 * Analytics (§45): nur aggregierte Daten, keine sensiblen Antworten
 * in allgemeinen Analytics (§120).
 */
@Injectable()
export class ApplicationAnalyticsService {
  async overview(guildId: string, applicationId?: string) {
    const g = assertGuildId(guildId);
    const where = { guildId: g, ...(applicationId ? { applicationId } : {}) };

    const grouped = await prisma.applicationSubmission.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    const counts: Record<string, number> = {};
    let total = 0;
    for (const row of grouped) {
      counts[row.status] = row._count;
      total += row._count;
    }
    const submitted =
      (counts['SUBMITTED'] ?? 0) +
      (counts['UNDER_REVIEW'] ?? 0) +
      (counts['ON_HOLD'] ?? 0) +
      (counts['ACCEPTED'] ?? 0) +
      (counts['DENIED'] ?? 0);
    const accepted = counts['ACCEPTED'] ?? 0;
    const denied = counts['DENIED'] ?? 0;
    const reviewed = accepted + denied;

    return {
      counts,
      total,
      submitted,
      accepted,
      denied,
      acceptanceRate: submitted > 0 ? accepted / submitted : 0,
      denialRate: submitted > 0 ? denied / submitted : 0,
      reviewRate: submitted > 0 ? reviewed / submitted : 0,
    };
  }

  /** Team-Chance-Auswertung: Kennzahlen gesamt und je Bewerbungsart (ohne Testbewerbungen). */
  async teamChance(guildId: string) {
    const g = assertGuildId(guildId);
    const [rows, apps] = await Promise.all([
      prisma.applicationSubmission.findMany({ where: { guildId: g, isTest: false }, select: { applicationId: true, status: true, startedAt: true, submittedAt: true, acceptedAt: true, deniedAt: true } }),
      prisma.application.findMany({ where: { guildId: g }, select: { id: true, name: true, icon: true }, orderBy: { name: 'asc' } }),
    ]);
    const now = new Date();
    return {
      total: computeStats(rows, now),
      perApplication: apps.map((a) => ({ applicationId: a.id, name: a.name, icon: a.icon, ...computeStats(rows.filter((r) => r.applicationId === a.id), now) })),
    };
  }

  /** Zeitreihe pro Tag (§45: submissions per day/week/month). */
  async daily(guildId: string, applicationId: string, days = 30) {
    const g = assertGuildId(guildId);

    // Guild-Isolation (§113): AnalyticsDaily ist nur über die Application
    // guild-scoped – daher vorher prüfen, dass die Application dieser Guild
    // gehört, sonst dürften hier Daten einer fremden Guild fließen.
    const application = await prisma.application.findFirst({
      where: { id: applicationId, guildId: g },
      select: { id: true },
    });
    if (!application) throw new NotFoundException('Application nicht gefunden.');

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    return prisma.applicationAnalyticsDaily.findMany({
      where: { applicationId, day: { gte: since } },
      orderBy: { day: 'asc' },
    });
  }
}
