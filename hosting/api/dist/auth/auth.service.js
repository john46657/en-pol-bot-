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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const permission_service_1 = require("../authz/permission.service");
const discord_access_service_1 = require("../authz/discord-access.service");
const guild_context_1 = require("../common/guild-context");
const guards_1 = require("../authz/guards");
const password_1 = require("./password");
const errors_1 = require("../common/errors");
const env_1 = require("../config/env");
const two_factor_service_1 = require("./two-factor.service");
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
let AuthService = class AuthService {
    prisma;
    audit;
    perms;
    access;
    twoFactor;
    env = (0, env_1.loadEnv)();
    constructor(prisma, audit, perms, access, twoFactor) {
        this.prisma = prisma;
        this.audit = audit;
        this.perms = perms;
        this.access = access;
        this.twoFactor = twoFactor;
    }
    async login(username, password, meta) {
        const user = await this.prisma.user.findUnique({ where: { username: username.toLowerCase() } });
        const locked = !!user?.lockedUntil && user.lockedUntil > new Date();
        const ok = await (0, password_1.verifyPassword)(password, user?.passwordHash ?? password_1.DUMMY_HASH);
        const success = !!user && user.active && !locked && ok;
        await this.prisma.loginHistory.create({
            data: { userId: user?.id, username: username.toLowerCase(), success, ip: meta.ip, reason: success ? null : !user ? 'UNKNOWN_USER' : !user.active ? 'DISABLED' : locked ? 'LOCKED' : 'BAD_PASSWORD' },
        });
        if (!success) {
            if (user && user.active && !locked) {
                const fails = user.failedLogins + 1;
                await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MS) : null } });
            }
            await this.prisma.securityEvent.create({ data: { type: 'LOGIN_FAILURE', userId: user?.id, ip: meta.ip, detail: `username=${username.slice(0, 64)}`, requestId: meta.requestId } });
            throw new errors_1.AppError('UNAUTHENTICATED', 'Benutzername oder Passwort falsch.');
        }
        // Zwei-Faktor aktiv → erst nach dem Code eine Sitzung
        if (user.totpEnabledAt)
            return { twoFactorRequired: true, ticket: this.twoFactor.ticket(user.id) };
        return this.startSession(user, meta, 'auth.login');
    }
    /** Zweiter Schritt: Code aus der Authenticator-App oder Wiederherstellungscode. Fehlversuche zählen zur Kontosperre. */
    async loginTwoFactor(ticket, code, meta) {
        const userId = this.twoFactor.readTicket(ticket);
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        const locked = !!user?.lockedUntil && user.lockedUntil > new Date();
        if (!user || !user.active || locked)
            throw new errors_1.AppError('UNAUTHENTICATED', 'Anmeldung abgelaufen – bitte erneut anmelden.');
        const used = await this.twoFactor.consume(user.id, code);
        if (!used) {
            const fails = user.failedLogins + 1;
            await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MS) : null } });
            await this.prisma.loginHistory.create({ data: { userId: user.id, username: user.username, success: false, ip: meta.ip, reason: 'BAD_2FA' } });
            await this.prisma.securityEvent.create({ data: { type: 'LOGIN_FAILURE', userId: user.id, ip: meta.ip, detail: '2fa', requestId: meta.requestId } });
            throw new errors_1.AppError('UNAUTHENTICATED', 'Der Code stimmt nicht.');
        }
        return this.startSession(user, meta, used === 'recovery' ? 'auth.login.recovery_code' : 'auth.login');
    }
    /** Neue Session nach erfolgreicher Anmeldung (Passwort oder Discord). */
    async startSession(user, meta, action = 'auth.login') {
        const token = (0, node_crypto_1.randomBytes)(32).toString('base64url');
        const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_HOURS * 3600_000);
        await this.prisma.$transaction(async (tx) => {
            await tx.session.create({ data: { userId: user.id, tokenHash: (0, guards_1.hashToken)(token), expiresAt, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 255) } });
            await tx.user.update({ where: { id: user.id }, data: { lastLogin: new Date(), failedLogins: 0, lockedUntil: null } });
            await this.audit.record({ userId: user.id, robloxUserId: user.robloxUserId, requestId: meta.requestId }, { action, module: 'auth', entityType: 'User', entityId: user.id }, tx);
        });
        this.access.forget(user.id); // neue Anmeldung → Discord-Rollen beim nächsten Aufruf frisch prüfen
        return { token, expiresAt, user: await this.profile(user.id) };
    }
    async logout(actor, sessionId) {
        await this.prisma.$transaction(async (tx) => {
            await tx.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
            if (actor.userId)
                await tx.editLock.deleteMany({ where: { userId: actor.userId } }); // eigene Bearbeitungs-Sperren freigeben
            await this.audit.record(actor, { action: 'auth.logout', module: 'auth', entityType: 'User', entityId: actor.userId ?? undefined }, tx);
        });
    }
    /** Beendet alle Sessions eines Benutzers (Session Invalidation). */
    async revokeAllSessions(userId) {
        await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    async profile(userId) {
        const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: { include: { role: true } } } });
        const active = new Set(await this.perms.roleIdsFor(userId));
        return {
            id: u.id, username: u.username, displayName: u.displayName, robloxUserId: u.robloxUserId, robloxUsername: u.robloxUsername,
            // Rollen, die im gewählten Server gelten; `servers` = Server, auf denen man eigene Server-Rollen hat
            roles: u.roles.filter((r) => active.has(r.roleId)).map((r) => r.role.name), permissions: await this.perms.effective(userId), lastLogin: u.lastLogin,
            twoFactor: !!u.totpEnabledAt, guildId: (0, guild_context_1.currentGuild)(), servers: [...new Set(u.roles.map((r) => r.role.guildId).filter((g) => !!g))],
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, permission_service_1.PermissionService, discord_access_service_1.DiscordAccessService, two_factor_service_1.TwoFactorService])
], AuthService);
//# sourceMappingURL=auth.service.js.map