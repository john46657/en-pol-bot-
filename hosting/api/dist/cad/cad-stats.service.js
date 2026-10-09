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
exports.CadStatsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const cad_config_service_1 = require("./cad-config.service");
const TZ = 'Europe/Berlin';
const dayKey = (d) => d.toLocaleDateString('sv-SE', { timeZone: TZ }); // YYYY-MM-DD
/** ISO-Kalenderwoche, z. B. 2026-W43 (nach deutschem Datum) */
function weekKey(d) {
    const [y, m, day] = dayKey(d).split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, day));
    const wd = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - wd);
    const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return `${t.getUTCFullYear()}-W${String(Math.ceil(((t.getTime() - start.getTime()) / 86_400_000 + 1) / 7)).padStart(2, '0')}`;
}
const count = (rows, key) => {
    const m = new Map();
    for (const r of rows) {
        const k = key(r);
        for (const x of Array.isArray(k) ? k : k ? [k] : [])
            m.set(x, (m.get(x) ?? 0) + 1);
    }
    return m;
};
const sorted = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const median = (xs) => { if (!xs.length)
    return null; const s = [...xs].sort((a, b) => a - b); const h = Math.floor(s.length / 2); return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
/**
 * Leitstellenstatistik – ausschließlich aus gespeicherten Daten:
 * abgeschlossene Einsätze aus `CadIncidentStat` (bleibt nach dem Löschen der Einsätze erhalten), offene aus `Incident`,
 * Dienstzeiten aus den intern erfassten Dienstsitzungen (`DutySession`) – nicht aus ER:LC-Onlinezeiten.
 */
let CadStatsService = class CadStatsService {
    prisma;
    cfg;
    constructor(prisma, cfg) {
        this.prisma = prisma;
        this.cfg = cfg;
    }
    async stats(days) {
        const cfg = await this.cfg.get();
        const now = new Date();
        const since = new Date(now.getTime() - days * 86_400_000);
        const closedKeys = cfg.incidentStatuses.filter((s) => s.closed).map((s) => s.key);
        const [archived, open, duty] = await Promise.all([
            this.prisma.cadIncidentStat.findMany({ where: { OR: [{ createdAt: { gte: since } }, { closedAt: { gte: since } }] } }),
            this.prisma.incident.findMany({ where: { status: { notIn: closedKeys } }, select: { id: true, type: true, priority: true, status: true, source: true, createdAt: true, units: { select: { unit: { select: { callsign: true, type: true } } } } } }),
            this.prisma.dutySession.findMany({ where: { startedAt: { lt: now }, OR: [{ endedAt: null }, { endedAt: { gte: since } }] }, select: { userId: true, startedAt: true, endedAt: true } }),
        ]);
        const label = (list, k) => (k ? list.find((x) => x.key === k)?.label ?? k : 'Ohne Angabe');
        // Einsätze, die im Zeitraum angelegt wurden (abgeschlossene + noch offene)
        const created = [
            ...archived.filter((a) => a.createdAt >= since).map((a) => ({ type: a.type, priority: a.priority, source: a.source, createdAt: a.createdAt, units: a.units, unitTypes: a.unitTypes })),
            ...open.filter((i) => i.createdAt >= since).map((i) => ({ type: i.type, priority: i.priority, source: i.source, createdAt: i.createdAt, units: [...new Set(i.units.map((u) => u.unit.callsign))], unitTypes: [...new Set(i.units.map((u) => u.unit.type).filter((t) => !!t))] })),
        ];
        const closed = archived.filter((a) => a.closedAt >= since);
        const minutes = closed.map((a) => Math.max(0, (a.closedAt.getTime() - a.createdAt.getTime()) / 60_000));
        // Zeitreihen lückenlos (auch Tage ohne Einsatz)
        const byDay = new Map(), byWeek = new Map(), byMonth = new Map();
        for (let t = since.getTime(); t <= now.getTime() + 1; t += 86_400_000) {
            const d = new Date(t);
            byDay.set(dayKey(d), 0);
            byWeek.set(weekKey(d), 0);
            byMonth.set(dayKey(d).slice(0, 7), 0);
        }
        for (const c of created) {
            byDay.set(dayKey(c.createdAt), (byDay.get(dayKey(c.createdAt)) ?? 0) + 1);
            byWeek.set(weekKey(c.createdAt), (byWeek.get(weekKey(c.createdAt)) ?? 0) + 1);
            const mk = dayKey(c.createdAt).slice(0, 7);
            byMonth.set(mk, (byMonth.get(mk) ?? 0) + 1);
        }
        const series = (m) => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, value]) => ({ key, value }));
        // Dienstzeiten im Zeitraum (laufende Sitzungen bis jetzt, auf den Zeitraum zugeschnitten)
        const perUser = new Map();
        for (const s of duty) {
            const ms = Math.min((s.endedAt ?? now).getTime(), now.getTime()) - Math.max(s.startedAt.getTime(), since.getTime());
            if (ms > 0)
                perUser.set(s.userId, (perUser.get(s.userId) ?? 0) + ms);
        }
        const top = [...perUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
        const users = await this.prisma.user.findMany({ where: { id: { in: top.map(([id]) => id) } }, select: { id: true, displayName: true } });
        const uname = new Map(users.map((u) => [u.id, u.displayName]));
        const hours = (ms) => Math.round((ms / 3_600_000) * 10) / 10;
        return {
            days, since: since.toISOString(), generatedAt: now.toISOString(),
            totals: {
                created: created.length, closed: closed.length, openNow: open.length,
                avgHandlingMin: minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : null,
                medianHandlingMin: minutes.length ? Math.round(median(minutes)) : null,
            },
            byDay: series(byDay), byWeek: series(byWeek), byMonth: series(byMonth),
            byType: sorted(count(created, (c) => c.type ?? 'Ohne Angabe')).map(([k, v]) => ({ key: k, label: label(cfg.incidentTypes, k === 'Ohne Angabe' ? null : k), value: v })),
            byPriority: sorted(count(created, (c) => c.priority)).map(([k, v]) => ({ key: k, label: label(cfg.priorities, k), color: cfg.priorities.find((p) => p.key === k)?.color ?? null, value: v })),
            byClosedStatus: sorted(count(closed, (c) => c.status)).map(([k, v]) => ({ key: k, label: label(cfg.incidentStatuses, k), value: v })),
            bySource: sorted(count(created, (c) => c.source)).map(([k, v]) => ({ key: k, label: k === 'ERLC_CALL' ? 'Aus ER:LC-Notruf' : k === 'CAD' ? 'Im CAD angelegt' : k, value: v })),
            units: sorted(count(created, (c) => c.units)).slice(0, 30).map(([k, v]) => ({ key: k, label: k, value: v })),
            unitTypes: sorted(count(created, (c) => c.unitTypes)).map(([k, v]) => ({ key: k, label: label(cfg.unitTypes, k), value: v })),
            duty: {
                totalHours: hours([...perUser.values()].reduce((a, b) => a + b, 0)), officers: perUser.size, sessions: duty.length,
                top: top.map(([id, ms]) => ({ userId: id, name: uname.get(id) ?? '—', hours: hours(ms) })),
            },
        };
    }
};
exports.CadStatsService = CadStatsService;
exports.CadStatsService = CadStatsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, cad_config_service_1.CadConfigService])
], CadStatsService);
//# sourceMappingURL=cad-stats.service.js.map