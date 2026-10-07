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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const zod_1 = require("zod");
const auth_service_1 = require("./auth.service");
const two_factor_service_1 = require("./two-factor.service");
const discord_oauth_service_1 = require("./discord-oauth.service");
const web_url_1 = require("../common/web-url");
const errors_1 = require("../common/errors");
const decorators_1 = require("../authz/decorators");
const guards_1 = require("../authz/guards");
const zod_pipe_1 = require("../common/zod.pipe");
const env_1 = require("../config/env");
const OAUTH_COOKIE = 'enrp_oauth';
const codeSchema = zod_1.z.object({ code: zod_1.z.string().trim().min(6).max(20) });
const login2faSchema = zod_1.z.object({ ticket: zod_1.z.string().min(10).max(300), code: zod_1.z.string().trim().min(6).max(20) });
const loginSchema = zod_1.z.object({ username: zod_1.z.string().min(1).max(64), password: zod_1.z.string().min(1).max(256) });
let AuthController = class AuthController {
    auth;
    discord;
    twoFactor;
    env = (0, env_1.loadEnv)();
    constructor(auth, discord, twoFactor) {
        this.auth = auth;
        this.discord = discord;
        this.twoFactor = twoFactor;
    }
    secure() { return this.env.COOKIE_SECURE ? this.env.COOKIE_SECURE === 'true' : this.env.NODE_ENV === 'production'; }
    /** Welche Anmeldewege es gibt (Login-Seite). */
    /** Einladungs-Link für den Bot (Einstellungen → „Bot zu einem Server hinzufügen“). */
    invite() { return { url: this.discord.inviteUrl() }; }
    providers() { return { discord: this.discord.enabled(), password: this.discord.passwordLoginAllowed() }; }
    /** „Mit Discord anmelden“ → weiter zu Discord. */
    discordStart(res) {
        try {
            const s = this.discord.start('login');
            res.cookie(OAUTH_COOKIE, s.browser, { httpOnly: true, sameSite: 'lax', secure: this.secure(), maxAge: 10 * 60_000, path: '/api/v1/auth/discord' });
            res.redirect(302, s.url);
        }
        catch {
            res.redirect(302, (0, web_url_1.webUrl)('/login?discord=disabled'));
        }
    }
    /** Angemeldeter Benutzer verknüpft sein Discord-Konto per Discord-Login (statt Einmal-Code). */
    discordLink(user, res) {
        try {
            const s = this.discord.start('link', user.id);
            res.cookie(OAUTH_COOKIE, s.browser, { httpOnly: true, sameSite: 'lax', secure: this.secure(), maxAge: 10 * 60_000, path: '/api/v1/auth/discord' });
            res.redirect(302, s.url);
        }
        catch {
            res.redirect(302, (0, web_url_1.webUrl)('/?discord=disabled'));
        }
    }
    /** Bot auf einen Server einladen – über das Dashboard (löst den Code ein; klappt auch mit „OAuth2-Code-Erlaubnis benötigt“). */
    discordInstall(user, res) {
        try {
            const s = this.discord.start('install', user.id);
            res.cookie(OAUTH_COOKIE, s.browser, { httpOnly: true, sameSite: 'lax', secure: this.secure(), maxAge: 10 * 60_000, path: '/api/v1/auth/discord' });
            res.redirect(302, s.url);
        }
        catch {
            res.redirect(302, (0, web_url_1.webUrl)('/admin/settings?discord=disabled'));
        }
    }
    /** Rücksprung von Discord (diese Adresse muss im Developer Portal unter OAuth2 → Redirects stehen). */
    async discordCallback(code, state, error, req, res) {
        res.clearCookie(OAUTH_COOKIE, { path: '/api/v1/auth/discord' });
        if (error)
            return res.redirect(302, (0, web_url_1.webUrl)('/login?discord=cancelled'));
        // (Abbruch beim Bot-Einladen landet ebenfalls hier – die Login-Seite leitet Angemeldete einfach weiter)
        try {
            const r = await this.discord.callback(code, state, req.cookies?.[OAUTH_COOKIE], { ip: req.ip, userAgent: req.headers['user-agent'], requestId: req.requestId });
            if (r.kind === 'linked')
                return res.redirect(302, (0, web_url_1.webUrl)('/?discord=linked'));
            if (r.kind === 'installed')
                return res.redirect(302, (0, web_url_1.webUrl)(`/admin/settings?discord=installed${r.guildName ? `&server=${encodeURIComponent(r.guildName)}` : ''}`));
            res.cookie(guards_1.SESSION_COOKIE, r.token, { httpOnly: true, sameSite: 'strict', secure: this.secure(), expires: r.expiresAt, path: '/' });
            return res.redirect(302, (0, web_url_1.webUrl)('/'));
        }
        catch (e) {
            if (e instanceof discord_oauth_service_1.DiscordLoginFailure && e.code === 'install_failed')
                return res.redirect(302, (0, web_url_1.webUrl)('/admin/settings?discord=install_failed'));
            return res.redirect(302, (0, web_url_1.webUrl)(`/login?discord=${e instanceof discord_oauth_service_1.DiscordLoginFailure ? e.code : 'failed'}`));
        }
    }
    async login(body, req, res) {
        // Ist „Mit Discord anmelden“ eingerichtet, gibt es nur noch Discord (Notfall: PASSWORD_LOGIN=true)
        if (!this.discord.passwordLoginAllowed())
            throw new errors_1.AppError('PERMISSION_DENIED', 'Password login is disabled – sign in with Discord.');
        const r = await this.auth.login(body.username, body.password, { ip: req.ip, userAgent: req.headers['user-agent'], requestId: req.requestId });
        if ('twoFactorRequired' in r)
            return r;
        res.cookie(guards_1.SESSION_COOKIE, r.token, { httpOnly: true, sameSite: 'strict', secure: this.secure(), expires: r.expiresAt, path: '/' });
        return r.user;
    }
    /** Zweiter Anmeldeschritt (Code aus der Authenticator-App oder Wiederherstellungscode). */
    async login2fa(body, req, res) {
        if (!this.discord.passwordLoginAllowed())
            throw new errors_1.AppError('PERMISSION_DENIED', 'Password login is disabled – sign in with Discord.');
        const r = await this.auth.loginTwoFactor(body.ticket, body.code, { ip: req.ip, userAgent: req.headers['user-agent'], requestId: req.requestId });
        res.cookie(guards_1.SESSION_COOKIE, r.token, { httpOnly: true, sameSite: 'strict', secure: this.secure(), expires: r.expiresAt, path: '/' });
        return r.user;
    }
    // ---- eigene Zwei-Faktor-Sicherung (jeder angemeldete Benutzer) ----
    twoFactorStatus(user) { return this.twoFactor.status(user.id); }
    twoFactorSetup(actor) { return this.twoFactor.setup(actor); }
    twoFactorEnable(actor, body) { return this.twoFactor.enable(actor, body.code); }
    async twoFactorDisable(actor, body) { await this.twoFactor.disable(actor, body.code); }
    twoFactorRecovery(actor, body) { return this.twoFactor.regenerate(actor, body.code); }
    async logout(user, actor, res) {
        await this.auth.logout(actor, user.sessionId);
        res.clearCookie(guards_1.SESSION_COOKIE, { path: '/' });
    }
    me(user) {
        return this.auth.profile(user.id);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Get)('discord/invite'),
    (0, decorators_1.RequirePermission)('settings.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "invite", null);
__decorate([
    (0, decorators_1.Public)(),
    (0, common_1.Get)('providers'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "providers", null);
__decorate([
    (0, decorators_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 20, ttl: 60_000 } }),
    (0, common_1.Get)('discord'),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "discordStart", null);
__decorate([
    (0, common_1.Get)('discord/link'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "discordLink", null);
__decorate([
    (0, common_1.Get)('discord/install'),
    (0, decorators_1.RequirePermission)('settings.view'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "discordInstall", null);
__decorate([
    (0, decorators_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 20, ttl: 60_000 } }),
    (0, common_1.Get)('discord/callback'),
    __param(0, (0, common_1.Query)('code')),
    __param(1, (0, common_1.Query)('state')),
    __param(2, (0, common_1.Query)('error')),
    __param(3, (0, common_1.Req)()),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "discordCallback", null);
__decorate([
    (0, decorators_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : (0, env_1.loadEnv)().LOGIN_RATE_LIMIT, ttl: 60_000 } }),
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(loginSchema))),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, decorators_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : (0, env_1.loadEnv)().LOGIN_RATE_LIMIT, ttl: 60_000 } }),
    (0, common_1.Post)('login/2fa'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(login2faSchema))),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login2fa", null);
__decorate([
    (0, common_1.Get)('2fa'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "twoFactorStatus", null);
__decorate([
    (0, common_1.Post)('2fa/setup'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "twoFactorSetup", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 10, ttl: 60_000 } }),
    (0, common_1.Post)('2fa/enable'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(codeSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "twoFactorEnable", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 10, ttl: 60_000 } }),
    (0, common_1.Post)('2fa/disable'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(codeSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "twoFactorDisable", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 10, ttl: 60_000 } }),
    (0, common_1.Post)('2fa/recovery'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(codeSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "twoFactorRecovery", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, decorators_1.CurrentActor)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Get)('me'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "me", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService, discord_oauth_service_1.DiscordOAuthService, two_factor_service_1.TwoFactorService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map