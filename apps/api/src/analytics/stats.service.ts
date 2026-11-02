import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { minutesWithin, periodRange, rankRows, toCsv, localDate, LEADERBOARD_METRICS, STAT_PERIODS, WEEK_COUNTED_STATUSES, type LeaderboardMetric, type StatPeriod } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { currentGuild } from '../common/guild-context';

export const periodQ = z.object({ period: z.enum(STAT_PERIODS).default('month'), from: z.string().max(10).optional(), to: z.string().max(10).optional() });
export const statsConfigSchema = z.object({
  /** Ranglisten an/aus; ausgeschaltete erscheinen nirgends */
  leaderboards: z.array(z.enum(LEADERBOARD_METRICS.map((m) => m.key) as [LeaderboardMetric, ...LeaderboardMetric[]])).default(['dutyMinutes', 'trainings', 'dutyReports', 'tickets', 'meetings']),
  /** Plätze je Rangliste */
  size: z.number().int().min(3).max(50).default(10),
});
const CONFIG = 'stats.config';
type Range = { from: Date; to: Date };
export interface PersonStats { userId: string; name: string; dutyMinutes: number; shifts: number; dutyReports: number; weeklyReports: number; trainings: number; exams: number; tickets: number; meetings: number; absenceDays: number; events: number }

