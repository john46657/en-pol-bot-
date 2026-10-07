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
exports.RadioCodesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const radio_codes_service_1 = require("./radio-codes.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const fields = { meaning: zod_1.z.string().trim().min(1).max(200), category: zod_1.z.string().trim().max(64).nullable().optional(), description: zod_1.z.string().trim().max(1000).nullable().optional() };
const create = zod_1.z.object({ code: zod_1.z.string().trim().min(1).max(32), ...fields, guildId: zod_1.z.string().regex(/^\d{15,25}$/).nullable().optional() });
const update = zod_1.z.object({ code: zod_1.z.string().trim().min(1).max(32).optional(), meaning: fields.meaning.optional(), category: fields.category, description: fields.description });
const listQ = zod_1.z.object({ q: zod_1.z.string().max(64).optional() });
const discordCfg = zod_1.z.object({ channelId: zod_1.z.string().regex(/^\d{15,25}$/).nullable(), title: zod_1.z.string().max(256), description: zod_1.z.string().max(2000), color: zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/), groupByCategory: zod_1.z.boolean(), showDescription: zod_1.z.boolean(), autoUpdate: zod_1.z.boolean() });
const order = zod_1.z.object({ ids: zod_1.z.array(zod_1.z.string().uuid()).min(1).max(500) });
let RadioCodesController = class RadioCodesController {
    s;
    constructor(s) {
        this.s = s;
    }
    list(q) { return this.s.list(q.q); }
    discord() { return this.s.discordConfig(); }
    saveDiscord(a, b) { return this.s.saveDiscordConfig(a, b); }
    send(a, b) { return this.s.sendToDiscord(a, b.mode); }
    create(a, b) { return this.s.create(a, b); }
    defaults(a) { return this.s.insertDefaults(a); }
    reorder(a, b) { return this.s.reorder(a, b.ids); }
    update(a, id, b) { return this.s.update(a, id, b); }
    remove(a, id) { return this.s.remove(a, id); }
};
exports.RadioCodesController = RadioCodesController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('radio.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], RadioCodesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('discord'),
    (0, decorators_1.RequirePermission)('radio.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], RadioCodesController.prototype, "discord", null);
__decorate([
    (0, common_1.Put)('discord'),
    (0, decorators_1.RequirePermission)('radio.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(discordCfg))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], RadioCodesController.prototype, "saveDiscord", null);
__decorate([
    (0, common_1.Post)('discord/send'),
    (0, common_1.HttpCode)(202),
    (0, decorators_1.RequirePermission)('radio.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ mode: zod_1.z.enum(['update', 'new']).default('update') })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RadioCodesController.prototype, "send", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('radio.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(create))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], RadioCodesController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('defaults'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('radio.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RadioCodesController.prototype, "defaults", null);
__decorate([
    (0, common_1.Put)('order'),
    (0, decorators_1.RequirePermission)('radio.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(order))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], RadioCodesController.prototype, "reorder", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, decorators_1.RequirePermission)('radio.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(update))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], RadioCodesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('radio.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], RadioCodesController.prototype, "remove", null);
exports.RadioCodesController = RadioCodesController = __decorate([
    (0, swagger_1.ApiTags)('radio-codes'),
    (0, common_1.Controller)('radio-codes'),
    __metadata("design:paramtypes", [radio_codes_service_1.RadioCodesService])
], RadioCodesController);
//# sourceMappingURL=radio-codes.controller.js.map