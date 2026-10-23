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
const prisma_service_1 = require("../prisma/prisma.service");
const decorators_1 = require("./decorators");
const discord_service_1 = require("../discord/discord.service");
const discord_access_service_1 = require("./discord-access.service");
const authorization_service_1 = require("./authorization.service");
const guild_context_1 = require("../common/guild-context");
const env_1 = require("../config/env");
const errors_1 = require("../common/errors");
const qualifications_service_1 = require("../qualifications/qualifications.service");
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
    ['GET', /^\/team\/(overview|me|me\/hours|me\/shifts|me\/shift-stats|hours|shifts|leaderboard)$/], ['PUT', /^\/team\/me\/status$/], ['PUT', new RegExp(`^/team/${UUID}/status$`)],
    ['GET', /^\/dispatch\/units\/?$/], ['PUT', new RegExp(`^/dispatch/units/${UUID}/status$`)],
    ['POST', /^\/tickets\/?$/],
    ['GET', /^\/auth\/me$/], ['DELETE', /^\/discord\/link$/], ['GET', /^\/notifications\/?$/],
    ['POST', /^\/reports\/?$/], ['POST', new RegExp(`^/reports/${UUID}/submit$`)], ['POST', /^\/complaints\/?$/],
    ['POST', /^\/wanted\/?$/],
    ['POST', new RegExp(`^/dispatch/incidents/${UUID}/assign$`)], ['PUT', new RegExp(`^/dispatch/incidents/${UUID}/status$`)], ['POST', new RegExp(`^/dispatch/incidents/${UUID}/close$`)],
    ['GET', /^\/radio-codes$/], ['GET', /^\/teamchance$/],
    ['GET', /^\/danger-level$/], ['PUT', /^\/danger-level$/],
    ['GET', /^\/radio-whitelist(\/check)?$/], ['POST', /^\/radio-whitelist(\/remove)?$/], ['POST', new RegExp(`^/radio-whitelist/requests/${UUID}/decision$`)],
    ['GET', /^\/sek\/(me|members|reports)$/], ['POST', /^\/sek\/(members|members\/remove|reports)$/],
    ['POST', new RegExp(`^/qualifications/applications/${UUID}/decision$`)], ['GET', new RegExp(`^/qualifications/applications/${UUID}$`)], ['GET', /^\/qualifications\/history$/],
    ['POST', new RegExp(`^/applications/${UUID}/discord-decision$`)], ['GET', new RegExp(`^/applications/${UUID}$`)], ['GET', /^\/applications\/history$/],
    // KI-Bewerbungsprüfung per Discord-Button (gleiche Rechte wie im Dashboard, Ergebnis nur privat für den Prüfer)
    ['GET', new RegExp(`^/(applications|qualifications/applications)/${UUID}/ai-review$`)], ['POST', new RegExp(`^/(applications|qualifications/applications)/${UUID}/ai-review$`)],
    ['POST', /^\/communication\/channels\/(TEAM|DISPATCH)\/messages$/],
    ['GET', /^\/leave$/], ['POST', /^\/leave$/], ['POST', new RegExp(`^/leave/${UUID}/(decision|cancel|extend|extension-decision)$`)],
    ['GET', /^\/cad\/(units|incidents|calls|config)$/], ['GET', /^\/fleet\/vehicles$/], ['POST', /^\/cad\/radio$/], ['POST', new RegExp(`^/cad/units/${UUID}/(status|feedback)$`)],
    ['POST', new RegExp(`^/cad/calls/${UUID}/(claim|close|incident|assign)$`)], ['POST', new RegExp(`^/cad/incidents/${UUID}/(status|units)$`)],
    ['GET', /^\/duty-reports(\/templates)?$/], ['GET', new RegExp(`^/duty-reports/templates/${UUID}/prefill$`)], ['GET', /^\/duty-reports\/[A-Za-z0-9-]{1,40}$/],
    ['POST', /^\/duty-reports$/], ['PATCH', new RegExp(`^/duty-reports/${UUID}$`)], ['POST', new RegExp(`^/duty-reports/${UUID}/review$`)],
    ['POST', /^\/support-tickets$/], ['POST', new RegExp(`^/support-tickets/${UUID}/actions$`)], ['GET', new RegExp(`^/support-tickets/${UUID}/options$`)],
];
let AuthGuard = class AuthGuard {
    reflector;
    prisma;
    discord;
    access;
    authz;
    botToken = (0, env_1.loadEnv)().BOT_API_TOKEN;
    constructor(reflector, prisma, discord, access, authz) {
        this.reflector = reflector;
        this.prisma = prisma;
        this.discord = discord;
        this.access = access;
        this.authz = authz;
    }
    validBotToken(header) {
        if (!this.botToken || typeof header !== 'string' || !header.startsWith('Bot '))
            return false;
        const a = (0, node_crypto_1.createHash)('sha256').update(header.slice(4)).digest(), b = (0, node_crypto_1.createHash)('sha256').update(this.botToken).digest();
        return (0, node_crypto_1.timingSafeEqual)(a, b); // konstante Zeit
    }
    async botFailure(req, detail) {
        await this.prisma.securityEvent.create({ data: { type: 'INVALID_TOKEN', detail, requestId: req.requestId, ip: req.ip } }).catch(() => undefined);
        throw new errors_1.AppError('UNAUTHENTICATED', 'Bitte melde dich an.');
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
                throw new errors_1.AppError('PERMISSION_DENIED', 'Diese Funktion steht dem Bot nicht zur Verfügung.');
            const discordId = req.headers['x-discord-user'];
            if (typeof discordId !== 'string' || !/^\d{15,25}$/.test(discordId))
                throw new errors_1.AppError('VALIDATION_FAILED', 'Der Header X-Discord-User fehlt.');
            const user = await this.discord.resolveUser(discordId);
            if (!user)
                throw new errors_1.AppError('UNAUTHENTICATED', 'Dein Discord-Konto ist nicht verknüpft.', { reason: 'NOT_LINKED' });
            req.user = { id: user.id, username: user.username, displayName: user.displayName, robloxUserId: user.robloxUserId, sessionId: 'bot' };
            // Discord-Befehl auf einem Server: die Interaktion belegt die aktuelle Mitgliedschaft und Rollen auf GENAU diesem Server
            const guildId = (0, guild_context_1.currentGuild)();
            if (guildId) {
                const server = await this.authz.server(guildId);
                if (server) {
                    const raw = req.headers['x-discord-roles'];
                    const roles = typeof raw === 'string' ? raw.split(',').filter((x) => /^\d{15,25}$/.test(x)).slice(0, 100) : [];
                    await this.access.recordMemberships(user.id, { [guildId]: roles }, [guildId]);
                    await this.access.syncRoles(user.id, { [guildId]: roles }, undefined, [guildId]).catch(() => undefined);
                }
            }
            return true;
        }
        const token = req.cookies?.[exports.SESSION_COOKIE];
        if (!token)
            throw new errors_1.AppError('UNAUTHENTICATED', 'Bitte melde dich an.');
        const session = await this.prisma.session.findUnique({ where: { tokenHash: (0, exports.hashToken)(token) }, include: { user: true } });
        if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.active) {
            await this.prisma.securityEvent.create({ data: { type: 'INVALID_TOKEN', requestId: req.requestId, ip: req.ip } }).catch(() => undefined);
            throw new errors_1.AppError('UNAUTHENTICATED', 'Bitte melde dich an.');
        }
        // Discord-Rollen laufend prüfen (nicht nur beim Login): ohne freigeschaltete Rolle ist die Session sofort beendet
        if (!(await this.access.verify(session.user.id)))
            throw new errors_1.AppError('UNAUTHENTICATED', 'Deine Discord-Rollen geben dir keinen Zugang mehr zu diesem Dashboard.', { reason: 'NO_ACCESS' });
        req.user = { id: session.user.id, username: session.user.username, displayName: session.user.displayName, robloxUserId: session.user.robloxUserId, sessionId: session.id };
        return true;
    }
};
exports.AuthGuard = AuthGuard;
exports.AuthGuard = AuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector, prisma_service_1.PrismaService, discord_service_1.DiscordService, discord_access_service_1.DiscordAccessService, authorization_service_1.AuthorizationService])
], AuthGuard);
/**
 * Jede Route mit `@RequirePermission` läuft über den zentralen AuthorizationService: Server der Anfrage (X-Guild-Id)
 * registriert und aktiv, bestätigte Mitgliedschaft, Modul an, Berechtigung. Routen unter `/servers/:serverId/…` prüfen
 * zusätzlich gegen den Pfad-Server (siehe ServersController) – der Header kann den Pfad nie übersteuern.
 */
