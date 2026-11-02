"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatsService = exports.statsConfigSchema = exports.periodQ = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const permission_service_1 = require("../authz/permission.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
const guild_context_1 = require("../common/guild-context");
exports.periodQ = zod_1.z.object({ period: zod_1.z.enum(shared_1.STAT_PERIODS).default('month'), from: zod_1.z.string().max(10).optional(), to: zod_1.z.string().max(10).optional() });
exports.statsConfigSchema = zod_1.z.object({
    /** Ranglisten an/aus; ausgeschaltete erscheinen nirgends */
    leaderboards: zod_1.z.array(zod_1.z.enum(shared_1.LEADERBOARD_METRICS.map((m) => m.key))).default(['dutyMinutes', 'trainings', 'dutyReports', 'tickets', 'meetings']),
    /** Plätze je Rangliste */
    size: zod_1.z.number().int().min(3).max(50).default(10),
});
const CONFIG = 'stats.config';
/**
 * Statistiken und Ranglisten – ausschließlich aus gespeicherten Daten (Stempeluhr, Schichtplan, Berichte, Ausbildungen, Prüfungen,
 * Tickets, Besprechungen, Abwesenheiten, Termine). Nur lesend: niemand kann Werte direkt setzen (auch nicht die eigenen).
 * Es gibt bewusst keine „Leistungs“-Kennzahl – nur Zählwerte. Server-Trennung über die Prisma-Erweiterung.
 */
