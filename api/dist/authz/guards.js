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
exports.PermissionGuard = exports.AuthGuard = exports.hashToken = exports.SESSION_COOKIE = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const node_crypto_1 = require("node:crypto");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const permission_service_1 = require("./permission.service");
const decorators_1 = require("./decorators");
const discord_service_1 = require("../discord/discord.service");
const env_1 = require("../config/env");
const errors_1 = require("../common/errors");
exports.SESSION_COOKIE = 'enrp_session';
const hashToken = (t) => (0, node_crypto_1.createHash)('sha256').update(t).digest('hex');
exports.hashToken = hashToken;
const UUID = '[0-9a-fA-F-]{36}';
/**
 * Routen, die der Bot im Namen eines verknüpften Benutzers aufrufen darf (Allowlist!).
 * Die normalen Permission-Prüfungen gelten trotzdem – der Bot hat nie mehr Rechte als der Benutzer.
 */
const BOT_USER_ROUTES = [
    ['GET', /^\/persons\/?$/], ['GET', new RegExp(`^/persons/${UUID}$`)], ['GET', /^\/vehicles\/?$/], ['GET', new RegExp(`^/vehicles/${UUID}$`)],
    ['GET', /^\/wanted\/?$/], ['GET', /^\/search\/?$/], ['GET', /^\/incidents\/?$/], ['POST', /^\/incidents\/?$/],
    ['GET', /^\/team\/(overview|me|me\/hours|hours)$/], ['PUT', /^\/team\/me\/status$/],
    ['GET', /^\/dispatch\/units\/?$/], ['PUT', new RegExp(`^/dispatch/units/${UUID}/status$`)],
    ['POST', /^\/tickets\/?$/],
    ['GET', /^\/auth\/me$/], ['DELETE', /^\/discord\/link$/], ['GET', /^\/notifications\/?$/],
    ['POST', /^\/reports\/?$/], ['POST', new RegExp(`^/reports/${UUID}/submit$`)], ['POST', /^\/complaints\/?$/], ['POST', /^\/investigations\/?$/],
    ['POST', /^\/wanted\/?$/], ['POST', /^\/evidence\/?$/],
    ['POST', new RegExp(`^/dispatch/incidents/${UUID}/assign$`)], ['PUT', new RegExp(`^/dispatch/incidents/${UUID}/status$`)], ['POST', new RegExp(`^/dispatch/incidents/${UUID}/close$`)],
    ['GET', /^\/danger-level$/], ['PUT', /^\/danger-level$/],
    ['GET', /^\/radio-whitelist(\/check)?$/], ['POST', /^\/radio-whitelist(\/remove)?$/],
    ['GET', /^\/sek\/(me|members|reports)$/], ['POST', /^\/sek\/(members|members\/remove|reports)$/],
    ['POST', new RegExp(`^/qualifications/applications/${UUID}/decision$`)], ['GET', new RegExp(`^/qualifications/applications/${UUID}$`)], ['GET', /^\/qualifications\/history$/],
    ['POST', new RegExp(`^/applications/${UUID}/discord-decision$`)], ['GET', new RegExp(`^/applications/${UUID}$`)], ['GET', /^\/applications\/history$/],
    ['POST', /^\/communication\/channels\/(TEAM|DISPATCH)\/messages$/],
    ['GET', /^\/leave$/], ['POST', /^\/leave$/], ['POST', new RegExp(`^/leave/${UUID}/(decision|cancel)$`)],
    ['POST', /^\/support-tickets$/], ['POST', new RegExp(`^/support-tickets/${UUID}/actions$`)], ['GET', new RegExp(`^/support-tickets/${UUID}/options$`)],
];
let AuthGuard = class AuthGuard {
    reflector;
    prisma;
    discord;
    botToken = (0, env_1.loadEnv)().BOT_API_TOKEN;
    constructor(reflector, prisma, discord) {
        this.reflector = reflector;
        this.prisma = prisma;
        this.discord = discord;
    }
    validBotToken(header) {
        if (!this.botToken || typeof header !== 'string' || !header.startsWith('Bot '))
            return false;
        const a = (0, node_crypto_1.createHash)('sha256').update(header.slice(4)).digest(), b = (0, node_crypto_1.createHash)('sha256').update(this.botToken).digest();
        return (0, node_crypto_1.timingSafeEqual)(a, b); // konstante Zeit
    }
    async botFailure(req, detail) {
        await this.prisma.securityEvent.create({ data: { type: 'INVALID_TOKEN', detail, requestId: req.requestId, ip: req.ip } }).catch(() => undefined);
        throw new errors_1.AppError('UNAUTHENTICATED', 'Authentication required.');
    }
    async canActivate(ctx) {
        if (ctx.getType() !== 'http')
            return true;
        const req = ctx.switchToHttp().getRequest();
        const isBotHeader = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bot ');
        // Dienst-zu-Dienst-Routen des Bots: ausschließlich per Bot-Token, niemals per Session.
        if (this.reflector.getAllAndOverride(decorators_1.BOT_SERVICE_KEY, [ctx.getHandler(), ctx.getClass()])) {
            if (!this.validBotToken(req.headers.authorization))
                await this.botFailure(req, 'bot service token');
            return true;
        }
        if (this.reflector.getAllAndOverride(decorators_1.PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]))
            return true;
        // Bot im Namen eines Benutzers: Token + Discord-ID → verknüpfter, aktiver Benutzer; nur Allowlist-Routen.
        if (isBotHeader) {
            if (!this.validBotToken(req.headers.authorization))
                await this.botFailure(req, 'bot user token');
            const path = req.path.replace(/^\/api\/v1/, '');
            if (!BOT_USER_ROUTES.some(([m, re]) => m === req.method && re.test(path)))
                throw new errors_1.AppError('PERMISSION_DENIED', 'This route is not available to the bot.');
            const discordId = req.headers['x-discord-user'];
            if (typeof discordId !== 'string' || !/^\d{15,25}$/.test(discordId))
                throw new errors_1.AppError('VALIDATION_FAILED', 'X-Discord-User header required.');
            const user = await this.discord.resolveUser(discordId);
            if (!user)
                throw new errors_1.AppError('UNAUTHENTICATED', 'Discord account is not linked.', { reason: 'NOT_LINKED' });
            req.user = { id: user.id, username: user.username, displayName: user.displayName, robloxUserId: user.robloxUserId, sessionId: 'bot' };
            return true;
        }
        const token = req.cookies?.[exports.SESSION_COOKIE];
        if (!token)
            throw new errors_1.AppError('UNAUTHENTICATED', 'Authentication required.');
        const session = await this.prisma.session.findUnique({ where: { tokenHash: (0, exports.hashToken)(token) }, include: { user: true } });
        if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.active) {
            await this.prisma.securityEvent.create({ data: { type: 'INVALID_TOKEN', requestId: req.requestId, ip: req.ip } }).catch(() => undefined);
            throw new errors_1.AppError('UNAUTHENTICATED', 'Authentication required.');
        }
        req.user = { id: session.user.id, username: session.user.username, displayName: session.user.displayName, robloxUserId: session.user.robloxUserId, sessionId: session.id };
        return true;
    }
};
exports.AuthGuard = AuthGuard;
exports.AuthGuard = AuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector, prisma_service_1.PrismaService, discord_service_1.DiscordService])
], AuthGuard);
let PermissionGuard = class PermissionGuard {
    reflector;
    perms;
    prisma;
    constructor(reflector, perms, prisma) {
        this.reflector = reflector;
        this.perms = perms;
        this.prisma = prisma;
    }
    async canActivate(ctx) {
        if (ctx.getType() !== 'http')
            return true;
        const required = this.reflector.getAllAndOverride(decorators_1.PERMISSION_KEY, [ctx.getHandler(), ctx.getClass()]);
        if (!required?.length)
            return true;
        const req = ctx.switchToHttp().getRequest();
        if (!req.user)
            throw new errors_1.AppError('UNAUTHENTICATED', 'Authentication required.');
        const pctx = await this.perms.contextFor(req.user.id);
        for (const p of required) {
            if (!(0, shared_1.resolvePermission)(pctx, p).allowed) {
                await this.prisma.securityEvent.create({ data: { type: 'PERMISSION_DENIED', userId: req.user.id, detail: p, requestId: req.requestId, ip: req.ip } }).catch(() => undefined);
                throw new errors_1.AppError('PERMISSION_DENIED', 'You do not have permission to perform this action.');
            }
        }
        return true;
    }
};
exports.PermissionGuard = PermissionGuard;
exports.PermissionGuard = PermissionGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector, permission_service_1.PermissionService, prisma_service_1.PrismaService])
], PermissionGuard);
//# sourceMappingURL=guards.js.map