let PermissionGuard = class PermissionGuard {
    reflector;
    authz;
    moduleRef;
    constructor(reflector, authz, moduleRef) {
        this.reflector = reflector;
        this.authz = authz;
        this.moduleRef = moduleRef;
    }
    async canActivate(ctx) {
        if (ctx.getType() !== 'http')
            return true;
        const required = this.reflector.getAllAndOverride(decorators_1.PERMISSION_KEY, [ctx.getHandler(), ctx.getClass()]);
        if (!required?.length)
            return true;
        const req = ctx.switchToHttp().getRequest();
        if (!req.user)
            throw new errors_1.AppError('UNAUTHENTICATED', 'Bitte melde dich an.');
        const manager = this.reflector.getAllAndOverride(decorators_1.DISCORD_MANAGER_KEY, [ctx.getHandler(), ctx.getClass()]);
        for (const p of required) {
            if (manager && (await this.discordManager(req, p, manager)))
                continue;
            await this.authz.assert(req.user.id, (0, guild_context_1.currentGuild)(), p, {}, { requestId: req.requestId, ip: req.ip });
        }
        return true;
    }
    /** Bot-Klick mit Manager-Rolle der Bewerbung: fehlt NUR das Recht (Server, Mitgliedschaft, Modul passen), reicht die Rolle. */
    async discordManager(req, permission, kind) {
        const guildId = (0, guild_context_1.currentGuild)();
        if (req.user?.sessionId !== 'bot' || !guildId)
            return false;
        const d = await this.authz.authorize(req.user.id, guildId, permission);
        if (d.allowed || d.reason !== 'PERMISSION')
            return false;
        const raw = req.headers['x-discord-roles'];
        const roles = typeof raw === 'string' ? raw.split(',').filter((x) => /^\d{15,25}$/.test(x)).slice(0, 100) : [];
        const id = typeof req.params?.id === 'string' ? req.params.id : undefined;
        return this.moduleRef.get(qualifications_service_1.QualificationsService, { strict: false }).isDiscordManager(guildId, roles, kind, id);
    }
};
exports.PermissionGuard = PermissionGuard;
exports.PermissionGuard = PermissionGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector, authorization_service_1.AuthorizationService, core_1.ModuleRef])
], PermissionGuard);
//# sourceMappingURL=guards.js.map