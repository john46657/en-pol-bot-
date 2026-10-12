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
exports.CadLinkInterceptor = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const prisma_service_1 = require("../prisma/prisma.service");
const guild_context_1 = require("../common/guild-context");
const cad_config_service_1 = require("./cad-config.service");
/**
 * CAD-Querverbindung als ausdrücklich eingerichtete Ausnahme der Server-Trennung: Ein Discord-Befehl von einem anderen
 * Server (z. B. SEK/K9) arbeitet NUR DANN im Bereich der Leitstelle, wenn
 *  - dieser Server die Leitstelle als Heimat-Server eingestellt hat (CAD → Einstellungen) UND
 *  - die Leitstelle eine aktive Verbindung zu diesem Server eingerichtet hat (CadServerLink).
 * Welche Aktionen erlaubt sind, prüft danach weiterhin `CadService.assertCrossServer` (Aktion + Rolle).
 * Ohne Verbindung bleibt jeder Server in seiner eigenen Leitstelle. Dashboard-Anfragen werden nie umgeleitet.
 */
let CadLinkInterceptor = class CadLinkInterceptor {
    prisma;
    cfg;
    constructor(prisma, cfg) {
        this.prisma = prisma;
        this.cfg = cfg;
    }
    intercept(ctx, next) {
        const req = ctx.switchToHttp().getRequest();
        const g = (0, guild_context_1.currentGuild)();
        const fromDiscord = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bot ') && typeof req.headers['x-discord-user'] === 'string';
        req.originGuildId = g;
        if (!g || !fromDiscord)
            return next.handle();
        return (0, rxjs_1.from)(this.target(g)).pipe((0, rxjs_1.switchMap)((home) => (home ? new rxjs_1.Observable((sub) => (0, guild_context_1.runInGuild)(home, () => next.handle().subscribe(sub))) : next.handle())));
    }
    /** Leitstelle, in deren Bereich dieser Befehl laufen darf (oder null = eigener Server). */
    async target(g) {
        const home = (await this.cfg.get()).homeGuildId ?? null; // Einstellung DIESES Servers
        if (!home || home === g)
            return null;
        const link = await this.prisma.cadServerLink.findFirst({ where: { active: true, sourceGuildId: home, targetGuildId: g }, select: { id: true } });
        return link ? home : null;
    }
};
exports.CadLinkInterceptor = CadLinkInterceptor;
exports.CadLinkInterceptor = CadLinkInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, cad_config_service_1.CadConfigService])
], CadLinkInterceptor);
//# sourceMappingURL=cad-link.interceptor.js.map