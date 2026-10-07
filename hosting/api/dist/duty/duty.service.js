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
exports.DutyService = void 0;
const common_1 = require("@nestjs/common");
const realtime_service_1 = require("../realtime/realtime.service");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
const discord_service_1 = require("../discord/discord.service");
const shifts_1 = require("./shifts");
/** Dienststatus wird ausschließlich explizit gesetzt – Online-Status ist niemals Dienststatus. */
let DutyService = class DutyService {
    prisma;
    audit;
    rt;
    discord;
    shifts;
    constructor(prisma, audit, rt, discord, shifts) {
        this.prisma = prisma;
        this.audit = audit;
        this.rt = rt;
        this.discord = discord;
        this.shifts = shifts;
    }
    async setStatus(actor, status, d, targetUserId) {
        const userId = targetUserId ?? actor.userId;
        let previous = null;
        const cfg = await this.shifts.config();
        let type = null;
        return this.prisma.$transaction(async (tx) => {
            const open = await tx.dutySession.findFirst({ where: { userId, endedAt: null } });
            type = status === 'OFF_DUTY' ? (cfg.types.find((t) => t.id === open?.shiftType) ?? null) : await this.shifts.resolve(cfg, d.shiftType, open?.shiftType);
            const sameType = !type || status === 'OFF_DUTY' || type.id === open?.shiftType;
            if ((open?.status ?? 'OFF_DUTY') === status && !d.unitId && sameType)
                throw new errors_1.AppError('CONFLICT', `Dieser Status ist bereits gesetzt (${status}).`);
            if (targetUserId && !(await tx.user.findUnique({ where: { id: targetUserId, active: true } })))
                throw new errors_1.AppError('NOT_FOUND', 'Benutzer nicht gefunden.');
            const at = new Date(); // gleicher Zeitpunkt für Ende und Beginn → Schicht-Logs erkennen zusammenhängende Sitzungen
            if (open)
                await tx.dutySession.update({ where: { id: open.id }, data: { endedAt: at } });
            previous = open ? { status: open.status, startedAt: open.startedAt, shiftType: open.shiftType } : null;
            if (d.unitId && !(await tx.unit.findUnique({ where: { id: d.unitId } })))
                throw new errors_1.AppError('NOT_FOUND', 'Einheit nicht gefunden.');
            let created = null;
            if (status !== 'OFF_DUTY') {
                const pers = await tx.personnel.findUnique({ where: { userId } });
                created = await tx.dutySession.create({ data: { userId, status, startedAt: at, lastActivityAt: at, unitId: d.unitId, shiftType: type?.id ?? null, callsign: (d.callsign ?? pers?.callsign ?? undefined)?.toUpperCase() } });
            }
            await this.audit.record(actor, { action: targetUserId && targetUserId !== actor.userId ? 'duty.status.set_by_supervisor' : 'duty.status', module: 'team', entityType: 'User', entityId: userId, before: { status: open?.status ?? 'OFF_DUTY' }, after: { status } }, tx);
            return created ?? { status: 'OFF_DUTY' };
        }).then(async (r) => {
            this.rt.publish('team', 'duty.changed', { userId, status });
            const before = previous;
            const t = type;
            if ((before?.status ?? 'OFF_DUTY') !== status || (t && status !== 'OFF_DUTY' && t.id !== before?.shiftType))
                await this.notifyDiscord(actor, userId, status, before, cfg, t);
            return r;
        });
    }
    /**
     * Discord-Abgleich: Dienst-Rollen (Im Dienst/Pause/Training/Verwaltung) und Meldung im Dienst-Channel.
     * Wird nur eingereiht, wenn ein Dienst-Channel oder eine Dienst-Rolle eingestellt ist. Fehler stören den Statuswechsel nie.
     */
    async notifyDiscord(actor, userId, status, before, cfg, type) {
        try {
            const ch = await this.discord.channels();
            // Schichten-Modul an: Rollen und Log-Channel der Schicht-Art; sonst die Dienst-Rollen aus den Einstellungen
            const shift = cfg.enabled && cfg.types.length ? { ...shifts_1.ShiftsService.roleChanges(cfg, type, status), channelId: type?.logChannelId ?? null, name: type?.name ?? null } : null;
            const roles = shift ? shift.add.length + shift.remove.length > 0 : !!(ch.dutyRole || ch.breakRole || ch.trainingRole || ch.adminDutyRole);
            if (!ch.duty && !roles && !shift?.channelId)
                return;
            const [user, link] = await Promise.all([
                this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, personnel: { select: { callsign: true, rank: true } } } }),
                this.prisma.discordLink.findUnique({ where: { userId } }),
            ]);
            const by = actor.userId && actor.userId !== userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
            await this.discord.enqueue('duty', 'duty.changed', {
                discordId: link?.discordId ?? null, name: user?.displayName ?? '—', callsign: user?.personnel?.callsign ?? null, rank: user?.personnel?.rank ?? null,
                status, previous: before?.status ?? 'OFF_DUTY', previousMinutes: before ? Math.round((Date.now() - before.startedAt.getTime()) / 60_000) : null, setBy: by?.displayName ?? null,
                ...(shift ? { shiftType: shift.name, roles: { add: shift.add, remove: shift.remove }, ...(shift.channelId ? { channelId: shift.channelId } : {}) } : {}),
            }, { always: roles || !!shift?.channelId });
        }
        catch { /* best effort */ }
    }
    touched = new Map();
    /** Aktivität merken (höchstens einmal pro Minute in die Datenbank). Nur laufende Schichten „Im Dienst“. */
    async touch(userId, force = false) {
        const now = Date.now();
        if (!force && now - (this.touched.get(userId) ?? 0) < 60_000)
            return;
        this.touched.set(userId, now);
        if (this.touched.size > 5000)
            this.touched.clear();
        await this.prisma.dutySession.updateMany({ where: { userId, endedAt: null, status: 'ON_DUTY' }, data: { lastActivityAt: new Date(now) } }).catch(() => undefined);
    }
    /** „Bin noch im Dienst“ / Herzschlag aus dem Dashboard. */
    async active(userId) {
        await this.touch(userId, true);
        const open = await this.prisma.dutySession.findFirst({ where: { userId, endedAt: null } });
        return { onDuty: open?.status === 'ON_DUTY', status: open?.status ?? 'OFF_DUTY' };
    }
    /**
     * Jede Minute: Wer „Im Dienst“ ist und seit `afterMinutes` nichts gemacht hat, bekommt eine Erinnerung (Discord-DM mit Buttons + Glocke im Dashboard).
     * Mit `autoOffMinutes` endet die Schicht automatisch, wenn danach weiter nichts passiert. Pause/Training/Verwaltung sind ausgenommen.
     */
    async remindTick(now = new Date()) {
        const { reminder: r } = await this.shifts.config();
        const out = { reminded: 0, ended: 0 };
        if (!r.enabled)
            return out;
        const sessions = await this.prisma.dutySession.findMany({ where: { endedAt: null, status: 'ON_DUTY' } });
        for (const s of sessions) {
            const last = Math.max(s.startedAt.getTime(), s.lastActivityAt?.getTime() ?? 0);
            const link = await this.prisma.discordLink.findUnique({ where: { userId: s.userId } });
            if (s.remindedAt && s.remindedAt.getTime() >= last) {
                // schon erinnert, seitdem nichts passiert
                if (r.autoOffMinutes > 0 && now.getTime() - s.remindedAt.getTime() >= r.autoOffMinutes * 60_000) {
                    await this.setStatus({ userId: null }, 'OFF_DUTY', {}, s.userId).catch(() => undefined);
                    const minutes = Math.round((now.getTime() - s.startedAt.getTime()) / 60_000);
                    await this.prisma.notification.create({ data: { userId: s.userId, type: 'DUTY_REMINDER', title: 'Deine Schicht wurde automatisch beendet', body: `Keine Aktivität seit ${Math.round((now.getTime() - last) / 60_000)} Minuten.` } });
                    if (link)
                        await this.discord.enqueue('duty', 'duty.reminder', { kind: 'ended', discordId: link.discordId, idleMinutes: Math.round((now.getTime() - last) / 60_000), shiftMinutes: minutes }, { always: true });
                    out.ended++;
                }
                continue;
            }
            if (now.getTime() - last < r.afterMinutes * 60_000)
                continue;
            await this.prisma.dutySession.update({ where: { id: s.id }, data: { remindedAt: now } });
            const idle = Math.round((now.getTime() - last) / 60_000);
            await this.prisma.notification.create({ data: { userId: s.userId, type: 'DUTY_REMINDER', title: 'Bist du noch im Dienst?', body: `Seit ${idle} Minuten keine Aktivität.${r.autoOffMinutes ? ` Ohne Reaktion endet deine Schicht in ${r.autoOffMinutes} Minuten automatisch.` : ''}` } });
            if (link)
                await this.discord.enqueue('duty', 'duty.reminder', { kind: 'reminder', discordId: link.discordId, idleMinutes: idle, autoOffMinutes: r.autoOffMinutes }, { always: true });
            this.rt.publish('team', 'duty.reminder', { userId: s.userId });
            out.reminded++;
        }
        return out;
    }
    team() {
        return this.prisma.dutySession.findMany({
            where: { endedAt: null },
            include: { user: { select: { id: true, displayName: true, personnel: { select: { rank: true, callsign: true } } } } },
            orderBy: { startedAt: 'asc' },
        });
    }
    mine(userId) { return this.prisma.dutySession.findFirst({ where: { userId, endedAt: null } }); }
    /**
     * Dienststunden der letzten `days` Tage, pro Benutzer und Status (in Minuten).
     * Sitzungen, die vor dem Zeitraum begonnen haben oder noch laufen, zählen nur mit dem Anteil im Zeitraum.
     */
    async hours(days, userId) {
        const now = new Date();
        const since = new Date(now.getTime() - days * 86_400_000);
        const sessions = await this.prisma.dutySession.findMany({
            where: { ...(userId ? { userId } : {}), OR: [{ endedAt: null }, { endedAt: { gt: since } }] },
            include: { user: { select: { displayName: true, personnel: { select: { rank: true, callsign: true } } } } },
        });
        const rows = new Map();
        for (const s of sessions) {
            const from = Math.max(s.startedAt.getTime(), since.getTime());
            const to = (s.endedAt ?? now).getTime();
            if (to <= from)
                continue;
            const r = rows.get(s.userId) ?? { userId: s.userId, name: s.user.displayName, rank: s.user.personnel?.rank ?? null, callsign: s.user.personnel?.callsign ?? null, minutes: 0, byStatus: {}, sessions: 0 };
            const min = (to - from) / 60_000;
            r.minutes += min;
            r.byStatus[s.status] = (r.byStatus[s.status] ?? 0) + min;
            r.sessions++;
            rows.set(s.userId, r);
        }
        const round = (r) => ({ ...r, minutes: Math.round(r.minutes), byStatus: Object.fromEntries(Object.entries(r.byStatus).map(([k, v]) => [k, Math.round(v)])) });
        const users = [...rows.values()].map(round).sort((a, b) => b.minutes - a.minutes);
        return { days, since, users };
    }
    /**
     * Schicht-Logs: zusammenhängende Dienst-Sitzungen (Im Dienst ↔ Pause ↔ Schichtwechsel) bis „Außer Dienst“ ergeben eine Schicht.
     * Je Schicht: wer, Schichtart, Beginn/Ende, Dauer, Pausen und wer sie gestartet/beendet hat (aus dem Audit-Log).
     */
    async shiftLog(f) {
        const now = new Date();
        const since = new Date(now.getTime() - f.days * 86_400_000);
        // Sitzungen etwas vor dem Zeitraum mitnehmen, damit Schichten über die Grenze vollständig sind
        const sessions = await this.prisma.dutySession.findMany({
            where: { ...(f.userId ? { userId: f.userId } : {}), OR: [{ endedAt: null }, { endedAt: { gt: new Date(since.getTime() - 86_400_000) } }] },
            include: { user: { select: { displayName: true, personnel: { select: { rank: true, callsign: true } } } } },
            orderBy: [{ userId: 'asc' }, { startedAt: 'asc' }],
        });
        const groups = [];
        for (const s of sessions) {
            const g = groups[groups.length - 1];
            const prev = g?.[g.length - 1];
            // Statuswechsel beendet die alte Sitzung und startet die neue im selben Moment → gleiche Schicht
            if (prev && prev.userId === s.userId && prev.endedAt?.getTime() === s.startedAt.getTime())
                g.push(s);
            else
                groups.push([s]);
        }
        const cfg = await this.shifts.config();
        const typeName = (id) => (id ? cfg.types.find((t) => t.id === id)?.name ?? id : null);
        const shifts = groups.map((g) => {
            const first = g[0], last = g[g.length - 1];
            const end = last.endedAt;
            const ms = (s) => (s.endedAt ?? now).getTime() - s.startedAt.getTime();
            const types = [...new Set(g.map((s) => s.shiftType).filter((x) => !!x))];
            return {
                id: first.id, userId: first.userId, name: first.user.displayName, rank: first.user.personnel?.rank ?? null, callsign: last.callsign ?? first.user.personnel?.callsign ?? null,
                shiftTypes: types, shiftType: typeName(types[0] ?? null), shiftTypeNames: types.map((t) => typeName(t)),
                startedAt: first.startedAt, endedAt: end, active: !end, status: end ? 'OFF_DUTY' : last.status,
                minutes: Math.round(g.reduce((n, s) => n + ms(s), 0) / 60_000),
                breakMinutes: Math.round(g.filter((s) => s.status === 'BREAK').reduce((n, s) => n + ms(s), 0) / 60_000),
                breaks: g.filter((s) => s.status === 'BREAK').length,
                startedBy: null, endedBy: null,
            };
        }).filter((x) => (x.endedAt ?? now) > since && (!f.shiftType || x.shiftTypes.includes(f.shiftType)))
            .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, 500);
        // Wer hat gestartet/beendet? Audit-Eintrag zum Statuswechsel (selbst, per Discord oder durch die Schichtleitung)
        if (shifts.length) {
            const audits = await this.prisma.auditLog.findMany({
                where: { module: 'team', action: { in: ['duty.status', 'duty.status.set_by_supervisor'] }, entityType: 'User', entityId: { in: [...new Set(shifts.map((s) => s.userId))] }, createdAt: { gt: new Date(since.getTime() - 86_400_000) } },
                select: { actorUserId: true, entityId: true, createdAt: true },
            });
            const names = new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set(audits.map((a) => a.actorUserId).filter((x) => !!x))] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
            const near = (userId, at) => {
                if (!at)
                    return null;
                const a = audits.filter((x) => x.entityId === userId && Math.abs(x.createdAt.getTime() - at.getTime()) < 10_000).sort((x, y) => Math.abs(x.createdAt.getTime() - at.getTime()) - Math.abs(y.createdAt.getTime() - at.getTime()))[0];
                return a?.actorUserId ? names.get(a.actorUserId) ?? null : null;
            };
            for (const s of shifts) {
                s.startedBy = near(s.userId, s.startedAt);
                s.endedBy = near(s.userId, s.endedAt);
            }
        }
        return { days: f.days, since, items: shifts.map(({ shiftTypes: _, ...s }) => s) };
    }
    /** Team-Dashboard: pro aktivem Beamten Dienststatus, Einheit, aktueller Einsatz und letzte Statusänderung. */
    async overview() {
        const [people, open, units, assignments, cfg] = await Promise.all([
            this.prisma.personnel.findMany({ where: { employmentStatus: 'ACTIVE' }, include: { user: { select: { id: true, displayName: true, active: true } } }, orderBy: { callsign: 'asc' } }),
            this.prisma.dutySession.findMany({ where: { endedAt: null } }),
            this.prisma.unit.findMany({ include: { members: true } }),
            this.prisma.incidentUnit.findMany({ where: { clearedAt: null, incident: { status: { notIn: ['CLOSED', 'CANCELLED'] } } }, include: { incident: { select: { id: true, number: true, title: true, status: true, priority: true } } } }),
            this.shifts.config(),
        ]);
        const ids = people.map((p) => p.userId);
        const lastEnded = await this.prisma.dutySession.groupBy({ by: ['userId'], where: { userId: { in: ids }, endedAt: { not: null } }, _max: { endedAt: true } });
        const ended = new Map(lastEnded.map((l) => [l.userId, l._max.endedAt]));
        return people.filter((p) => p.user.active).map((p) => {
            const session = open.find((o) => o.userId === p.userId);
            const unit = units.find((u) => u.members.some((m) => m.userId === p.userId));
            const inc = unit ? assignments.find((a) => a.unitId === unit.id)?.incident ?? null : null;
            return {
                userId: p.userId, personnelId: p.id, name: p.user.displayName, rank: p.rank, callsign: p.callsign, team: p.team,
                dutyStatus: session?.status ?? 'OFF_DUTY', onDutySince: session?.startedAt ?? null,
                // Leitstelle: seit wann nichts mehr gemacht (Dashboard/MDT, Discord); `reminded` = Erinnerung ist raus, noch keine Reaktion
                lastActivityAt: session ? new Date(Math.max(session.startedAt.getTime(), session.lastActivityAt?.getTime() ?? 0)) : null,
                reminded: !!session?.remindedAt && session.remindedAt.getTime() >= Math.max(session.startedAt.getTime(), session.lastActivityAt?.getTime() ?? 0),
                shiftType: cfg.enabled ? cfg.types.find((t) => t.id === session?.shiftType)?.name ?? null : null,
                lastStatusChange: session?.startedAt ?? ended.get(p.userId) ?? null,
                unit: unit ? { id: unit.id, callsign: unit.callsign, status: unit.status } : null,
                currentIncident: inc,
            };
        });
    }
};
exports.DutyService = DutyService;
exports.DutyService = DutyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, realtime_service_1.RealtimeService, discord_service_1.DiscordService, shifts_1.ShiftsService])
], DutyService);
//# sourceMappingURL=duty.service.js.map