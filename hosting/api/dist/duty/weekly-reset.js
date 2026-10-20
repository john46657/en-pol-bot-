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
exports.WeeklyResetController = exports.WeeklyResetService = exports.scopeOfSpace = exports.weeklyResetConfigSchema = void 0;
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
const guild_context_1 = require("../common/guild-context");
const servers_service_1 = require("../multi-server/servers.service");
const CONFIG_KEY = 'duty.weeklyReset';
const STATE_KEY = 'duty.weeklyReset.state';
/** Postgres-Advisory-Lock (je Bereich): nur eine Instanz führt einen Reset gleichzeitig aus. */
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
const stateKey = (scope) => (scope === 'global' ? STATE_KEY : `${STATE_KEY}@${scope}`);
const scopeOfSpace = (space) => `space:${space ?? 'shared'}`;
exports.scopeOfSpace = scopeOfSpace;
/**
 * Automatischer Wochen-Reset: jeden Montag 00:00 (Europe/Berlin, Sommer-/Winterzeit automatisch) wird die abgelaufene Woche
 * archiviert, die Rangliste in Discord veröffentlicht und erst danach der Wochenzähler auf die neue Woche gesetzt.
 * Je Bereich getrennt: `global` (Gesamtstatistik, Einstellungen unter „Alle Server“) und je Server bzw. gemeinsamer
 * Shift-Log-Gruppe (Server-Verbund mit geteilten Akten; Einstellungen im Modul `shift_logs` des Servers, eigener Kanal).
 * Gelöscht wird dabei nichts – der Zähler ist nur der Beginn der laufenden Woche; alle Schichten bleiben in `DutySession`.
 * Doppelte Resets verhindern Advisory-Lock je Bereich + eindeutiges (Bereich, Woche) + Archiv/Discord/Zähler in EINER Transaktion.
 */
