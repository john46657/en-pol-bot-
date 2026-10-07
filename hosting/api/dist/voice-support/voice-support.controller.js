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
exports.BotVoiceSupportController = exports.VoiceSupportController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const voice_support_service_1 = require("./voice-support.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const guild_context_1 = require("../common/guild-context");
const sf = zod_1.z.string().regex(/^\d{15,25}$/);
const guildQ = zod_1.z.object({ guildId: sf.optional() });
const casesQ = zod_1.z.object({ guildId: sf.optional(), status: zod_1.z.enum(['OPEN', 'WAITING', 'CLAIMED', 'DECLINED', 'ABANDONED', 'CLOSED']).optional() });
const voice = zod_1.z.object({ guildId: sf, channelId: sf, discordId: sf, userName: zod_1.z.string().trim().min(1).max(100).default('?') });
const staff = zod_1.z.object({ discordId: sf, name: zod_1.z.string().trim().min(1).max(100), roleIds: zod_1.z.array(sf).max(250).default([]), admin: zod_1.z.boolean().default(false) });
/** Dashboard: Räume (Tickets → Sprach-Support) und Fälle. */
let VoiceSupportController = class VoiceSupportController {
    s;
    constructor(s) {
        this.s = s;
    }
    rooms(q) { return this.s.rooms(q.guildId ?? (0, guild_context_1.currentGuild)()); }
    save(a, q, b) { return this.s.saveRooms(a, b, q.guildId ?? (0, guild_context_1.currentGuild)()); }
    cases(q) { return this.s.cases({ guildId: q.guildId ?? (0, guild_context_1.currentGuild)(), status: q.status }); }
};
exports.VoiceSupportController = VoiceSupportController;
__decorate([
    (0, common_1.Get)('rooms'),
    (0, decorators_1.RequirePermission)('ticket.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], VoiceSupportController.prototype, "rooms", null);
__decorate([
    (0, common_1.Put)('rooms'),
    (0, decorators_1.RequirePermission)('ticket.settings'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildQ))),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(voice_support_service_1.roomsSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0, Array]),
    __metadata("design:returntype", void 0)
], VoiceSupportController.prototype, "save", null);
__decorate([
    (0, common_1.Get)('cases'),
    (0, decorators_1.RequirePermission)('ticket.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(casesQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], VoiceSupportController.prototype, "cases", null);
exports.VoiceSupportController = VoiceSupportController = __decorate([
    (0, swagger_1.ApiTags)('voice-support'),
    (0, common_1.Controller)('voice-support'),
    __metadata("design:paramtypes", [voice_support_service_1.VoiceSupportService])
], VoiceSupportController);
/** Dienstweg des Bots. Team-Aktionen tragen Discord-ID, Name und Rollen der klickenden Person (Team-Rolle des Raums). */
let BotVoiceSupportController = class BotVoiceSupportController {
    s;
    constructor(s) {
        this.s = s;
    }
    rooms(q) { return this.s.rooms(q.guildId); }
    join(b) { return this.s.join(b); }
    left(b) { return this.s.left(b); }
    empty(b) { return this.s.channelEmpty(b.channelId); }
    async posted(id, b) { await this.s.posted(id, b.messageId); }
    claim(id, b) { return this.s.claim(id, b); }
    channel(id, b) { return this.s.channel(id, b); }
    decline(id, b) { return this.s.decline(id, b, b.reason); }
    message(id, b) { return this.s.sendMessage(id, b, b.text); }
    close(id, b) { return this.s.close(id, b); }
    rate(id, b) { return this.s.rate(id, b.discordId, b.stars); }
};
exports.BotVoiceSupportController = BotVoiceSupportController;
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)('rooms'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotVoiceSupportController.prototype, "rooms", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('join'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(voice))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotVoiceSupportController.prototype, "join", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('left'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(voice))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotVoiceSupportController.prototype, "left", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('empty'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ channelId: sf })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BotVoiceSupportController.prototype, "empty", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('cases/:id/posted'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ messageId: sf })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], BotVoiceSupportController.prototype, "posted", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('cases/:id/claim'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(staff))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0]),
    __metadata("design:returntype", void 0)
], BotVoiceSupportController.prototype, "claim", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('cases/:id/channel'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ channelId: sf.nullable(), created: zod_1.z.boolean(), threadId: sf.nullable() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BotVoiceSupportController.prototype, "channel", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('cases/:id/decline'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(staff.extend({ reason: zod_1.z.string().trim().max(500).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BotVoiceSupportController.prototype, "decline", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('cases/:id/message'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(staff.extend({ text: zod_1.z.string().trim().min(1).max(2000) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BotVoiceSupportController.prototype, "message", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('cases/:id/close'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(staff))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0]),
    __metadata("design:returntype", void 0)
], BotVoiceSupportController.prototype, "close", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('cases/:id/rating'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ discordId: sf, stars: zod_1.z.number().int().min(1).max(5) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BotVoiceSupportController.prototype, "rate", null);
exports.BotVoiceSupportController = BotVoiceSupportController = __decorate([
    (0, swagger_1.ApiTags)('bot'),
    (0, common_1.Controller)('bot/voice-support'),
    __metadata("design:paramtypes", [voice_support_service_1.VoiceSupportService])
], BotVoiceSupportController);
//# sourceMappingURL=voice-support.controller.js.map