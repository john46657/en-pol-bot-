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
exports.BotController = exports.DiscordController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const zod_1 = require("zod");
const discord_service_1 = require("./discord.service");
const applications_service_1 = require("../applications/applications.service");
const danger_service_1 = require("../danger/danger.service");
const duty_service_1 = require("../duty/duty.service");
const prisma_service_1 = require("../prisma/prisma.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const redeem = zod_1.z.object({ code: zod_1.z.string().trim().min(8).max(12), discordId: zod_1.z.string().regex(/^\d{15,25}$/) });
const ack = zod_1.z.object({ ok: zod_1.z.boolean(), error: zod_1.z.string().max(300).optional() });
const outboxQ = zod_1.z.object({ limit: zod_1.z.coerce.number().int().min(1).max(50).default(20) });
const rate = process.env.NODE_ENV === 'test' ? 10_000 : 20;
const stateKey = zod_1.z.string().regex(/^[a-z0-9:_-]{1,64}$/);
const stateBody = zod_1.z.object({ value: zod_1.z.unknown() });
const openQ = zod_1.z.object({ discordId: zod_1.z.string().regex(/^\d{15,25}$/) });
const application = zod_1.z.object({ robloxUsername: zod_1.z.string().trim().min(1).max(64), robloxUserId: zod_1.z.string().max(20).optional(), discordId: zod_1.z.string().regex(/^\d{15,25}$/), answers: zod_1.z.record(zod_1.z.string(), zod_1.z.string().max(5000)) });
/** Web-Seite: eigenes Konto verknüpfen. Authentifiziert per Session; Bot-Zugang ist hier nicht erlaubt. */
let DiscordController = class DiscordController {
    d;
    constructor(d) {
        this.d = d;
    }
    link(a) { return this.d.status(a.userId); }
    linkCode(a) { return this.d.createLinkCode(a); }
    unlinkSelf(a) { return this.d.unlink(a, a.userId); }
    unlinkUser(a, userId) { return this.d.unlink(a, userId); }
};
exports.DiscordController = DiscordController;
__decorate([
    (0, common_1.Get)('link'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DiscordController.prototype, "link", null);
__decorate([
    (0, common_1.Post)('link-code'),
    (0, throttler_1.Throttle)({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 10, ttl: 60_000 } }),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DiscordController.prototype, "linkCode", null);
__decorate([
    (0, common_1.Delete)('link'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DiscordController.prototype, "unlinkSelf", null);
__decorate([
    (0, common_1.Delete)('links/:userId'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('users.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DiscordController.prototype, "unlinkUser", null);
exports.DiscordController = DiscordController = __decorate([
    (0, swagger_1.ApiTags)('discord'),
    (0, common_1.Controller)('discord'),
    __metadata("design:paramtypes", [discord_service_1.DiscordService])
], DiscordController);
/** Dienst-zu-Dienst-Endpunkte des Bots (Header `Authorization: Bot <BOT_API_TOKEN>`); ohne Benutzerkontext. */
let BotController = class BotController {
    d;
    duty;
    danger;
    applications;
    prisma;
    constructor(d, duty, danger, applications, prisma) {
        this.d = d;
        this.duty = duty;
        this.danger = danger;
        this.applications = applications;
        this.prisma = prisma;
    }
    redeem(b) { return this.d.redeem(b.code, b.discordId); }
    config() { return this.d.channels(); }
    outbox(q) { return this.d.pending(q.limit); }
    ack(id, b) { return this.d.ack(id, b.ok, b.error); }
    /** Teamübersicht für die selbst aktualisierende Teamliste in Discord (nur Anzeigefelder). */
    async team() {
        const rows = await this.duty.overview();
        const order = ((await this.prisma.systemSetting.findUnique({ where: { key: 'team.rankOrder' } }))?.value ?? []);
        return { rankOrder: order, members: rows.map((r) => ({ name: r.name, rank: r.rank, callsign: r.callsign, team: r.team, dutyStatus: r.dutyStatus, unit: r.unit?.callsign ?? null })) };
    }
    dangerState() { return this.danger.get(); }
    async getState(key) { return { value: await this.d.getState(key) }; }
    async setState(key, b) { await this.d.setState(key, b.value); }
    /** Bewerbung aus Discord. Eigener Dienstweg (mit Bot-Token), damit das öffentliche Rate-Limit pro IP nicht alle Discord-Bewerber gemeinsam trifft. */
    openApplication(q) { return this.applications.openForDiscord(q.discordId); }
    submitApplication(b) { return this.applications.submit({ robloxUsername: b.robloxUsername, robloxUserId: b.robloxUserId, answers: b.answers }, { discordId: b.discordId }); }
};
exports.BotController = BotController;
__decorate([
    (0, decorators_1.BotService)(),
    (0, throttler_1.Throttle)({ default: { limit: rate, ttl: 60_000 } }),
    (0, common_1.Post)('link'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(redeem))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotController.prototype, "redeem", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)('config'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], BotController.prototype, "config", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)('outbox'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(outboxQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotController.prototype, "outbox", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('outbox/:id/ack'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(ack))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0]),
    __metadata("design:returntype", void 0)
], BotController.prototype, "ack", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)('team'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BotController.prototype, "team", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)('danger'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], BotController.prototype, "dangerState", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)('state/:key'),
    __param(0, (0, common_1.Param)('key', (0, zod_pipe_1.zodBody)(stateKey))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BotController.prototype, "getState", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Put)('state/:key'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Param)('key', (0, zod_pipe_1.zodBody)(stateKey))),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(stateBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0]),
    __metadata("design:returntype", Promise)
], BotController.prototype, "setState", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)('application/open'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(openQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotController.prototype, "openApplication", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, throttler_1.Throttle)({ default: { limit: rate, ttl: 60_000 } }),
    (0, common_1.Post)('application'),
    (0, common_1.HttpCode)(201),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(application))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotController.prototype, "submitApplication", null);
exports.BotController = BotController = __decorate([
    (0, swagger_1.ApiTags)('bot'),
    (0, common_1.Controller)('bot'),
    __metadata("design:paramtypes", [discord_service_1.DiscordService, duty_service_1.DutyService, danger_service_1.DangerService, applications_service_1.ApplicationsService, prisma_service_1.PrismaService])
], BotController);
//# sourceMappingURL=discord.controller.js.map