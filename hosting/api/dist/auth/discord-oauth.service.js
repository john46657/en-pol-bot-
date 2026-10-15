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
exports.DiscordOAuthService = exports.DiscordLoginFailure = exports.DEFAULT_DISCORD_LOGIN = exports.DISCORD_ONLY_PASSWORD = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const auth_service_1 = require("./auth.service");
const env_1 = require("../config/env");
const web_url_1 = require("../common/web-url");
const discord_access_service_1 = require("../authz/discord-access.service");
const permission_service_1 = require("../authz/permission.service");
const server_roles_1 = require("../multi-server/server-roles");
const API = 'https://discord.com/api/v10';
const STATE_TTL_MS = 10 * 60_000;
/** Kein gültiger Passwort-Hash → mit Passwort nicht anmeldbar (nur Discord). */
exports.DISCORD_ONLY_PASSWORD = '!discord-login-only';
var discord_access_service_2 = require("../authz/discord-access.service");
Object.defineProperty(exports, "DEFAULT_DISCORD_LOGIN", { enumerable: true, get: function () { return discord_access_service_2.DEFAULT_DISCORD_LOGIN; } });
class DiscordLoginFailure extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
    }
}
exports.DiscordLoginFailure = DiscordLoginFailure;
const MANAGE = 0x8n | 0x20n; // ADMINISTRATOR | MANAGE_GUILD
/**
 * „Mit Discord anmelden“ (OAuth2, Scope `identify`) – wie bei Dyno & Co.
 * Zustand liegt serverseitig (das Session-Cookie ist SameSite=strict und kommt beim Rücksprung von Discord nicht mit);
 * zusätzlich bindet ein SameSite=lax-Cookie den Vorgang an den Browser (Schutz vor Login-CSRF).
 * Server-Mitgliedschaft und Rollen werden mit dem Bot-Token geprüft.
 */
