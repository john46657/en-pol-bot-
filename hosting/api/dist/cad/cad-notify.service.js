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
exports.CadNotifyService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const discord_service_1 = require("../discord/discord.service");
const realtime_service_1 = require("../realtime/realtime.service");
const cad_config_service_1 = require("./cad-config.service");
/**
 * Überträgt CAD-Ereignisse nach Discord. Zielkanäle kommen ausschließlich aus der Konfiguration:
 * 1. Kanalzuordnungen (CAD-Einstellungen → Discord) des Heimat-Servers des Ereignisses,
 * 2. aktive Server-Verbindungen, deren Datenart das Ereignis erlaubt (Kanäle der Verbindung + Zuordnungen des Ziel-Servers).
 * Nichts ist hartcodiert; ohne Konfiguration wird nichts gesendet.
 */
let CadNotifyService = class CadNotifyService {
    prisma;
    discord;
    cfg;
    rt;
    constructor(prisma, discord, cfg, rt) {
        this.prisma = prisma;
        this.discord = discord;
        this.cfg = cfg;
        this.rt = rt;
    }
    async targets(event, guildId) {
        const cfg = await this.cfg.get();
        const home = guildId ?? cfg.homeGuildId ?? null;
        const channels = new Set(), pings = new Set();
        const add = (route) => { route.channelIds.forEach((c) => channels.add(c)); route.pingRoleIds?.forEach((r) => pings.add(r)); };
        const routesFor = (g) => cfg.routes.filter((r) => r.enabled && r.event === event && (g === null || r.guildId === g));
        routesFor(home).forEach(add);
        const linked = [];
        if (home) {
            const sendType = shared_1.CAD_EVENT_SEND_TYPE[event];
            const links = await this.prisma.cadServerLink.findMany({ where: { active: true, notify: true, sourceGuildId: home, sendTypes: { has: sendType } } });
            for (const l of links) {
                linked.push(l.targetGuildId);
                const own = (l.channels ?? {})[sendType] ?? [];
                own.filter((c) => /^\d{15,25}$/.test(c)).forEach((c) => channels.add(c));
                routesFor(l.targetGuildId).forEach(add);
            }
        }
        return { channelIds: [...channels], pingRoleIds: [...pings], linkedGuilds: linked };
    }
    /** Best effort: Fehler beim Benachrichtigen stören den Fachprozess nie. */
    async emit(event, payload, guildId) {
        this.rt.publish('cad', `cad.${event}`, { id: payload.id ?? null });
        try {
            const t = await this.targets(event, guildId);
            if (!t.channelIds.length)
                return t;
            await this.discord.enqueue('cad', `cad.${event}`, { ...payload, channelIds: t.channelIds, pingRoleIds: t.pingRoleIds }, { always: true });
            return t;
        }
        catch {
            return null;
        }
    }
};
exports.CadNotifyService = CadNotifyService;
exports.CadNotifyService = CadNotifyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, discord_service_1.DiscordService, cad_config_service_1.CadConfigService, realtime_service_1.RealtimeService])
], CadNotifyService);
//# sourceMappingURL=cad-notify.service.js.map