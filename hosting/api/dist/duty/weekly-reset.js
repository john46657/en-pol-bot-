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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeeklyResetController = exports.WeeklyResetService = exports.weeklyResetConfigSchema = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const discord_service_1 = require("../discord/discord.service");
const realtime_service_1 = require("../realtime/realtime.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const errors_1 = require("../common/errors");
const CONFIG_KEY = 'duty.weeklyReset';
const STATE_KEY = 'duty.weeklyReset.state';
/** Postgres-Advisory-Lock: nur eine Instanz führt einen Reset gleichzeitig aus. */
const LOCK_ID = 7_310_442_001;
/** So viele verpasste Wochen werden höchstens nachgeholt (ältere bleiben ohne Archiv, die Dienstzeiten selbst bleiben erhalten). */
const MAX_CATCH_UP_WEEKS = 104;
exports.weeklyResetConfigSchema = zod_1.z.object({
    /** Wochen-Reset aktiv (Archiv + Rangliste + Zähler auf null) */
    enabled: zod_1.z.boolean().default(true),
    /** Discord-Kanal der Rangliste; leer = Dienst-Kanal aus den Einstellungen */
    channelId: zod_1.z.string().regex(/^\d{15,25}$/).nullish().transform((v) => v ?? null),
    /** so viele Plätze in der Discord-Rangliste */
    topN: zod_1.z.number().int().min(1).max(25).default(10),
    /** Beamte in der Rangliste mit Discord-Erwähnung (ohne Ping) */
    mention: zod_1.z.boolean().default(true),
});
const hm = (min) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
const MEDALS = ['🥇', '🥈', '🥉'];
/**
 * Automatischer Wochen-Reset: jeden Montag 00:00 (Europe/Berlin, Sommer-/Winterzeit automatisch) wird die abgelaufene Woche
 * archiviert, die Rangliste in Discord veröffentlicht und erst danach der Wochenzähler auf die neue Woche gesetzt.
 * Gelöscht wird dabei nichts – der Zähler ist nur der Beginn der laufenden Woche; alle Schichten bleiben in `DutySession`.
 * Doppelte Resets verhindern Advisory-Lock + eindeutiges `weekStart` + Archiv/Discord/Zähler in EINER Transaktion.
 */
let WeeklyResetService = class WeeklyResetService {
    prisma;
    audit;
    discord;
    rt;
    constructor(prisma, audit, discord, rt) {
        this.prisma = prisma;
        this.audit = audit;
        this.discord = discord;
        this.rt = rt;
    }
    async config() {
        const v = (await this.prisma.systemSetting.findUnique({ where: { key: CONFIG_KEY } }))?.value;
        const r = exports.weeklyResetConfigSchema.safeParse(v ?? {});
        return r.success ? r.data : exports.weeklyResetConfigSchema.parse({});
    }
    async saveConfig(actor, input) {
        const before = await this.config();
        const value = input;
        await this.prisma.$transaction(async (tx) => {
            await tx.systemSetting.upsert({ where: { key: CONFIG_KEY }, create: { key: CONFIG_KEY, value }, update: { value } });
            await this.audit.record(actor, { action: 'duty.weekly_reset.config', module: 'team', entityType: 'SystemSetting', entityId: CONFIG_KEY, before: before, after: value }, tx);
        });
        return this.config();
    }
    async state(db = this.prisma) {
        const v = (await db.systemSetting.findUnique({ where: { key: STATE_KEY } }))?.value;
        return v && typeof v.currentWeekStart === 'string' && !Number.isNaN(Date.parse(v.currentWeekStart)) ? { currentWeekStart: v.currentWeekStart, lastResetAt: v.lastResetAt ?? null, lastArchiveId: v.lastArchiveId ?? null } : null;
    }
    async setState(tx, s) {
        const value = s;
        await tx.systemSetting.upsert({ where: { key: STATE_KEY }, create: { key: STATE_KEY, value }, update: { value } });
    }
    /**
     * Prüft (jede halbe Minute und beim Start), ob ein Montag 00:00 überschritten ist, und holt jeden fälligen Reset genau einmal nach.
     * Ältere verpasste Wochen werden still archiviert; nur die zuletzt abgeschlossene Woche wird in Discord veröffentlicht.
     */
    async tick(now = new Date()) {
        const cfg = await this.config();
        const out = { archived: [], posted: 0 };
        if (!cfg.enabled)
            return out;
        const target = (0, shared_1.weekStartOf)(now);
        for (let i = 0; i < MAX_CATCH_UP_WEEKS + 1; i++) {
            const r = await this.prisma.$transaction(async (tx) => {
                await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK_ID})`);
                const st = await this.state(tx);
                // Erster Start: Zähler beginnt mit der laufenden Woche (frühere Wochen werden nicht rückwirkend veröffentlicht)
                if (!st) {
                    await this.setState(tx, { currentWeekStart: target.toISOString(), lastResetAt: null, lastArchiveId: null });
                    return null;
                }
                let start = new Date(st.currentWeekStart);
                if (start >= target)
                    return null;
                // zu lange aus: auf die letzten MAX_CATCH_UP_WEEKS Wochen springen
                const oldest = (() => { let p = target; for (let k = 0; k < MAX_CATCH_UP_WEEKS; k++)
                    p = (0, shared_1.weekStartOf)(new Date(p.getTime() - 1)); return p; })();
                if (start < oldest)
                    start = oldest;
                start = (0, shared_1.weekStartOf)(start); // falls der gespeicherte Wert kein Wochenbeginn ist
                const end = (0, shared_1.nextWeekStart)(start);
                const latest = end.getTime() >= target.getTime();
                const existing = await tx.dutyWeekArchive.findUnique({ where: { weekStart: start }, select: { id: true } });
                let archive = existing ? { id: existing.id, posted: false } : null;
                if (!archive)
                    archive = await this.archiveWeek(tx, cfg, start, end, now, latest);
                // erst NACH Archiv und Rangliste: Wochenzähler auf die neue Woche
                await this.setState(tx, { currentWeekStart: end.toISOString(), lastResetAt: now.toISOString(), lastArchiveId: archive.id });
                return { key: (0, shared_1.weekKey)(start), posted: archive.posted, created: !existing };
            }, { timeout: 60_000, maxWait: 30_000 });
            if (!r)
                break;
            if (r.created)
                out.archived.push(r.key);
            if (r.posted)
                out.posted++;
        }
        if (out.archived.length)
            this.rt.publish('team', 'duty.week.reset', { weeks: out.archived });
        return out;
    }
    /** Archiv der Woche [start, end) anlegen; bei der zuletzt abgeschlossenen Woche die Rangliste in die Discord-Warteschlange stellen. */
    async archiveWeek(tx, cfg, start, end, now, latest) {
        const rows = await tx.dutySession.findMany({
            where: { startedAt: { lt: end }, OR: [{ endedAt: null }, { endedAt: { gt: start } }] },
            select: { id: true, userId: true, serverId: true, status: true, shiftType: true, callsign: true, unitId: true, startedAt: true, endedAt: true },
            orderBy: { startedAt: 'asc' },
        });
        const ranking = await this.rank(tx, (0, shared_1.weekTotals)(rows, start, end, now));
        const clip = (d) => new Date(Math.min(Math.max(d.getTime(), start.getTime()), end.getTime())).toISOString();
        const sessions = rows.map((s) => ({ ...s, startedAt: s.startedAt.toISOString(), endedAt: s.endedAt?.toISOString() ?? null, countedFrom: clip(s.startedAt), countedTo: clip(s.endedAt ?? now) }));
        const label = (0, shared_1.weekLabel)(start);
        const totalMinutes = ranking.reduce((n, r) => n + r.minutes, 0);
        const channelId = latest ? cfg.channelId ?? (await this.discord.channels()).duty?.split(',')[0]?.trim() ?? null : null;
        const created = await tx.dutyWeekArchive.create({
            data: {
                weekStart: start, weekEnd: end, weekKey: (0, shared_1.weekKey)(start), label, timezone: shared_1.WEEK_TIMEZONE, totalMinutes, activeUsers: ranking.length, shiftCount: rows.length,
                ranking: ranking, sessions: sessions,
                discordChannelId: channelId || null, catchUp: now.getTime() - end.getTime() > 5 * 60_000,
            },
        });
        // gleicher Schlüssel je Woche: selbst ein erneut eingereihter Auftrag bearbeitet nur die schon gesendete Nachricht
        if (channelId)
            await this.discord.postMessage(`week-rank-${created.weekKey}`, channelId, this.message(cfg, label, start, end, ranking, totalMinutes), { tx });
        await this.audit.record({ userId: null }, { action: 'duty.weekly_reset', module: 'team', entityType: 'DutyWeekArchive', entityId: created.id, after: { week: created.weekKey, label, activeUsers: ranking.length, totalMinutes, discordChannelId: channelId || null, catchUp: created.catchUp } }, tx);
        return { id: created.id, posted: !!channelId };
    }
    async rank(db, totals) {
        const ids = totals.map((t) => t.userId);
        const [users, links] = await Promise.all([
            db.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, personnel: { select: { rank: true, callsign: true } } } }),
            db.discordLink.findMany({ where: { userId: { in: ids } }, select: { userId: true, discordId: true } }),
        ]);
        const u = new Map(users.map((x) => [x.id, x])), l = new Map(links.map((x) => [x.userId, x.discordId]));
        return totals.map((t, i) => ({ place: i + 1, ...t, name: u.get(t.userId)?.displayName ?? 'Unbekannt', rank: u.get(t.userId)?.personnel?.rank ?? null, callsign: u.get(t.userId)?.personnel?.callsign ?? null, discordId: l.get(t.userId) ?? null }));
    }
    message(cfg, label, start, end, ranking, total) {
        const f = (d) => d.toLocaleString('de-DE', { timeZone: shared_1.WEEK_TIMEZONE, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const top = ranking.filter((r) => r.minutes > 0).slice(0, cfg.topN);
        const lines = top.map((r, i) => `${MEDALS[i] ?? `**${i + 1}.**`} ${cfg.mention && r.discordId ? `<@${r.discordId}>` : `**${r.name}**`}${r.callsign ? ` (${r.callsign})` : ''} – ${hm(r.minutes)} · ${r.sessions} ${r.sessions === 1 ? 'Sitzung' : 'Sitzungen'}`);
        return {
            embeds: [{
                    title: `🏆 Wochenrangliste · ${label}`,
                    description: (lines.length ? lines.join('\n') : '_Diese Woche war niemand im Dienst._').slice(0, 4000),
                    color: 0xf59e0b,
                    fields: [{ name: 'Gesamt', value: `${hm(total)} · ${ranking.filter((r) => r.minutes > 0).length} Beamte`, inline: true }, { name: 'Zeitraum', value: `${f(start)} – ${f(end)}`, inline: true }],
                    footer: 'Wochen-Reset · neue Woche ab Montag 00:00 (Europe/Berlin)',
                    timestamp: end.toISOString(),
                }],
            mentionUsers: [],
        };
    }
    /** Laufende Woche fürs Dashboard: Zähler seit dem letzten Reset und der nächste Reset-Zeitpunkt. */
    async current(now = new Date()) {
        const [cfg, st, last] = await Promise.all([this.config(), this.state(), this.prisma.dutyWeekArchive.findFirst({ orderBy: { weekStart: 'desc' }, select: { id: true, label: true, weekKey: true, createdAt: true, discordChannelId: true, catchUp: true } })]);
        const start = st ? new Date(st.currentWeekStart) : (0, shared_1.weekStartOf)(now);
        const next = (0, shared_1.nextWeekStart)(start);
        const sessions = await this.prisma.dutySession.findMany({ where: { startedAt: { lt: now }, OR: [{ endedAt: null }, { endedAt: { gt: start } }] }, select: { userId: true, status: true, startedAt: true, endedAt: true } });
        const users = await this.rank(this.prisma, (0, shared_1.weekTotals)(sessions, start, now, now));
        return {
            enabled: cfg.enabled, timezone: shared_1.WEEK_TIMEZONE, weekStart: start, weekKey: (0, shared_1.weekKey)(start), label: (0, shared_1.weekLabel)(start),
            nextResetAt: cfg.enabled ? next : null, overdue: cfg.enabled && next <= now, lastResetAt: st?.lastResetAt ?? null, lastArchive: last,
            totalMinutes: users.reduce((n, r) => n + r.minutes, 0), users: users.map(({ discordId: _, ...r }) => r),
        };
    }
    archives() {
        return this.prisma.dutyWeekArchive.findMany({ orderBy: { weekStart: 'desc' }, take: 520, select: { id: true, weekStart: true, weekEnd: true, weekKey: true, label: true, timezone: true, totalMinutes: true, activeUsers: true, shiftCount: true, ranking: true, discordChannelId: true, catchUp: true, createdAt: true } });
    }
    async archive(id) {
        const a = await this.prisma.dutyWeekArchive.findUnique({ where: { id } });
        if (!a)
            throw new errors_1.AppError('NOT_FOUND', 'Wochenarchiv nicht gefunden.');
        return a;
    }
};
exports.WeeklyResetService = WeeklyResetService;
exports.WeeklyResetService = WeeklyResetService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, discord_service_1.DiscordService, realtime_service_1.RealtimeService])
], WeeklyResetService);
let WeeklyResetController = class WeeklyResetController {
    s;
    constructor(s) {
        this.s = s;
    }
    /** Laufende Woche (Zähler, Rangliste, nächster Reset). */
    current() { return this.s.current(); }
    config() { return this.s.config(); }
    save(a, b) { return this.s.saveConfig(a, b); }
    /** Abgeschlossene Wochen (Rangliste je Woche); nie gelöscht. */
    archives() { return this.s.archives(); }
    /** Vollständiges Archiv inkl. aller Dienst-Sitzungen der Woche (Schichtleitung). */
    archive(id) { return this.s.archive(id); }
};
exports.WeeklyResetController = WeeklyResetController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('team.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], WeeklyResetController.prototype, "current", null);
__decorate([
    (0, common_1.Get)('config'),
    (0, decorators_1.RequirePermission)('team.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], WeeklyResetController.prototype, "config", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(exports.weeklyResetConfigSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], WeeklyResetController.prototype, "save", null);
__decorate([
    (0, common_1.Get)('archives'),
    (0, decorators_1.RequirePermission)('team.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], WeeklyResetController.prototype, "archives", null);
__decorate([
    (0, common_1.Get)('archives/:id'),
    (0, decorators_1.RequirePermission)('team.manage'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WeeklyResetController.prototype, "archive", null);
exports.WeeklyResetController = WeeklyResetController = __decorate([
    (0, swagger_1.ApiTags)('team'),
    (0, common_1.Controller)('team/week'),
    __metadata("design:paramtypes", [WeeklyResetService])
], WeeklyResetController);
//# sourceMappingURL=weekly-reset.js.map