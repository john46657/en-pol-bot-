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
const discord_live_service_1 = require("./discord-live.service");
const applications_service_1 = require("../applications/applications.service");
const danger_service_1 = require("../danger/danger.service");
const duty_service_1 = require("../duty/duty.service");
const prisma_service_1 = require("../prisma/prisma.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const sf = zod_1.z.string().regex(/^\d{15,25}$/);
const guildsBody = zod_1.z.object({ guilds: zod_1.z.array(zod_1.z.object({
        id: sf, name: zod_1.z.string().max(100), icon: zod_1.z.string().url().max(300).nullable(),
        banner: zod_1.z.string().url().max(300).nullable().optional(), memberCount: zod_1.z.number().int().min(0).optional(),
        channels: zod_1.z.array(zod_1.z.object({ id: sf, name: zod_1.z.string().max(100), type: zod_1.z.enum(['text', 'category', 'voice', 'other']), parentId: sf.nullable(), position: zod_1.z.number().int() })).max(500),
        roles: zod_1.z.array(zod_1.z.object({ id: sf, name: zod_1.z.string().max(100), color: zod_1.z.number().int().min(0), position: zod_1.z.number().int() })).max(250),
    })).max(50) });
const redeem = zod_1.z.object({ code: zod_1.z.string().trim().min(8).max(12), discordId: zod_1.z.string().regex(/^\d{15,25}$/) });
const ack = zod_1.z.object({ ok: zod_1.z.boolean(), error: zod_1.z.string().max(300).optional() });
const outboxQ = zod_1.z.object({ limit: zod_1.z.coerce.number().int().min(1).max(50).default(20) });
const rate = process.env.NODE_ENV === 'test' ? 10_000 : 20;
const stateKey = zod_1.z.string().regex(/^[a-z0-9:_-]{1,64}$/);
const stateBody = zod_1.z.object({ value: zod_1.z.unknown() });
const avatar = zod_1.z.string().url().max(300).nullable();
const membersBody = zod_1.z.object({ members: zod_1.z.array(zod_1.z.object({
        id: sf, guildId: sf, username: zod_1.z.string().max(100), displayName: zod_1.z.string().max(100), avatar, status: zod_1.z.enum(['online', 'idle', 'dnd', 'offline', 'unknown']),
        roleIds: zod_1.z.array(sf).max(250), joinedAt: zod_1.z.string().datetime().nullable(),
    })).max(5000) });
const voiceBody = zod_1.z.object({ channels: zod_1.z.array(zod_1.z.object({
        id: sf, guildId: sf, name: zod_1.z.string().max(100), parentId: sf.nullable(), parentName: zod_1.z.string().max(100).nullable(), position: zod_1.z.number().int(),
        members: zod_1.z.array(zod_1.z.object({ id: sf, displayName: zod_1.z.string().max(100), avatar, selfMute: zod_1.z.boolean(), selfDeaf: zod_1.z.boolean(), serverMute: zod_1.z.boolean(), serverDeaf: zod_1.z.boolean(), video: zod_1.z.boolean(), streaming: zod_1.z.boolean(), since: zod_1.z.string().datetime().nullable() })).max(500),
    })).max(500) });
const openQ = zod_1.z.object({ discordId: zod_1.z.string().regex(/^\d{15,25}$/) });
const application = zod_1.z.object({ guildId: zod_1.z.string().regex(/^\d{15,25}$/).optional(), robloxUsername: zod_1.z.string().trim().min(1).max(64), robloxUserId: zod_1.z.string().max(20).optional(), discordId: zod_1.z.string().regex(/^\d{15,25}$/), discordName: zod_1.z.string().trim().max(100).optional(), durationSec: zod_1.z.number().int().min(0).max(86_400).optional(), joinedAt: zod_1.z.coerce.date().optional(), answers: zod_1.z.record(zod_1.z.string(), zod_1.z.union([zod_1.z.string().max(5000), zod_1.z.array(zod_1.z.string().max(100)).max(25)])) });
/** Web-Seite: eigenes Konto verknüpfen. Authentifiziert per Session; Bot-Zugang ist hier nicht erlaubt. */
let DiscordController = class DiscordController {
    d;
    constructor(d) {
        this.d = d;
    }
    link(a) { return this.d.status(a.userId); }
    /** Server des Bots mit Channels und Rollen (Namen + Auswahllisten im Dashboard). */
    guilds() { return this.d.guilds(); }
    /** Welche Benachrichtigungs-Channels eingestellt sind (nur ja/nein, keine IDs) – Hinweise im Dashboard. */
    async channelStatus() { const c = await this.d.channels(); return Object.fromEntries(discord_service_1.CHANNEL_KEYS.map((k) => [k, !!c[k]])); }
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
    (0, common_1.Get)('guilds'),
    (0, decorators_1.RequirePermission)('dashboard.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], DiscordController.prototype, "guilds", null);
__decorate([
    (0, common_1.Get)('channel-status'),
    (0, decorators_1.RequirePermission)('dashboard.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DiscordController.prototype, "channelStatus", null);
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
    live;
    duty;
    danger;
    applications;
    prisma;
    constructor(d, live, duty, danger, applications, prisma) {
        this.d = d;
        this.live = live;
        this.duty = duty;
        this.danger = danger;
        this.applications = applications;
        this.prisma = prisma;
    }
    redeem(b) { return this.d.redeem(b.code, b.discordId); }
    config() { return this.d.channels(); }
    async guilds(b) { await this.d.saveGuilds(b.guilds); }
    outbox(q) { return this.d.pending(q.limit); }
    ack(id, b) { return this.d.ack(id, b.ok, b.error); }
    /** Teamübersicht für die selbst aktualisierende Teamliste in Discord (nur Anzeigefelder). */
    async team() {
        const rows = await this.duty.overview();
        const order = ((await this.prisma.systemSetting.findUnique({ where: { key: 'team.rankOrder' } }))?.value ?? []);
        return { rankOrder: order, members: rows.map((r) => ({ name: r.name, rank: r.rank, callsign: r.callsign, team: r.team, dutyStatus: r.dutyStatus, unit: r.unit?.callsign ?? null })) };
    }
    /** Teammitglieder (Avatar, Name, Online-Status, Rollen) – der Bot meldet mindestens alle 60 Sekunden. */
    async teamRoles() { return { roleIds: await this.live.teamRoleIds() }; }
    members(b) { this.live.setMembers(b.members); }
    /** Voice-Channels mit Personen (getrennt von der Teamliste). */
    voice(b) { this.live.setVoice(b.channels); }
    dangerState() { return this.danger.get(); }
    async getState(key) { return { value: await this.d.getState(key) }; }
    async setState(key, b) { await this.d.setState(key, b.value); }
    /** Bewerbung aus Discord. Eigener Dienstweg (mit Bot-Token), damit das öffentliche Rate-Limit pro IP nicht alle Discord-Bewerber gemeinsam trifft. */
    openApplication(q) { return this.applications.openForDiscord(q.discordId); }
    submitApplication(b) { return this.applications.submit({ robloxUsername: b.robloxUsername, robloxUserId: b.robloxUserId, answers: b.answers }, { discordId: b.discordId, discordName: b.discordName, durationSec: b.durationSec, joinedAt: b.joinedAt, guildId: b.guildId }); }
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
    (0, common_1.Put)('guilds'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(guildsBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", Promise)
], BotController.prototype, "guilds", null);
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
    (0, common_1.Get)('team-roles'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BotController.prototype, "teamRoles", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Put)('members'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(membersBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotController.prototype, "members", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Put)('voice'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(voiceBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotController.prototype, "voice", null);
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
    __metadata("design:paramtypes", [discord_service_1.DiscordService, discord_live_service_1.DiscordLiveService, duty_service_1.DutyService, danger_service_1.DangerService, applications_service_1.ApplicationsService, prisma_service_1.PrismaService])
], BotController);
//# sourceMappingURL=discord.controller.js.map