let WeeklyResetService = class WeeklyResetService {
    prisma;
    audit;
    discord;
    rt;
    servers;
    constructor(prisma, audit, discord, rt, servers) {
        this.prisma = prisma;
        this.audit = audit;
        this.discord = discord;
        this.rt = rt;
        this.servers = servers;
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
            await this.audit.record(actor, { action: 'duty.weekly_reset.config', module: 'team', entityType: 'SystemSetting', entityId: CONFIG_KEY, serverId: null, before: before, after: value }, tx);
        });
        return this.config();
    }
    /** Einstellungen im aktuellen Kontext: mit Server = Modul `shift_logs` dieses Servers (mit Version), sonst global. */
    async contextConfig(actor) {
        const guild = (0, guild_context_1.currentGuild)();
        if (!guild)
            return { scope: 'global', ...(await this.config()) };
        const server = await this.prisma.discordServer.findUnique({ where: { guildId: guild } });
        if (!server)
            throw new errors_1.AppError('NOT_FOUND', 'Server nicht registriert.');
        const m = await this.servers.module(actor, server.id, 'shift_logs');
        return { scope: 'server', serverId: server.id, version: m.version, ...m.settings.weeklyReset };
    }
    async saveContextConfig(actor, input) {
        const guild = (0, guild_context_1.currentGuild)();
        const { version, ...cfg } = input;
        if (!guild) {
            await this.saveConfig(actor, exports.weeklyResetConfigSchema.parse(cfg));
            return this.contextConfig(actor);
        }
        const server = await this.prisma.discordServer.findUnique({ where: { guildId: guild } });
        if (!server)
            throw new errors_1.AppError('NOT_FOUND', 'Server nicht registriert.');
        if (version === undefined)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Version fehlt (bitte neu laden).');
        const cur = await this.servers.module(actor, server.id, 'shift_logs');
        await this.servers.patchModule(actor, server.id, 'shift_logs', { settings: { ...cur.settings, weeklyReset: cfg }, version });
        return this.contextConfig(actor);
    }
    async state(scope, db = this.prisma) {
        const v = (await db.systemSetting.findUnique({ where: { key: stateKey(scope) } }))?.value;
        return v && typeof v.currentWeekStart === 'string' && !Number.isNaN(Date.parse(v.currentWeekStart)) ? { currentWeekStart: v.currentWeekStart, lastResetAt: v.lastResetAt ?? null, lastArchiveId: v.lastArchiveId ?? null } : null;
    }
    async setState(tx, scope, s) {
        const value = s;
        await tx.systemSetting.upsert({ where: { key: stateKey(scope) }, create: { key: stateKey(scope), value }, update: { value } });
    }
    /** Alle aktiven Bereiche: global (wenn an) + je aktivem Server mit Modul `shift_logs` und eingeschaltetem Wochen-Reset. */
    async scopes() {
        const out = [];
        const g = await this.config();
        if (g.enabled) {
            const channelId = g.channelId ?? (await this.discord.channels()).duty?.split(',')[0]?.trim() ?? null;
            out.push({ key: 'global', space: undefined, cfg: g, posts: channelId ? [{ guildId: null, channelId }] : [], guildIds: [] });
        }
        const servers = await this.prisma.discordServer.findMany({ where: { status: 'ACTIVE', archivedAt: null }, orderBy: { createdAt: 'asc' } });
        const bySpace = new Map();
        for (const sv of servers) {
            const m = await this.servers.moduleState(sv.id, 'shift_logs');
            const wr = m.settings.weeklyReset;
            if (!m.enabled || !wr?.enabled)
                continue;
            const space = (0, guild_context_1.recordSpace)(sv.guildId) ?? null;
            const key = (0, exports.scopeOfSpace)(space);
            const sc = bySpace.get(key) ?? { key, space, cfg: { ...wr }, posts: [], guildIds: [] };
            sc.guildIds.push(sv.guildId);
            if (wr.channelId)
                sc.posts.push({ guildId: sv.guildId, channelId: wr.channelId });
            bySpace.set(key, sc);
        }
        return [...out, ...bySpace.values()];
    }
    /**
     * Prüft (jede halbe Minute und beim Start), ob ein Montag 00:00 überschritten ist, und holt jeden fälligen Reset genau einmal nach.
     * Ältere verpasste Wochen werden still archiviert; nur die zuletzt abgeschlossene Woche wird in Discord veröffentlicht.
     * `archived` enthält je Woche den Schlüssel (global: „2026-10-05“, sonst „<Bereich>|2026-10-05“).
     */
    async tick(now = new Date(), only) {
        const out = { archived: [], posted: 0 };
        for (const scope of await this.scopes()) {
            if (only && !only.includes(scope.key))
                continue;
            const r = await this.runScope(scope, now);
            out.archived.push(...r.archived.map((k) => (scope.key === 'global' ? k : `${scope.key}|${k}`)));
            out.posted += r.posted;
        }
        if (out.archived.length)
            this.rt.publish('team', 'duty.week.reset', { weeks: out.archived });
        return out;
    }
    async runScope(scope, now) {
        const out = { archived: [], posted: 0 };
        const target = (0, shared_1.weekStartOf)(now);
        for (let i = 0; i < MAX_CATCH_UP_WEEKS + 1; i++) {
            const r = await this.prisma.$transaction(async (tx) => {
                await tx.$executeRaw `SELECT pg_advisory_xact_lock(${LOCK_ID}::bigint # hashtext(${scope.key})::bigint)`;
                const st = await this.state(scope.key, tx);
                // Erster Start: Zähler beginnt mit der laufenden Woche (frühere Wochen werden nicht rückwirkend veröffentlicht)
                if (!st) {
                    await this.setState(tx, scope.key, { currentWeekStart: target.toISOString(), lastResetAt: null, lastArchiveId: null });
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
                const existing = await tx.dutyWeekArchive.findUnique({ where: { scope_weekStart: { scope: scope.key, weekStart: start } }, select: { id: true } });
                let archive = existing ? { id: existing.id, posted: 0 } : null;
                if (!archive)
                    archive = await this.archiveWeek(tx, scope, start, end, now, latest);
                // erst NACH Archiv und Rangliste: Wochenzähler auf die neue Woche
                await this.setState(tx, scope.key, { currentWeekStart: end.toISOString(), lastResetAt: now.toISOString(), lastArchiveId: archive.id });
                return { key: (0, shared_1.weekKey)(start), posted: archive.posted, created: !existing };
            }, { timeout: 60_000, maxWait: 30_000 });
            if (!r)
                break;
            if (r.created)
                out.archived.push(r.key);
            out.posted += r.posted;
        }
        return out;
    }
    /** Archiv der Woche [start, end) anlegen; bei der zuletzt abgeschlossenen Woche die Rangliste in die Discord-Warteschlange stellen. */
    async archiveWeek(tx, scope, start, end, now, latest) {
        const rows = await tx.dutySession.findMany({
            where: { startedAt: { lt: end }, OR: [{ endedAt: null }, { endedAt: { gt: start } }], ...(scope.space === undefined ? {} : { serverId: scope.space }) },
            select: { id: true, userId: true, serverId: true, status: true, shiftType: true, callsign: true, unitId: true, startedAt: true, endedAt: true },
            orderBy: { startedAt: 'asc' },
        });
        const ranking = await this.rank(tx, (0, shared_1.weekTotals)(rows, start, end, now));
        const clip = (d) => new Date(Math.min(Math.max(d.getTime(), start.getTime()), end.getTime())).toISOString();
        const sessions = rows.map((s) => ({ ...s, startedAt: s.startedAt.toISOString(), endedAt: s.endedAt?.toISOString() ?? null, countedFrom: clip(s.startedAt), countedTo: clip(s.endedAt ?? now) }));
        const label = (0, shared_1.weekLabel)(start);
        const totalMinutes = ranking.reduce((n, r) => n + r.minutes, 0);
        const posts = latest ? scope.posts : [];
        const created = await tx.dutyWeekArchive.create({
            data: {
                scope: scope.key, weekStart: start, weekEnd: end, weekKey: (0, shared_1.weekKey)(start), label, timezone: shared_1.WEEK_TIMEZONE, totalMinutes, activeUsers: ranking.length, shiftCount: rows.length,
                ranking: ranking, sessions: sessions,
                discordChannelId: posts.map((p) => p.channelId).join(',') || null, catchUp: now.getTime() - end.getTime() > 5 * 60_000,
            },
        });
        // gleicher Schlüssel je Woche (und Server): selbst ein erneut eingereihter Auftrag bearbeitet nur die schon gesendete Nachricht
        for (const p of posts)
            await this.discord.postMessage(p.guildId ? `wr-${p.guildId}-${created.weekKey}` : `week-rank-${created.weekKey}`, p.channelId, this.message(scope.cfg, label, start, end, ranking, totalMinutes), { tx });
        await this.audit.record({ userId: null }, { action: 'duty.weekly_reset', module: 'team', entityType: 'DutyWeekArchive', entityId: created.id, serverId: scope.guildIds[0] ?? null, after: { scope: scope.key, week: created.weekKey, label, activeUsers: ranking.length, totalMinutes, discordChannelId: created.discordChannelId, catchUp: created.catchUp } }, tx);
        return { id: created.id, posted: posts.length };
    }
    async rank(db, totals) {
        const ids = totals.map((t) => t.userId);
        const [users, links] = await Promise.all([
            db.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, personnel: { ...(0, guild_context_1.onePersonnel)(), select: { rank: true, callsign: true } } } }),
            db.discordLink.findMany({ where: { userId: { in: ids } }, select: { userId: true, discordId: true } }),
        ]);
        const u = new Map(users.map((x) => [x.id, x])), l = new Map(links.map((x) => [x.userId, x.discordId]));
        return totals.map((t, i) => ({ place: i + 1, ...t, name: u.get(t.userId)?.displayName ?? 'Unbekannt', rank: u.get(t.userId)?.personnel[0]?.rank ?? null, callsign: u.get(t.userId)?.personnel[0]?.callsign ?? null, discordId: l.get(t.userId) ?? null }));
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
    /** Bereich der Anfrage: mit Server dessen Akten-Bereich (bzw. gemeinsame Gruppe), ohne Server die Gesamtstatistik. */
    async contextScope(guild = (0, guild_context_1.currentGuild)()) {
        if (!guild)
            return { key: 'global', space: undefined, enabled: (await this.config()).enabled };
        const space = (0, guild_context_1.recordSpace)(guild) ?? null;
        const server = await this.prisma.discordServer.findUnique({ where: { guildId: guild }, select: { id: true } });
        const m = server ? await this.servers.moduleState(server.id, 'shift_logs') : null;
        return { key: (0, exports.scopeOfSpace)(space), space, enabled: !!m?.enabled && !!m.settings.weeklyReset?.enabled };
    }
    /** Laufende Woche fürs Dashboard: Zähler seit dem letzten Reset und der nächste Reset-Zeitpunkt (je Bereich). */
    async current(now = new Date()) {
        const sc = await this.contextScope();
        const [st, last] = await Promise.all([this.state(sc.key), this.prisma.dutyWeekArchive.findFirst({ where: { scope: sc.key }, orderBy: { weekStart: 'desc' }, select: { id: true, label: true, weekKey: true, createdAt: true, discordChannelId: true, catchUp: true } })]);
        const start = st ? new Date(st.currentWeekStart) : (0, shared_1.weekStartOf)(now);
        const next = (0, shared_1.nextWeekStart)(start);
        const sessions = await this.prisma.dutySession.findMany({ where: { startedAt: { lt: now }, OR: [{ endedAt: null }, { endedAt: { gt: start } }], ...(sc.space === undefined ? {} : { serverId: sc.space }) }, select: { userId: true, status: true, startedAt: true, endedAt: true } });
        const users = await this.rank(this.prisma, (0, shared_1.weekTotals)(sessions, start, now, now));
        return {
            scope: sc.key, enabled: sc.enabled, timezone: shared_1.WEEK_TIMEZONE, weekStart: start, weekKey: (0, shared_1.weekKey)(start), label: (0, shared_1.weekLabel)(start),
            nextResetAt: sc.enabled ? next : null, overdue: sc.enabled && next <= now, lastResetAt: st?.lastResetAt ?? null, lastArchive: last,
            totalMinutes: users.reduce((n, r) => n + r.minutes, 0), users: users.map(({ discordId: _, ...r }) => r),
        };
    }
    async archives() {
        const sc = await this.contextScope();
        return this.prisma.dutyWeekArchive.findMany({ where: { scope: sc.key }, orderBy: { weekStart: 'desc' }, take: 520, select: { id: true, scope: true, weekStart: true, weekEnd: true, weekKey: true, label: true, timezone: true, totalMinutes: true, activeUsers: true, shiftCount: true, ranking: true, discordChannelId: true, catchUp: true, createdAt: true } });
    }
    /** Archive anderer Bereiche (Server) sind hier nicht vorhanden – auch nicht über eine geratene ID. */
    async archive(id) {
        const sc = await this.contextScope();
        const a = await this.prisma.dutyWeekArchive.findUnique({ where: { id } });
        if (!a || a.scope !== sc.key)
            throw new errors_1.AppError('NOT_FOUND', 'Wochenarchiv nicht gefunden.');
        return a;
    }
};
exports.WeeklyResetService = WeeklyResetService;
exports.WeeklyResetService = WeeklyResetService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, discord_service_1.DiscordService, realtime_service_1.RealtimeService, servers_service_1.ServersService])
], WeeklyResetService);
let WeeklyResetController = class WeeklyResetController {
    s;
    constructor(s) {
        this.s = s;
    }
    /** Laufende Woche (Zähler, Rangliste, nächster Reset). */
    current() { return this.s.current(); }
    /** Einstellungen: mit gewähltem Server die des Servers (Modul shift_logs, mit Version), unter „Alle Server“ die globalen. */
    config(a) { return this.s.contextConfig(a); }
    save(a, b) { return this.s.saveContextConfig(a, b); }
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
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], WeeklyResetController.prototype, "config", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(exports.weeklyResetConfigSchema.extend({ version: zod_1.z.number().int().min(0).optional() })))),
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