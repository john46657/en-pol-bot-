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
exports.BotEmbedsController = exports.EmbedsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const embeds_service_1 = require("./embeds.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const guild_context_1 = require("../common/guild-context");
const errors_1 = require("../common/errors");
const sf = zod_1.z.string().regex(/^\d{15,25}$/);
/** Administration → Embeds. */
let EmbedsController = class EmbedsController {
    s;
    constructor(s) {
        this.s = s;
    }
    list() { return this.s.all((0, guild_context_1.currentGuild)()); }
    save(a, id, b) {
        if (b.id !== id)
            throw new errors_1.AppError('VALIDATION_FAILED', 'ID passt nicht.');
        return this.s.save(a, b);
    }
    duplicate(a, id) { return this.s.duplicate(a, id); }
    remove(a, id) { return this.s.remove(a, id); }
    send(a, id, b) { return this.s.send(a, id, b.mode); }
};
exports.EmbedsController = EmbedsController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('settings.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], EmbedsController.prototype, "list", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(embeds_service_1.embedSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], EmbedsController.prototype, "save", null);
__decorate([
    (0, common_1.Post)(':id/duplicate'),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], EmbedsController.prototype, "duplicate", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], EmbedsController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/send'),
    (0, common_1.HttpCode)(202),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ mode: zod_1.z.enum(['update', 'new']).default('update') })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], EmbedsController.prototype, "send", null);
exports.EmbedsController = EmbedsController = __decorate([
    (0, swagger_1.ApiTags)('embeds'),
    (0, common_1.Controller)('embeds'),
    __metadata("design:paramtypes", [embeds_service_1.EmbedsService])
], EmbedsController);
let BotEmbedsController = class BotEmbedsController {
    s;
    constructor(s) {
        this.s = s;
    }
    async posted(id, b) { await this.s.posted(id, b.channelId, b.messageId); }
};
exports.BotEmbedsController = BotEmbedsController;
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)(':id/posted'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ channelId: sf, messageId: sf })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], BotEmbedsController.prototype, "posted", null);
exports.BotEmbedsController = BotEmbedsController = __decorate([
    (0, swagger_1.ApiTags)('bot'),
    (0, common_1.Controller)('bot/embeds'),
    __metadata("design:paramtypes", [embeds_service_1.EmbedsService])
], BotEmbedsController);
//# sourceMappingURL=embeds.controller.js.map