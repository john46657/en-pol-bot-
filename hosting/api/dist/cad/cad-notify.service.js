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
const guild_context_1 = require("../common/guild-context");
const discord_service_1 = require("../discord/discord.service");
const realtime_service_1 = require("../realtime/realtime.service");
const cad_config_service_1 = require("./cad-config.service");
/**
 * Überträgt CAD-Ereignisse nach Discord. Zielkanäle kommen ausschließlich aus der Konfiguration (CAD-Einstellungen → Discord).
 * Nichts ist hartcodiert; ohne Konfiguration wird nichts gesendet. Zuordnungen, die noch auf einen anderen Discord-Server
 * zeigen (aus der früheren Multi-Server-Zeit), werden nicht mehr bedient.
 */
let CadNotifyService = class CadNotifyService {
    discord;
    cfg;
    rt;
    constructor(discord, cfg, rt) {
        this.discord = discord;
        this.cfg = cfg;
        this.rt = rt;
    }
    async targets(event) {
        const cfg = await this.cfg.get();
        const channels = new Set(), pings = new Set();
        for (const r of cfg.routes) {
            if (!r.enabled || r.event !== event || !(0, guild_context_1.isHomeGuild)(r.guildId))
                continue;
            r.channelIds.forEach((c) => channels.add(c));
            r.pingRoleIds?.forEach((x) => pings.add(x));
        }
        return { channelIds: [...channels], pingRoleIds: [...pings] };
    }
    /** Best effort: Fehler beim Benachrichtigen stören den Fachprozess nie. */
    async emit(event, payload) {
        this.rt.publish('cad', `cad.${event}`, { id: payload.id ?? null });
        try {
            const t = await this.targets(event);
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
    __metadata("design:paramtypes", [discord_service_1.DiscordService, cad_config_service_1.CadConfigService, realtime_service_1.RealtimeService])
], CadNotifyService);
//# sourceMappingURL=cad-notify.service.js.map