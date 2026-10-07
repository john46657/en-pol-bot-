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
exports.ApplicationsAnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const OPEN = ['SUBMITTED', 'SCREENING', 'INTERVIEW', 'PENDING_DECISION', 'OPEN'];
const DAY = 86_400_000;
const bucket = (s) => (s === 'ACCEPTED' ? 'APPROVED' : s === 'REJECTED' ? 'REJECTED' : OPEN.includes(s) ? 'PENDING' : 'OTHER');
const pct = (a, b) => (b ? (a / b) * 100 : 0);
/** Veränderung gegenüber der Vorperiode in Prozent (ohne Vorperiode: 100 % bei Zuwachs, sonst 0). */
const change = (now, prev) => (prev ? ((now - prev) / prev) * 100 : now ? 100 : 0);
const berlin = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' });
/** Statistik über Polizei-Bewerbungen und Qualifikations-Bewerbungen (SEK, Flugstaffel …) – wie im Bewerbungs-Dashboard von Appy. */
let ApplicationsAnalyticsService = class ApplicationsAnalyticsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async rows(guildId, since) {
        const g = guildId ? { guildId } : {};
        const policeName = 'Polizei-Bewerbung';
        const [apps, qualis] = await Promise.all([
            this.prisma.application.findMany({ where: { ...g, createdAt: { gte: since } }, select: { status: true, createdAt: true, updatedAt: true, decidedAt: true, decidedById: true } }),
            this.prisma.qualificationApplication.findMany({ where: { ...g, createdAt: { gte: since } }, select: { unitName: true, status: true, createdAt: true, decidedAt: true, decidedById: true } }),
        ]);
        return [
            // ältere Entscheidungen ohne gespeicherten Zeitpunkt: letzte Änderung als Näherung
            ...apps.map((a) => ({ type: policeName, bucket: bucket(a.status), createdAt: a.createdAt, decidedAt: a.decidedAt ?? (['ACCEPTED', 'REJECTED'].includes(a.status) ? a.updatedAt : null), reviewerId: a.decidedById })),
            ...qualis.map((q) => ({ type: q.unitName, bucket: bucket(q.status), createdAt: q.createdAt, decidedAt: q.decidedAt, reviewerId: q.decidedById })),
        ];
    }
    async overview(f) {
        const now = Date.now();
        const start = new Date(now - f.days * DAY), prevStart = new Date(now - 2 * f.days * DAY);
        const all = await this.rows(f.guildId, prevStart);
        const types = [...new Set(all.map((r) => r.type))].sort();
        const reviewerIds = [...new Set(all.map((r) => r.reviewerId).filter((x) => !!x))];
        const users = await this.prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, displayName: true } });
        const name = new Map(users.map((u) => [u.id, u.displayName]));
        const filtered = all.filter((r) => (!f.type || r.type === f.type) && (!f.status || r.bucket === f.status) && (!f.reviewer || r.reviewerId === f.reviewer));
        const cur = filtered.filter((r) => r.createdAt >= start), prev = filtered.filter((r) => r.createdAt < start);
        const stats = (xs) => {
            const decided = xs.filter((r) => r.bucket === 'APPROVED' || r.bucket === 'REJECTED');
            const times = decided.filter((r) => r.decidedAt).map((r) => (r.decidedAt.getTime() - r.createdAt.getTime()) / 60_000);
            return { total: xs.length, approvalRate: pct(xs.filter((r) => r.bucket === 'APPROVED').length, decided.length), avgReviewMin: times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0,
                pending: xs.filter((r) => r.bucket === 'PENDING').length, completionRate: pct(decided.length, xs.length) };
        };
        const c = stats(cur), p = stats(prev);
        const kpis = Object.keys(c).map((k) => ({ key: k, value: c[k], change: change(c[k], p[k]) }));
        // Verlauf je Tag (Berliner Zeit) + gleitender 7-Tage-Schnitt
        const dayKey = (d) => { const x = Object.fromEntries(berlin.formatToParts(d).map((q) => [q.type, q.value])); return `${x.year}-${x.month}-${x.day}`; };
        const counts = new Map();
        for (const r of cur)
            counts.set(dayKey(r.createdAt), (counts.get(dayKey(r.createdAt)) ?? 0) + 1);
        const days = Array.from({ length: f.days }, (_, i) => dayKey(new Date(now - (f.days - 1 - i) * DAY)));
        const overTime = days.map((d, i) => {
            const win = days.slice(Math.max(0, i - 6), i + 1);
            return { date: d, count: counts.get(d) ?? 0, avg7: win.reduce((n, x) => n + (counts.get(x) ?? 0), 0) / win.length };
        });
        const breakdown = { APPROVED: cur.filter((r) => r.bucket === 'APPROVED').length, PENDING: cur.filter((r) => r.bucket === 'PENDING').length, REJECTED: cur.filter((r) => r.bucket === 'REJECTED').length };
        const byType = [...new Set(cur.map((r) => r.type))].map((t) => {
            const xs = cur.filter((r) => r.type === t), s = stats(xs);
            return { type: t, submitted: xs.length, approvalRate: s.approvalRate, avgReviewMin: s.avgReviewMin };
        }).sort((a, b) => b.submitted - a.submitted);
        const reviewers = [...new Set(cur.map((r) => r.reviewerId).filter((x) => !!x))].map((id) => {
            const xs = cur.filter((r) => r.reviewerId === id && (r.bucket === 'APPROVED' || r.bucket === 'REJECTED')), s = stats(xs);
            return { id, name: name.get(id) ?? 'Unbekannt', reviewed: xs.length, approvalRate: s.approvalRate, avgReviewMin: s.avgReviewMin };
        }).sort((a, b) => b.reviewed - a.reviewed).slice(0, 10);
        // Einreichungen nach Wochentag × Stunde (Berliner Zeit)
        const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
        for (const r of cur) {
            const x = Object.fromEntries(berlin.formatToParts(r.createdAt).map((q) => [q.type, q.value]));
            const d = WD.indexOf(x.weekday);
            if (d >= 0)
                heat[d][Number(x.hour) % 24]++;
        }
        return { days: f.days, kpis, overTime, breakdown, byType, reviewers, heat, filters: { types, reviewers: reviewerIds.map((id) => ({ id, name: name.get(id) ?? 'Unbekannt' })) } };
    }
};
exports.ApplicationsAnalyticsService = ApplicationsAnalyticsService;
exports.ApplicationsAnalyticsService = ApplicationsAnalyticsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ApplicationsAnalyticsService);
//# sourceMappingURL=applications-analytics.service.js.map