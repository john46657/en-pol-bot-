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
exports.DiscordAccessService = exports.DEFAULT_DISCORD_LOGIN = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const realtime_service_1 = require("../realtime/realtime.service");
const env_1 = require("../config/env");
const server_roles_1 = require("../multi-server/server-roles");
const API = 'https://discord.com/api/v10';
/** Wie lange ein Abgleich gilt, bevor die Discord-Rollen erneut geprüft werden. */
const CHECK_TTL_MS = 2 * 60_000;
/** Regelmäßiger Abgleich aller angemeldeten Discord-Benutzer (auch ohne Aktivität). */
const SWEEP_MS = 5 * 60_000;
exports.DEFAULT_DISCORD_LOGIN = { signup: true, requireGuild: true, roleMap: [], teamRoleIds: [] };
/**
 * Discord-Rollen → Dashboard-Zugang und Dashboard-Rollen. Wird beim Login geprüft und danach laufend:
 * bei Anfragen (spätestens alle 2 Minuten je Benutzer) und im Hintergrund alle 5 Minuten.
 * Verliert jemand die freigeschaltete Discord-Rolle, werden seine Sessions sofort beendet; gewonnene/verlorene
 * verknüpfte Rollen werden vergeben bzw. entzogen. Ist Discord nicht erreichbar, bleibt der letzte Stand.
 */