let StatsService = class StatsService {
    prisma;
    perms;
    audit;
    constructor(prisma, perms, audit) {
        this.prisma = prisma;
        this.perms = perms;
        this.audit = audit;
    }
    async config() { const r = exports.statsConfigSchema.safeParse((await this.prisma.systemSetting.findUnique({ where: { key: CONFIG } }))?.value ?? {}); return r.success ? r.data : exports.statsConfigSchema.parse({}); }
    async saveConfig(actor, c) {
        await this.prisma.$transaction(async (tx) => {
            await tx.systemSetting.upsert({ where: { key: CONFIG }, create: { key: CONFIG, value: c }, update: { value: c } });
            await this.audit.record(actor, { action: 'analytics.config', module: 'analytics', entityType: 'SystemSetting', entityId: CONFIG, after: c }, tx);
        });
        return this.config();
    }
    range(q) {
        try {
            return (0, shared_1.periodRange)(q.period, new Date(), { from: q.from, to: q.to });
        }
        catch (e) {
            throw new errors_1.AppError('VALIDATION_FAILED', e instanceof Error ? e.message : 'Ungültiger Zeitraum.');
        }
    }
    /** Kennzahlen je Person im Zeitraum (`userIds` leer = alle mit Personalakte auf diesem Server). */
    async compute(r, userIds) {
        const staff = await this.prisma.personnel.findMany({ where: userIds ? { userId: { in: userIds } } : { employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } }, select: { id: true, userId: true, user: { select: { displayName: true } } } });
        const ids = [...new Set([...staff.map((s) => s.userId), ...(userIds ?? [])])];
        const pid = new Map(staff.map((s) => [s.id, s.userId]));
        const now = new Date(), g = (0, guild_context_1.currentGuild)();
        const [sessions, shifts, reports, trainings, exams, links, meetings, leaves, events, users] = await Promise.all([
            this.prisma.dutySession.findMany({ where: { userId: { in: ids }, status: { in: [...shared_1.WEEK_COUNTED_STATUSES] }, startedAt: { lt: r.to }, OR: [{ endedAt: null }, { endedAt: { gt: r.from } }] }, select: { userId: true, startedAt: true, endedAt: true } }),
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
        const out = new Map(users.map((u) => [u.id, { userId: u.id, name: u.displayName, dutyMinutes: 0, shifts: 0, dutyReports: 0, weeklyReports: 0, trainings: 0, exams: 0, tickets: 0, meetings: 0, absenceDays: 0, events: 0 }]));
        const inc = (u, k, n = 1) => { const x = u ? out.get(u) : undefined; if (x)
            x[k] += n; };
        for (const s of sessions)
            inc(s.userId, 'dutyMinutes', (0, shared_1.minutesWithin)(s.startedAt, s.endedAt, r.from, r.to, now));
        for (const s of shifts)
            inc(s.userId, 'shifts');
        for (const x of reports)
            inc(x.authorId, x.period === 'WEEKLY' ? 'weeklyReports' : 'dutyReports');
        for (const x of trainings)
            inc(pid.get(x.personnelId), 'trainings');
        for (const x of exams)
            inc(pid.get(x.personnelId), 'exams');
        for (const x of tickets)
            inc(discord.get(x.closedById ?? ''), 'tickets');
        for (const x of meetings)
            inc(x.userId, 'meetings');
        for (const x of events)
            inc(x.userId, 'events');
        for (const l of leaves)
            inc(l.userId, 'absenceDays', Math.round((0, shared_1.minutesWithin)(l.startsAt, l.endedAt ?? l.endsAt, r.from, r.to, now) / 1440 * 10) / 10);
        return [...out.values()].map((p) => ({ ...p, dutyMinutes: Math.round(p.dutyMinutes) }));
    }
    /** Eigene Statistik (jeder) bzw. einer anderen Person (analytics.personal_all). */
    async personal(actor, q, userId) {
        if (userId && userId !== actor.userId)
            await this.perms.assert(actor.userId, 'analytics.personal_all');
        const r = this.range(q);
        const [me] = await this.compute(r, [userId ?? actor.userId]);
        return { from: r.from, to: r.to, stats: me ?? null };
    }
    /** Team-Übersicht: Summen, Tagesverlauf Dienststunden, Tabelle je Person (analytics.view + personnel.view für Namen). */
    async overview(actor, q) {
        const r = this.range(q);
        const rows = await this.compute(r);
        const sum = (k) => Math.round(rows.reduce((n, x) => n + x[k], 0) * 10) / 10;
        // Tagesverlauf (Dienststunden je lokalem Tag)
        const sessions = await this.prisma.dutySession.findMany({ where: { status: { in: [...shared_1.WEEK_COUNTED_STATUSES] }, startedAt: { lt: r.to }, OR: [{ endedAt: null }, { endedAt: { gt: r.from } }] }, select: { startedAt: true, endedAt: true } });
        const days = new Map();
        for (let t = r.from.getTime(); t < r.to.getTime() && days.size < 400; t += 86_400_000)
            days.set((0, shared_1.localDate)(new Date(t + 3_600_000 * 3)), 0);
        for (const s of sessions) {
            const k = (0, shared_1.localDate)(s.startedAt < r.from ? r.from : s.startedAt);
            if (days.has(k))
                days.set(k, days.get(k) + (0, shared_1.minutesWithin)(s.startedAt, s.endedAt, r.from, r.to) / 60);
        }
        const showNames = await this.perms.has(actor.userId, 'analytics.personal_all');
        return {
            from: r.from, to: r.to,
            totals: { dutyHours: Math.round(sum('dutyMinutes') / 6) / 10, shifts: sum('shifts'), dutyReports: sum('dutyReports'), weeklyReports: sum('weeklyReports'), trainings: sum('trainings'), exams: sum('exams'), tickets: sum('tickets'), meetings: sum('meetings'), absenceDays: sum('absenceDays'), events: sum('events'), active: rows.filter((x) => x.dutyMinutes > 0).length, people: rows.length },
            series: [...days.entries()].map(([day, h]) => ({ day, hours: Math.round(h * 10) / 10 })),
            people: showNames ? rows.sort((a, b) => b.dutyMinutes - a.dutyMinutes) : [],
        };
    }
    /** Ranglisten (nur eingeschaltete Kennzahlen; Gleichstand = gleicher Platz; Nullwerte erscheinen nicht). */
    async leaderboards(_actor, q) {
        const cfg = await this.config();
        const r = this.range(q);
        const rows = await this.compute(r);
        return {
            from: r.from, to: r.to,
            boards: shared_1.LEADERBOARD_METRICS.filter((m) => cfg.leaderboards.includes(m.key)).map((m) => ({ key: m.key, label: m.label, unit: m.unit, rows: (0, shared_1.rankRows)(rows.map((x) => ({ userId: x.userId, name: x.name, value: x[m.key] })), cfg.size) })),
        };
    }
    async exportCsv(actor, q) {
        const r = this.range(q);
        const rows = await this.compute(r);
        await this.audit.record(actor, { action: 'analytics.export', module: 'analytics', after: { from: r.from, to: r.to, rows: rows.length } });
        return (0, shared_1.toCsv)(['Name', 'Dienstzeit (Std.)', 'Schichten', 'Dienstberichte', 'Wochenberichte', 'Ausbildungen', 'Prüfungen', 'Tickets', 'Besprechungen', 'Abwesenheitstage', 'Termine'], rows.map((x) => [x.name, Math.round(x.dutyMinutes / 6) / 10, x.shifts, x.dutyReports, x.weeklyReports, x.trainings, x.exams, x.tickets, x.meetings, x.absenceDays, x.events]));
    }
};
exports.StatsService = StatsService;
exports.StatsService = StatsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, permission_service_1.PermissionService, audit_service_1.AuditService])
], StatsService);
//# sourceMappingURL=stats.service.js.map