let DiscordOAuthService = class DiscordOAuthService {
    prisma;
    audit;
    auth;
    access;
    perms;
    env = (0, env_1.loadEnv)();
    pending = new Map();
    log = new common_1.Logger('DiscordLogin');
    constructor(prisma, audit, auth, access, perms) {
        this.prisma = prisma;
        this.audit = audit;
        this.auth = auth;
        this.access = access;
        this.perms = perms;
    }
    clientId() {
        if (this.env.DISCORD_CLIENT_ID)
            return this.env.DISCORD_CLIENT_ID;
        const first = this.env.DISCORD_TOKEN?.split('.')[0];
        if (!first)
            return null;
        const id = Buffer.from(first, 'base64').toString('utf8');
        return /^\d{15,25}$/.test(id) ? id : null;
    }
    enabled() { return !!(this.clientId() && this.env.DISCORD_CLIENT_SECRET); }
    /** Link zum Einladen des Bots auf einen Server – mit Administrator-Rechten (so gewünscht; deckt Tickets, Rollen, Threads ab). */
    inviteUrl() {
        const id = this.clientId();
        if (!id)
            return null;
        const perms = 8; // Administrator
        return `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot%20applications.commands&permissions=${perms}`;
    }
    /** Passwort-Login nur, solange Discord-Login nicht eingerichtet ist – oder im Notfall mit PASSWORD_LOGIN=true. */
    passwordLoginAllowed() { return !this.enabled() || process.env.PASSWORD_LOGIN === 'true'; }
    isAdminId(id) { return this.access.isOwnerId(id); }
    redirectUri() { return (0, web_url_1.webUrl)('/api/v1/auth/discord/callback'); }
    /** Schritt 1: Adresse bei Discord + Browser-Bindung. */
    start(mode, userId, guildId) {
        if (!this.enabled())
            throw new DiscordLoginFailure('disabled');
        const now = Date.now();
        for (const [k, v] of this.pending)
            if (v.expires < now)
                this.pending.delete(k);
        const state = (0, node_crypto_1.randomBytes)(24).toString('base64url'), browser = (0, node_crypto_1.randomBytes)(24).toString('base64url');
        this.pending.set(state, { mode, userId, browser, expires: now + STATE_TTL_MS });
        // „install“: Bot auf einen Server holen – über den Code-Ablauf, funktioniert auch mit „OAuth2-Code-Erlaubnis benötigt“
        const q = mode === 'install'
            ? new URLSearchParams({ response_type: 'code', client_id: this.clientId(), scope: 'bot applications.commands', permissions: '8', redirect_uri: this.redirectUri(), state, ...(guildId ? { guild_id: guildId, disable_guild_select: 'true' } : {}) })
            // „guilds“: eigene Discord-Server für die Server-Übersicht (Kacheln „Bot einladen“)
            : new URLSearchParams({ response_type: 'code', client_id: this.clientId(), scope: mode === 'login' ? 'identify guilds' : 'identify', redirect_uri: this.redirectUri(), state, prompt: 'none' });
        return { url: `https://discord.com/oauth2/authorize?${q}`, browser };
    }
    /** Schritt 2: Rücksprung von Discord. Liefert eine neue Session (Login) oder verknüpft das Konto (Link). */
    async callback(code, state, browser, meta) {
        const p = state ? this.pending.get(state) : undefined;
        if (state)
            this.pending.delete(state); // nur einmal verwendbar
        if (!p || p.expires < Date.now() || !browser || p.browser !== browser)
            throw new DiscordLoginFailure('state');
        if (!code)
            throw new DiscordLoginFailure('failed');
        if (p.mode === 'install') {
            // Code einlösen = Bot tritt dem Server bei (Discord fügt ihn erst danach hinzu)
            const tok = await this.exchange(code).catch(() => { throw new DiscordLoginFailure('install_failed'); });
            const guildId = typeof tok.guild?.id === 'string' ? tok.guild.id : null;
            await this.audit.record({ userId: p.userId ?? null, requestId: meta.requestId }, { action: 'discord.bot_installed', module: 'discord', entityType: 'Guild', entityId: guildId ?? 'unknown', after: { guildId, name: tok.guild?.name ?? null } });
            return { kind: 'installed', guildId, guildName: tok.guild?.name ?? null, userId: p.userId ?? null };
        }
        const { user: du, guilds } = await this.discordUser(code, p.mode === 'login');
        const settings = await this.settings();
        if (p.mode === 'link') {
            const other = await this.prisma.discordLink.findUnique({ where: { discordId: du.id } });
            if (other && other.userId !== p.userId)
                throw new DiscordLoginFailure('taken');
            if (!other) {
                await this.prisma.discordLink.deleteMany({ where: { userId: p.userId } });
                await this.prisma.discordLink.create({ data: { userId: p.userId, discordId: du.id } });
                await this.audit.record({ userId: p.userId, requestId: meta.requestId }, { action: 'discord.link', module: 'discord', entityType: 'User', entityId: p.userId, after: { discordId: du.id, via: 'oauth' } });
            }
            return { kind: 'linked' };
        }
        const member = await this.access.membership(du.id);
        const link = await this.prisma.discordLink.findUnique({ where: { discordId: du.id } });
        let user = link ? await this.prisma.user.findUnique({ where: { id: link.userId } }) : null;
        const owner = this.isAdminId(du.id); // Besitzer/Admins aus ADMIN_DISCORD_IDS kommen immer rein
        if (!owner && settings.requireGuild && member === 'unknown' && !user)
            throw new DiscordLoginFailure('cannot_verify');
        if (!owner && settings.requireGuild && member === null)
            throw new DiscordLoginFailure('not_member');
        // Team-Rolle Pflicht: ohne eine der eingestellten Discord-Rollen kein Zugang (Besitzer aus ADMIN_DISCORD_IDS ausgenommen)
        if (!owner && settings.teamRoleIds.length) {
            if (member === 'unknown')
                throw new DiscordLoginFailure('cannot_verify');
            if (member === null)
                throw new DiscordLoginFailure('not_member');
            if (!member.roles.some((r) => settings.teamRoleIds.includes(r)))
                throw new DiscordLoginFailure('no_team_role');
        }
        if (user && !user.active)
            throw new DiscordLoginFailure('inactive');
        if (!user) {
            if (!settings.signup && !owner)
                throw new DiscordLoginFailure('no_account');
            user = await this.createUser(du, meta);
        }
        if (owner)
            await this.ensureAdmin(user.id);
        if (guilds)
            await this.prisma.discordLink.updateMany({ where: { userId: user.id, discordId: du.id }, data: { managedGuilds: guilds, guildsSyncedAt: new Date() } });
        if (member && member !== 'unknown') {
            await this.access.recordMemberships(user.id, member.byGuild, member.checked);
            await this.access.syncRoles(user.id, member.byGuild, settings, member.checked);
        }
        this.access.remember(user.id, true);
        await this.prisma.loginHistory.create({ data: { userId: user.id, username: user.username, success: true, ip: meta.ip, reason: 'DISCORD' } });
        return { kind: 'login', ...(await this.auth.startSession(user, meta, 'auth.login.discord')) };
    }
    settings() { return this.access.settings(); }
    /** Code bei Discord einlösen (Login und Bot-Einladung). */
    async exchange(code) {
        try {
            const tok = await fetch(`${API}/oauth2/token`, {
                method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10_000),
                body: new URLSearchParams({ client_id: this.clientId(), client_secret: this.env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: this.redirectUri() }),
            });
            if (!tok.ok) {
                this.log.warn(`token exchange failed: HTTP ${tok.status} (Client-Secret und Redirect-URL im Developer Portal prüfen)`);
                throw new DiscordLoginFailure('failed');
            }
            return (await tok.json());
        }
        catch (e) {
            if (e instanceof DiscordLoginFailure)
                throw e;
            this.log.warn(`Discord not reachable: ${e instanceof Error ? e.message : e}`);
            throw new DiscordLoginFailure('failed');
        }
    }
    async discordUser(code, withGuilds = false) {
        const { access_token } = await this.exchange(code);
        try {
            const me = await fetch(`${API}/users/@me`, { headers: { authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(10_000) });
            if (!me.ok)
                throw new DiscordLoginFailure('failed');
            const u = (await me.json());
            if (!/^\d{15,25}$/.test(u.id))
                throw new DiscordLoginFailure('failed');
            return { user: u, guilds: withGuilds ? await this.managedGuilds(access_token) : null };
        }
        catch (e) {
            if (e instanceof DiscordLoginFailure)
                throw e;
            this.log.warn(`Discord not reachable: ${e instanceof Error ? e.message : e}`);
            throw new DiscordLoginFailure('failed');
        }
    }
    /** Eigene Discord-Server mit Verwaltungsrecht (nur Anzeige; fehlt der Scope oder klappt es nicht: `null`, Login geht trotzdem). */
    async managedGuilds(token) {
        try {
            const r = await fetch(`${API}/users/@me/guilds`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
            if (!r.ok)
                return null;
            const list = (await r.json());
            return list.filter((g) => typeof g.id === 'string' && /^\d{15,25}$/.test(g.id) && (g.owner === true || (/^\d+$/.test(String(g.permissions ?? '')) && (BigInt(String(g.permissions)) & MANAGE) !== 0n)))
                .slice(0, 200).map((g) => ({ id: g.id, name: String(g.name ?? g.id).slice(0, 100), icon: typeof g.icon === 'string' && /^(a_)?[0-9a-f]{32}$/.test(g.icon) ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null }));
        }
        catch {
            return null;
        }
    }
    async createUser(du, meta) {
        const base = (du.username.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 24) || 'discord').replace(/^\.+/, '');
        let username = base;
        for (let i = 2; await this.prisma.user.findUnique({ where: { username } }); i++)
            username = `${base}${i}`;
        const user = await this.prisma.$transaction(async (tx) => {
            const u = await tx.user.create({ data: { username, displayName: (du.global_name || du.username).slice(0, 64), passwordHash: exports.DISCORD_ONLY_PASSWORD, settings: { create: {} } } });
            await tx.discordLink.create({ data: { userId: u.id, discordId: du.id } });
            await this.audit.record({ userId: u.id, requestId: meta.requestId }, { action: 'user.created.discord', module: 'auth', entityType: 'User', entityId: u.id, after: { username, discordId: du.id } }, tx);
            return u;
        });
        return user;
    }
    /**
     * Bot wurde über das Dashboard eingeladen: hat das ein globaler Systemadministrator getan, ist der Server sofort registriert
     * und aktiv (eigene Startrollen ohne Zuweisungen, eigene Akten). Sonst bleibt er deaktiviert, bis ein globaler
     * Systemadministrator ihn freischaltet – so kann niemand ungefragt einen Server ins System holen.
     */
    async activateInstalled(userId, guildId, name) {
        if (!/^\d{15,25}$/.test(guildId) || !(await this.perms.isOwner(userId)))
            return false;
        const s = await this.prisma.discordServer.upsert({ where: { guildId }, create: { guildId, name: name?.slice(0, 100) || guildId, status: 'ACTIVE' }, update: { status: 'ACTIVE', archivedAt: null } });
        await (0, server_roles_1.initServerRoles)(this.prisma, s.id, false);
        await this.audit.record({ userId }, { action: 'server.register', module: 'servers', entityType: 'DiscordServer', entityId: s.id, serverId: guildId, after: { guildId, name: s.name, via: 'invite' } });
        return true;
    }
    async ensureAdmin(userId) {
        const role = await this.prisma.role.findFirst({ where: { guildId: null, name: 'System Administrator' } });
        if (!role || (await this.prisma.userRole.findUnique({ where: { userId_roleId: { userId, roleId: role.id } } })))
            return;
        await this.prisma.userRole.create({ data: { userId, roleId: role.id } });
        await this.audit.record({ userId }, { action: 'auth.discord.admin_granted', module: 'auth', entityType: 'User', entityId: userId, after: { role: role.name, via: 'ADMIN_DISCORD_IDS' } });
    }
};
exports.DiscordOAuthService = DiscordOAuthService;
exports.DiscordOAuthService = DiscordOAuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, auth_service_1.AuthService, discord_access_service_1.DiscordAccessService, permission_service_1.PermissionService])
], DiscordOAuthService);
//# sourceMappingURL=discord-oauth.service.js.map