let DiscordAccessService = class DiscordAccessService {
    prisma;
    audit;
    rt;
    env = (0, env_1.loadEnv)();
    log = new common_1.Logger('DiscordAccess');
    checked = new Map();
    inflight = new Map();
    timer;
    constructor(prisma, audit, rt) {
        this.prisma = prisma;
        this.audit = audit;
        this.rt = rt;
    }
    onModuleInit() {
        if (this.env.NODE_ENV === 'test' || !this.env.DISCORD_TOKEN)
            return;
        this.timer = setInterval(() => void this.sweep().catch((e) => this.log.warn(`sweep failed: ${e instanceof Error ? e.message : e}`)), SWEEP_MS);
        this.timer.unref?.();
    }
    onModuleDestroy() { clearInterval(this.timer); }
    isOwnerId(discordId) { return (this.env.ADMIN_DISCORD_IDS ?? '').split(/[\s,;]+/).includes(discordId); }
    async settings() {
        const v = (await this.prisma.systemSetting.findUnique({ where: { key: 'auth.discord' } }))?.value;
        return { ...exports.DEFAULT_DISCORD_LOGIN, ...(v ?? {}) };
    }
    /** Mitglied auf einem der Server des Bots (bzw. der eingestellten Server)? `null` = nein, `unknown` = nicht prüfbar. */
    async membership(discordId) {
        const token = this.env.DISCORD_TOKEN;
        if (!token)
            return 'unknown';
        const bot = this.bot(token);
        try {
            const guilds = await this.guildIds(bot);
            if (!guilds)
                return 'unknown';
            const byGuild = {};
            for (const g of guilds) {
                const r = await bot(`/guilds/${g}/members/${discordId}`);
                if (r.status === 404)
                    continue;
                if (!r.ok)
                    return 'unknown';
                byGuild[g] = (await r.json()).roles ?? [];
            }
            return Object.keys(byGuild).length ? { roles: Object.values(byGuild).flat(), byGuild, checked: guilds } : null;
        }
        catch {
            return 'unknown';
        }
    }
    bot(token) { return (path) => fetch(`${API}${path}`, { headers: { authorization: `Bot ${token}` }, signal: AbortSignal.timeout(10_000) }); }
    /** Eingestellte und registrierte Server bzw. alle Server des Bots (max. 20); `null` = Discord nicht erreichbar. */
    async guildIds(bot) {
        const cfg = (await this.prisma.systemSetting.findUnique({ where: { key: 'discord.channels' } }))?.value;
        const registered = (await this.prisma.discordServer.findMany({ where: { archivedAt: null }, select: { guildId: true }, take: 20 })).map((s) => s.guildId);
        let guilds = [cfg?.guildId, this.env.DISCORD_GUILD_ID, ...registered].join(',').split(/[\s,;]+/).filter((g) => /^\d{15,25}$/.test(g));
        if (!guilds.length) {
            const r = await bot('/users/@me/guilds?limit=200');
            if (!r.ok)
                return null;
            guilds = (await r.json()).map((g) => g.id);
        }
        return [...new Set(guilds)].slice(0, 20);
    }
    /** Server-Mitglieder per Name suchen (Discord: Benutzer- oder Servername beginnt mit `query`). Ohne Token/Discord: leer. */
    async searchMembers(query, limit = 25) {
        const token = this.env.DISCORD_TOKEN;
        if (!token || !query.trim())
            return [];
        const bot = this.bot(token);
        try {
            const guilds = (await this.guildIds(bot)) ?? [];
            const found = new Map();
            for (const g of guilds) {
                const r = await bot(`/guilds/${g}/members/search?query=${encodeURIComponent(query.trim())}&limit=${limit}`);
                if (!r.ok)
                    continue;
                for (const m of (await r.json())) {
                    if (m.user.bot || found.has(m.user.id))
                        continue;
                    found.set(m.user.id, { id: m.user.id, username: m.user.username, displayName: m.nick || m.user.global_name || m.user.username, avatar: m.user.avatar ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png?size=64` : null });
                }
            }
            return [...found.values()].slice(0, limit);
        }
        catch {
            return [];
        }
    }
    avatarCache = new Map();
    /** Profilbilder zu Discord-IDs (Discord-API, 6 h zwischengespeichert). Ohne Token/Discord: leer. */
    async avatars(ids) {
        const out = new Map();
        const token = this.env.DISCORD_TOKEN;
        const now = Date.now();
        const missing = [];
        for (const id of new Set(ids)) {
            const c = this.avatarCache.get(id);
            if (c && now - c.at < 6 * 3_600_000)
                out.set(id, c.url);
            else
                missing.push(id);
        }
        if (!token || !missing.length)
            return out;
        const bot = this.bot(token);
        await Promise.all(missing.slice(0, 100).map(async (id) => {
            try {
                const r = await bot(`/users/${id}`);
                if (!r.ok)
                    return;
                const u = (await r.json());
                const url = u.avatar ? `https://cdn.discordapp.com/avatars/${id}/${u.avatar}.png?size=64` : null;
                this.avatarCache.set(id, { url, at: now });
                out.set(id, url);
            }
            catch { /* Profilbild ist nur Deko */ }
        }));
        if (this.avatarCache.size > 5000)
            this.avatarCache.clear();
        return out;
    }
    /** Darf diese Mitgliedschaft ins Dashboard? (Besitzer aus ADMIN_DISCORD_IDS prüft der Aufrufer vorab.) */
    verdict(member, s) {
        if ((s.requireGuild || s.teamRoleIds.length) && member === null)
            return 'not_member';
        if (s.teamRoleIds.length && !member.roles.some((r) => s.teamRoleIds.includes(r)))
            return 'no_team_role';
        return 'ok';
    }
    /**
     * Mitgliedschaften je registriertem Server festhalten: geprüft und Mitglied → MEMBER (mit Discord-Rollen), geprüft und
     * nicht Mitglied → LEFT. Manuelle Mitgliedschaften (Konten ohne Discord) bleiben unangetastet.
     */
    async recordMemberships(userId, byGuild, checked) {
        await this.ensureConfiguredServers();
        const servers = await this.prisma.discordServer.findMany({ where: { guildId: { in: checked } }, select: { id: true, guildId: true } });
        const now = new Date();
        for (const sv of servers) {
            const roles = byGuild[sv.guildId];
            const status = roles ? 'MEMBER' : 'LEFT';
            await this.prisma.serverMembership.upsert({
                where: { serverId_userId: { serverId: sv.id, userId } },
                create: { serverId: sv.id, userId, status, source: 'DISCORD', discordRoleIds: roles ?? [], lastVerifiedAt: now },
                update: { status, source: 'DISCORD', discordRoleIds: roles ?? [], lastVerifiedAt: now },
            }).catch(() => undefined);
        }
    }
    /**
     * Discord-Rolle → Dashboard-Rolle, JE SERVER: verknüpfte Rollen (Rollen-Editor `discordRoleIds`, Zuordnungstabelle
     * `DiscordRoleMapping`, ältere Zuordnungsliste der Einstellungen). Die Zuweisung merkt sich, auf welchen Servern sie gilt
     * (`UserRole.guildIds`) – eine Discord-Rolle auf Server A verleiht nie Rechte auf Server B. Nur die in `byGuild`/`checked`
     * geprüften Server werden geändert; Rollen ohne Discord-Verknüpfung und „System Administrator“ bleiben unangetastet.
     */
    async syncRoles(userId, byGuild, s, checked = Object.keys(byGuild)) {
        const settings = s ?? (await this.settings());
        const names = [...new Set(settings.roleMap.map((m) => m.role))];
        // nur Rollen der geprüften Server – serverübergreifende Vorlagen werden nicht über Discord vergeben
        const roles = await this.prisma.role.findMany({
            where: { guildId: { in: checked }, name: { not: 'System Administrator' }, OR: [{ name: { in: names } }, { discordRoleIds: { isEmpty: false } }, { discordMappings: { some: {} } }] },
            include: { discordMappings: { include: { server: { select: { guildId: true } } } } },
        });
        if (!roles.length)
            return;
        const wantedGuilds = (r) => checked.filter((g) => {
            if (r.guildId !== g)
                return false; // Server-Rolle gilt nur auf ihrem Server
            const have = byGuild[g];
            if (!have)
                return false;
            return r.discordRoleIds.some((d) => have.includes(d))
                || r.discordMappings.some((m) => m.server.guildId === g && have.includes(m.discordRoleId))
                || settings.roleMap.some((m) => m.role === r.name && have.includes(m.discordRoleId));
        });
        const current = await this.prisma.userRole.findMany({ where: { userId, roleId: { in: roles.map((r) => r.id) } } });
        const changes = [];
        await this.prisma.$transaction(async (tx) => {
            for (const r of roles) {
                const row = current.find((c) => c.roleId === r.id);
                // bisherige Server behalten, die jetzt nicht geprüft wurden; geprüfte neu bestimmen
                const keep = (row?.guildIds ?? []).filter((g) => !checked.includes(g));
                const next = [...new Set([...keep, ...wantedGuilds(r)])].sort();
                const before = row ? [...row.guildIds].sort() : null;
                if (!next.length) {
                    if (row) {
                        await tx.userRole.delete({ where: { userId_roleId: { userId, roleId: r.id } } });
                        changes.push({ name: r.name, before: before, after: [] });
                    }
                    continue;
                }
                if (!row) {
                    await tx.userRole.create({ data: { userId, roleId: r.id, guildIds: next } });
                    changes.push({ name: r.name, before: [], after: next });
                    continue;
                }
                if (!row.guildIds.length)
                    continue; // manuell vergeben: bleibt
                if (JSON.stringify(before) !== JSON.stringify(next)) {
                    await tx.userRole.update({ where: { userId_roleId: { userId, roleId: r.id } }, data: { guildIds: next } });
                    changes.push({ name: r.name, before: before, after: next });
                }
            }
            if (changes.length)
                await this.audit.record({ userId: null }, { action: 'auth.discord.roles_synced', module: 'permissions', entityType: 'User', entityId: userId, serverId: null, after: { added: changes.filter((c) => !c.before.length).map((c) => c.name), removed: changes.filter((c) => !c.after.length).map((c) => c.name), servers: changes } }, tx);
        });
        if (changes.length)
            this.rt.publishToUser(userId, 'permissions.changed', {});
    }
    /**
     * Vom Administrator ausdrücklich eingestellte Haupt-Server (DISCORD_GUILD_ID bzw. Einstellung „Discord-Server-ID“) sind
     * automatisch registriert und aktiv – andere vom Bot entdeckte Server müssen ein globaler Systemadministrator freischalten.
     */
    async ensureConfiguredServers() {
        const cfg = (await this.prisma.systemSetting.findUnique({ where: { key: 'discord.channels' } }))?.value;
        const ids = [...new Set([cfg?.guildId, process.env.DISCORD_GUILD_ID].join(',').split(/[\s,;]+/).filter((g) => /^\d{15,25}$/.test(g)))];
        if (!ids.length)
            return;
        const have = new Set((await this.prisma.discordServer.findMany({ where: { guildId: { in: ids } }, select: { guildId: true } })).map((s) => s.guildId));
        for (const guildId of ids.filter((g) => !have.has(g))) {
            const known = (await this.prisma.systemSetting.findUnique({ where: { key: 'discord.guilds' } }))?.value;
            const name = (Array.isArray(known) ? known.find((g) => g.id === guildId)?.name : undefined) ?? guildId;
            await this.prisma.discordServer.create({ data: { guildId, name, status: 'ACTIVE' } }).then(async (c) => {
                // eingestellter Haupt-Server: bisherige Rollen samt Zuweisungen als eigene Server-Rollen übernehmen
                await (0, server_roles_1.initServerRoles)(this.prisma, c.id, true);
                await this.audit.record({ userId: null }, { action: 'server.register', module: 'servers', entityType: 'DiscordServer', entityId: c.id, serverId: guildId, after: { guildId, name, via: 'configured' } });
            }, () => undefined);
        }
    }
    /** Abgleich nach dem Login merken (kein zweiter Discord-Aufruf direkt danach). */
    remember(userId, ok) { this.checked.set(userId, { at: Date.now(), ok }); }
    forget(userId) { if (userId)
        this.checked.delete(userId);
    else
        this.checked.clear(); }
    /** Laufende Prüfung (AuthGuard). `false` = kein Zugriff mehr – Sessions sind dann bereits beendet. */
    async verify(userId, force = false) {
        const c = this.checked.get(userId);
        if (!force && c && Date.now() - c.at < CHECK_TTL_MS)
            return c.ok;
        const running = this.inflight.get(userId);
        if (running)
            return running;
        const p = this.check(userId).then((ok) => { this.remember(userId, ok); return ok; }, () => c?.ok ?? true).finally(() => this.inflight.delete(userId));
        this.inflight.set(userId, p);
        return p;
    }
    async check(userId) {
        if (!this.env.DISCORD_TOKEN)
            return true;
        const link = await this.prisma.discordLink.findUnique({ where: { userId } });
        if (!link || this.isOwnerId(link.discordId))
            return true; // Passwort-Konten und Besitzer: kein Discord-Zwang
        const member = await this.membership(link.discordId);
        if (member === 'unknown')
            return this.checked.get(userId)?.ok ?? true; // Discord nicht erreichbar → letzter Stand
        const s = await this.settings();
        const verdict = this.verdict(member, s);
        if (verdict !== 'ok') {
            const r = await this.prisma.session.updateMany({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } }, data: { revokedAt: new Date() } });
            if (r.count) {
                await this.audit.record({ userId: null }, { action: 'auth.discord.access_revoked', module: 'permissions', entityType: 'User', entityId: userId, after: { reason: verdict, sessionsEnded: r.count } });
                this.rt.publishToUser(userId, 'session.revoked', { reason: verdict });
            }
            return false;
        }
        await this.recordMemberships(userId, member.byGuild, member.checked);
        await this.syncRoles(userId, member.byGuild, s, member.checked);
        return true;
    }
    /** Alle angemeldeten Discord-Benutzer prüfen (Rollenwechsel auch ohne Aktivität im Dashboard erkennen). */
    async sweep() {
        const sessions = await this.prisma.session.findMany({ where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { userId: true }, distinct: ['userId'], take: 500 });
        for (const s of sessions)
            await this.verify(s.userId, true);
    }
};
exports.DiscordAccessService = DiscordAccessService;
exports.DiscordAccessService = DiscordAccessService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, realtime_service_1.RealtimeService])
], DiscordAccessService);
//# sourceMappingURL=discord-access.service.js.map