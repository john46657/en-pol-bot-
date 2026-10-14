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
exports.HomeServerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const guild_context_1 = require("../common/guild-context");
/**
 * Der eine Discord-Server dieses Systems (siehe guild-context.ts). Hält den gespeicherten Teil (Einstellung „Discord-Server-ID“
 * bzw. der einzige Server des Bots) aktuell – beim Start, alle 60 s und direkt nach dem Speichern der Einstellungen.
 */
let HomeServerService = class HomeServerService {
    prisma;
    log = new common_1.Logger('HomeServer');
    timer;
    warned = false;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async onModuleInit() {
        await this.refresh().catch((e) => this.log.warn(`Discord-Server nicht ermittelbar: ${e instanceof Error ? e.message : e}`));
        if (process.env.NODE_ENV === 'test')
            return;
        this.timer = setInterval(() => void this.refresh().catch(() => undefined), 60_000);
        this.timer.unref?.();
    }
    onModuleDestroy() { clearInterval(this.timer); }
    /** Gespeicherten Server neu bestimmen und zurückgeben (`DISCORD_GUILD_ID` hat immer Vorrang). */
    async refresh() {
        const [channels, known] = await Promise.all([
            this.prisma.systemSetting.findUnique({ where: { key: 'discord.channels' } }),
            this.prisma.systemSetting.findUnique({ where: { key: 'discord.guilds' } }),
        ]);
        const guilds = (Array.isArray(known?.value) ? known.value : []).map((g) => String(g.id ?? '')).filter((id) => /^\d{15,25}$/.test(id));
        const configured = (0, guild_context_1.firstGuildId)(channels?.value?.guildId);
        (0, guild_context_1.setStoredHomeGuild)(configured ?? (guilds.length === 1 ? guilds[0] : null));
        const env = (process.env.DISCORD_GUILD_ID ?? '').split(/[\s,;]+/).filter((g) => /^\d{15,25}$/.test(g));
        if (env.length > 1 && !this.warned) {
            this.warned = true;
            this.log.warn(`DISCORD_GUILD_ID enthält mehrere Server – verwendet wird nur ${env[0]}.`);
        }
        return (0, guild_context_1.homeGuild)();
    }
};
exports.HomeServerService = HomeServerService;
exports.HomeServerService = HomeServerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], HomeServerService);
//# sourceMappingURL=home-server.service.js.map