/**
 * Statistiken und Ranglisten – ausschließlich aus gespeicherten Daten (Stempeluhr, Schichtplan, Berichte, Ausbildungen, Prüfungen,
 * Tickets, Besprechungen, Abwesenheiten, Termine). Nur lesend: niemand kann Werte direkt setzen (auch nicht die eigenen).
 * Es gibt bewusst keine „Leistungs“-Kennzahl – nur Zählwerte. Server-Trennung über die Prisma-Erweiterung.
 */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService, private readonly perms: PermissionService, private readonly audit: AuditService) {}

  async config() { const r = statsConfigSchema.safeParse((await this.prisma.systemSetting.findUnique({ where: { key: CONFIG } }))?.value ?? {}); return r.success ? r.data : statsConfigSchema.parse({}); }
  async saveConfig(actor: Actor, c: z.infer<typeof statsConfigSchema>) {
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: CONFIG }, create: { key: CONFIG, value: c }, update: { value: c } });
      await this.audit.record(actor, { action: 'analytics.config', module: 'analytics', entityType: 'SystemSetting', entityId: CONFIG, after: c }, tx);
    });
    return this.config();
  }

  range(q: z.infer<typeof periodQ>): Range {
    try { return periodRange(q.period as StatPeriod, new Date(), { from: q.from, to: q.to }); }
    catch (e) { throw new AppError('VALIDATION_FAILED', e instanceof Error ? e.message : 'Ungültiger Zeitraum.'); }
  }

  /** Kennzahlen je Person im Zeitraum (`userIds` leer = alle mit Personalakte auf diesem Server). */
  async compute(r: Range, userIds?: string[]): Promise<PersonStats[]> {
    const staff = await this.prisma.personnel.findMany({ where: userIds ? { userId: { in: userIds } } : { employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } }, select: { id: true, userId: true, user: { select: { displayName: true } } } });
    const ids = [...new Set([...staff.map((s) => s.userId), ...(userIds ?? [])])];
    const pid = new Map(staff.map((s) => [s.id, s.userId]));
    const now = new Date(), g = currentGuild();
    const [sessions, shifts, reports, trainings, exams, links, meetings, leaves, events, users] = await Promise.all([
      this.prisma.dutySession.findMany({ where: { userId: { in: ids }, status: { in: [...WEEK_COUNTED_STATUSES] }, startedAt: { lt: r.to }, OR: [{ endedAt: null }, { endedAt: { gt: r.from } }] }, select: { userId: true, startedAt: true, endedAt: true } }),
      this.prisma.shiftAssignment.findMany({ where: { userId: { in: ids }, status: 'ACTIVE', shift: { status: 'COMPLETED', startsAt: { gte: r.from, lt: r.to } } }, select: { userId: true } }),
      this.prisma.dutyReport.findMany({ where: { authorId: { in: ids }, createdAt: { gte: r.from, lt: r.to }, ...(g ? { OR: [{ guildId: g }, { guildId: null }] } : {}) }, select: { authorId: true, period: true } }),
      this.prisma.hrTrainingProgress.findMany({ where: { personnelId: { in: staff.map((s) => s.id) }, status: 'PASSED', completedAt: { gte: r.from, lt: r.to } }, select: { personnelId: true } }),
      this.prisma.hrExamAttempt.findMany({ where: { personnelId: { in: staff.map((s) => s.id) }, status: 'GRADED', passed: true, gradedAt: { gte: r.from, lt: r.to } }, select: { personnelId: true } }),
      this.prisma.discordLink.findMany({ where: { userId: { in: ids } }, select: { userId: true, discordId: true } }),
      this.prisma.calendarParticipant.findMany({ where: { userId: { in: ids }, status: 'ATTENDED', event: { category: 'MEETING', startsAt: { gte: r.from, lt: r.to } } }, select: { userId: true } }),
      this.prisma.leaveRequest.findMany({ where: { userId: { in: ids }, status: { in: ['APPROVED', 'ENDED'] }, startsAt: { lt: r.to }, endsAt: { gt: r.from } }, select: { userId: true, startsAt: true, endsAt: true, endedAt: true } }),
      this.prisma.calendarParticipant.findMany({ where: { userId: { in: ids }, status: { in: ['ACCEPTED', 'ATTENDED'] }, event: { startsAt: { gte: r.from, lt: r.to } } }, select: { userId: true } }),
      this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }),
    ]);
    const discord = new Map(links.map((l) => [l.discordId, l.userId]));
    const tickets = links.length ? await this.prisma.supportTicket.findMany({ where: { closedById: { in: [...discord.keys()] }, closedAt: { gte: r.from, lt: r.to }, ...(g ? { guildId: g } : {}) }, select: { closedById: true } }) : [];
    const out = new Map<string, PersonStats>(users.map((u) => [u.id, { userId: u.id, name: u.displayName, dutyMinutes: 0, shifts: 0, dutyReports: 0, weeklyReports: 0, trainings: 0, exams: 0, tickets: 0, meetings: 0, absenceDays: 0, events: 0 }]));
    const inc = (u: string | undefined, k: keyof Omit<PersonStats, 'userId' | 'name'>, n = 1) => { const x = u ? out.get(u) : undefined; if (x) x[k] += n; };
    for (const s of sessions) inc(s.userId, 'dutyMinutes', minutesWithin(s.startedAt, s.endedAt, r.from, r.to, now));
    for (const s of shifts) inc(s.userId, 'shifts');
    for (const x of reports) inc(x.authorId, x.period === 'WEEKLY' ? 'weeklyReports' : 'dutyReports');
    for (const x of trainings) inc(pid.get(x.personnelId), 'trainings');
    for (const x of exams) inc(pid.get(x.personnelId), 'exams');
    for (const x of tickets) inc(discord.get(x.closedById ?? ''), 'tickets');
    for (const x of meetings) inc(x.userId, 'meetings');
    for (const x of events) inc(x.userId, 'events');
    for (const l of leaves) inc(l.userId, 'absenceDays', Math.round(minutesWithin(l.startsAt, l.endedAt ?? l.endsAt, r.from, r.to, now) / 1440 * 10) / 10);
    return [...out.values()].map((p) => ({ ...p, dutyMinutes: Math.round(p.dutyMinutes) }));
  }

  /** Eigene Statistik (jeder) bzw. einer anderen Person (analytics.personal_all). */
  async personal(actor: Actor, q: z.infer<typeof periodQ>, userId?: string) {
    if (userId && userId !== actor.userId) await this.perms.assert(actor.userId!, 'analytics.personal_all');
    const r = this.range(q);
    const [me] = await this.compute(r, [userId ?? actor.userId!]);
    return { from: r.from, to: r.to, stats: me ?? null };
  }

  /** Team-Übersicht: Summen, Tagesverlauf Dienststunden, Tabelle je Person (analytics.view + personnel.view für Namen). */
  async overview(actor: Actor, q: z.infer<typeof periodQ>) {
    const r = this.range(q);
    const rows = await this.compute(r);
    const sum = (k: keyof Omit<PersonStats, 'userId' | 'name'>) => Math.round(rows.reduce((n, x) => n + x[k], 0) * 10) / 10;
    // Tagesverlauf (Dienststunden je lokalem Tag)
    const sessions = await this.prisma.dutySession.findMany({ where: { status: { in: [...WEEK_COUNTED_STATUSES] }, startedAt: { lt: r.to }, OR: [{ endedAt: null }, { endedAt: { gt: r.from } }] }, select: { startedAt: true, endedAt: true } });
    const days = new Map<string, number>();
    for (let t = r.from.getTime(); t < r.to.getTime() && days.size < 400; t += 86_400_000) days.set(localDate(new Date(t + 3_600_000 * 3)), 0);
    for (const s of sessions) { const k = localDate(s.startedAt < r.from ? r.from : s.startedAt); if (days.has(k)) days.set(k, days.get(k)! + minutesWithin(s.startedAt, s.endedAt, r.from, r.to) / 60); }
    const showNames = await this.perms.has(actor.userId!, 'analytics.personal_all');
    return {
      from: r.from, to: r.to,
      totals: { dutyHours: Math.round(sum('dutyMinutes') / 6) / 10, shifts: sum('shifts'), dutyReports: sum('dutyReports'), weeklyReports: sum('weeklyReports'), trainings: sum('trainings'), exams: sum('exams'), tickets: sum('tickets'), meetings: sum('meetings'), absenceDays: sum('absenceDays'), events: sum('events'), active: rows.filter((x) => x.dutyMinutes > 0).length, people: rows.length },
      series: [...days.entries()].map(([day, h]) => ({ day, hours: Math.round(h * 10) / 10 })),
      people: showNames ? rows.sort((a, b) => b.dutyMinutes - a.dutyMinutes) : [],
    };
  }

  /** Ranglisten (nur eingeschaltete Kennzahlen; Gleichstand = gleicher Platz; Nullwerte erscheinen nicht). */
  async leaderboards(_actor: Actor, q: z.infer<typeof periodQ>) {
    const cfg = await this.config();
    const r = this.range(q);
    const rows = await this.compute(r);
    return {
      from: r.from, to: r.to,
      boards: LEADERBOARD_METRICS.filter((m) => cfg.leaderboards.includes(m.key)).map((m) => ({ key: m.key, label: m.label, unit: m.unit, rows: rankRows(rows.map((x) => ({ userId: x.userId, name: x.name, value: x[m.key] })), cfg.size) })),
    };
  }

  async exportCsv(actor: Actor, q: z.infer<typeof periodQ>) {
    const r = this.range(q);
    const rows = await this.compute(r);
    await this.audit.record(actor, { action: 'analytics.export', module: 'analytics', after: { from: r.from, to: r.to, rows: rows.length } });
    return toCsv(['Name', 'Dienstzeit (Std.)', 'Schichten', 'Dienstberichte', 'Wochenberichte', 'Ausbildungen', 'Prüfungen', 'Tickets', 'Besprechungen', 'Abwesenheitstage', 'Termine'],
      rows.map((x) => [x.name, Math.round(x.dutyMinutes / 6) / 10, x.shifts, x.dutyReports, x.weeklyReports, x.trainings, x.exams, x.tickets, x.meetings, x.absenceDays, x.events]));
  }
}
