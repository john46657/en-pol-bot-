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
exports.DiscordAccessService = exports.DEFAULT_DISCORD_LOGIN = exports.DISCORD_ADMIN_GRANTS = exports.DISCORD_ADMIN_ROLE_PREFIX = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const realtime_service_1 = require("../realtime/realtime.service");
const env_1 = require("../config/env");
const shared_1 = require("@enrp/shared");
const API = 'https://discord.com/api/v10';
/** Wie lange ein Abgleich gilt, bevor die Discord-Rollen erneut geprüft werden. */
const CHECK_TTL_MS = 2 * 60_000;
/** Regelmäßiger Abgleich aller angemeldeten Discord-Benutzer (auch ohne Aktivität). */
const SWEEP_MS = 5 * 60_000;
/** Server-Daten (Besitzer, Rollen-Rechte) und Server-Liste des Bots so lange zwischenspeichern. */
const GUILD_TTL_MS = 5 * 60_000;
/** Discord-Recht „Administrator“. */
const ADMINISTRATOR = 8n;
/** Automatische Dashboard-Rolle je Server für Discord-Administratoren (Name: „Discord-Admin · <Server>“). */
exports.DISCORD_ADMIN_ROLE_PREFIX = 'Discord-Admin';
/** Discord-Admins bekommen auf ihrem Server alle Rechte – außer Benutzerkonten zu verwalten (die gelten serverübergreifend). */
exports.DISCORD_ADMIN_GRANTS = shared_1.ALL_PERMISSIONS.filter((p) => p !== 'users.manage');
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
    guildMeta = new Map();
    botGuildList;
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
    bot(path) {
        return fetch(`${API}${path}`, { headers: { authorization: `Bot ${this.env.DISCORD_TOKEN}` }, signal: AbortSignal.timeout(10_000) });
    }
    /** Alle Server des Bots (zwischengespeichert). `null` = nicht abrufbar. */
    async botGuilds() {
        if (this.botGuildList && Date.now() - this.botGuildList.at < GUILD_TTL_MS)
            return this.botGuildList.ids;
        const r = await this.bot('/users/@me/guilds?limit=200');
        if (!r.ok)
            return this.botGuildList?.ids ?? null;
        const body = (await r.json());
        const ids = Array.isArray(body) ? body.map((g) => String(g.id)).filter((g) => /^\d{15,25}$/.test(g)) : [];
        this.botGuildList = { at: Date.now(), ids };
        return ids;
    }
    /** Besitzer und Rechte je Rolle eines Servers (zwischengespeichert). */
    async guildInfo(guildId) {
        const c = this.guildMeta.get(guildId);
        if (c && Date.now() - c.at < GUILD_TTL_MS)
            return 'missing' in c ? null : c;
        const r = await this.bot(`/guilds/${guildId}`);
        if (!r.ok) {
            this.guildMeta.set(guildId, { at: Date.now(), missing: true });
            return null;
        }
        const g = (await r.json());
        const perms = new Map();
        for (const role of g.roles ?? []) {
            try {
                perms.set(role.id, BigInt(role.permissions ?? '0'));
            }
            catch { /* ungültig → keine Rechte */ }
        }
        const v = { at: Date.now(), ownerId: String(g.owner_id ?? ''), perms };
        this.guildMeta.set(guildId, v);
        return v;
    }
    /** Discord-Administrator auf diesem Server? (Besitzer oder @everyone/eine eigene Rolle mit „Administrator“) */
    async isGuildAdmin(guildId, discordId, memberRoles) {
        const g = await this.guildInfo(guildId);
        if (!g)
            return false;
        return g.ownerId === discordId || [guildId, ...memberRoles].some((r) => ((g.perms.get(r) ?? 0n) & ADMINISTRATOR) === ADMINISTRATOR);
    }
    /**
     * Mitglied auf einem der Server des Bots (bzw. der eingestellten Server)? `null` = nein, `unknown` = nicht prüfbar.
     * Zusätzlich: auf welchen Servern des Bots man Discord-Administrator ist – die kommen immer ins Dashboard ihres Servers.
     */
    async membership(discordId, fresh = false) {
        if (!this.env.DISCORD_TOKEN)
            return 'unknown';
        if (fresh) {
            this.botGuildList = undefined;
            this.guildMeta.clear();
        } // beim Login: Bot gerade erst hinzugefügt / Rechte gerade geändert
        try {
            const cfg = (await this.prisma.systemSetting.findUnique({ where: { key: 'discord.channels' } }))?.value;
            const configured = [cfg?.guildId, this.env.DISCORD_GUILD_ID].join(',').split(/[\s,;]+/).filter((g) => /^\d{15,25}$/.test(g));
            const all = await this.botGuilds();
            if (!configured.length && !all)
                return 'unknown';
            const scope = new Set(configured.length ? configured : all);
            let isMember = false;
            const roles = [];
            const adminGuilds = [];
            for (const g of [...new Set([...scope, ...(all ?? [])])].slice(0, 25)) {
                const r = await this.bot(`/guilds/${g}/members/${discordId}`);
                if (r.status === 404)
                    continue;
                if (!r.ok) {
                    if (scope.has(g))
                        return 'unknown';
                    continue;
                }
                const memberRoles = (await r.json()).roles ?? [];
                if (scope.has(g)) {
                    isMember = true;
                    roles.push(...memberRoles);
                }
                if (await this.isGuildAdmin(g, discordId, memberRoles))
                    adminGuilds.push(g);
            }
            return isMember || adminGuilds.length ? { roles, adminGuilds } : null;
        }
        catch {
            return 'unknown';
        }
    }
    /** Darf diese Mitgliedschaft ins Dashboard? (Besitzer aus ADMIN_DISCORD_IDS prüft der Aufrufer vorab.) */
    verdict(member, s) {
        if (member?.adminGuilds?.length)
            return 'ok'; // Discord-Administratoren kommen immer rein (auf ihren Servern)
        if ((s.requireGuild || s.teamRoleIds.length) && member === null)
            return 'not_member';
        if (s.teamRoleIds.length && !member.roles.some((r) => s.teamRoleIds.includes(r)))
            return 'no_team_role';
        return 'ok';
    }
    /**
     * Discord-Rolle → Dashboard-Rolle: verknüpfte Rollen (Rollen-Editor) und die ältere Zuordnungsliste (Einstellungen).
     * Vergeben/entzogen werden nur Rollen, die überhaupt mit Discord verknüpft sind; manuell vergebene Rollen bleiben.
     */
    async syncRoles(userId, discordRoles, s) {
        const settings = s ?? (await this.settings());
        const names = [...new Set(settings.roleMap.map((m) => m.role))];
        const roles = await this.prisma.role.findMany({ where: { OR: [{ name: { in: names } }, { discordRoleIds: { isEmpty: false } }] } });
        if (!roles.length)
            return;
        const want = new Set([
            ...settings.roleMap.filter((m) => discordRoles.includes(m.discordRoleId)).map((m) => m.role),
            ...roles.filter((r) => r.discordRoleIds.some((d) => discordRoles.includes(d))).map((r) => r.name),
        ]);
        const current = await this.prisma.userRole.findMany({ where: { userId, roleId: { in: roles.map((r) => r.id) } } });
        const add = roles.filter((r) => want.has(r.name) && !current.some((c) => c.roleId === r.id));
        const remove = roles.filter((r) => !want.has(r.name) && current.some((c) => c.roleId === r.id) && r.name !== 'System Administrator');
        if (!add.length && !remove.length)
            return;
        await this.prisma.$transaction(async (tx) => {
            if (add.length)
                await tx.userRole.createMany({ data: add.map((r) => ({ userId, roleId: r.id })), skipDuplicates: true });
            if (remove.length)
                await tx.userRole.deleteMany({ where: { userId, roleId: { in: remove.map((r) => r.id) } } });
            await this.audit.record({ userId: null }, { action: 'auth.discord.roles_synced', module: 'permissions', entityType: 'User', entityId: userId, after: { added: add.map((r) => r.name), removed: remove.map((r) => r.name) } }, tx);
        });
        this.rt.publishToUser(userId, 'permissions.changed', {});
    }
    /**
     * Discord-Administratoren: je Server eine automatische Dashboard-Rolle („Discord-Admin · Server“, gilt nur dort) mit allen
     * Rechten außer `users.manage`. Wer auf einem Server nicht mehr Administrator ist, verliert die Rolle beim nächsten Abgleich.
     */
    async syncAdminRoles(userId, adminGuilds) {
        const all = await this.prisma.role.findMany({ where: { system: true, guildId: { not: null }, name: { startsWith: `${exports.DISCORD_ADMIN_ROLE_PREFIX} · ` } }, select: { id: true, guildId: true } });
        const roleFor = new Map(all.map((r) => [r.guildId, r.id]));
        const names = new Map(((await this.prisma.systemSetting.findUnique({ where: { key: 'discord.guilds' } }))?.value ?? []).map((g) => [g.id, g.name]));
        for (const g of adminGuilds) {
            if (roleFor.has(g))
                continue;
            const r = await this.prisma.role.create({
                data: {
                    name: `${exports.DISCORD_ADMIN_ROLE_PREFIX} · ${(names.get(g) ?? 'Server').slice(0, 60)} (${g.slice(-4)})`, guildId: g, system: true, priority: 2, color: '#5865F2',
                    description: 'Automatisch: alle mit dem Discord-Recht „Administrator“ auf diesem Server (Besitzer eingeschlossen).',
                    permissions: { create: exports.DISCORD_ADMIN_GRANTS.map((permissionKey) => ({ permissionKey, effect: 'ALLOW' })) },
                },
            });
            roleFor.set(g, r.id);
        }
        const want = new Set(adminGuilds.map((g) => roleFor.get(g)));
        const current = await this.prisma.userRole.findMany({ where: { userId, roleId: { in: [...roleFor.values()] } } });
        const add = [...want].filter((id) => !current.some((c) => c.roleId === id));
        const remove = current.filter((c) => !want.has(c.roleId)).map((c) => c.roleId);
        if (!add.length && !remove.length)
            return;
        await this.prisma.$transaction(async (tx) => {
            if (add.length)
                await tx.userRole.createMany({ data: add.map((roleId) => ({ userId, roleId })), skipDuplicates: true });
            if (remove.length)
                await tx.userRole.deleteMany({ where: { userId, roleId: { in: remove } } });
            await this.audit.record({ userId: null }, { action: 'auth.discord.admin_roles_synced', module: 'permissions', entityType: 'User', entityId: userId, after: { adminGuilds, added: add.length, removed: remove.length } }, tx);
        });
        this.rt.publishToUser(userId, 'permissions.changed', {});
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
        await this.syncRoles(userId, member.roles, s);
        await this.syncAdminRoles(userId, member.adminGuilds ?? []);
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