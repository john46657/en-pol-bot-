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
exports.BotApplicationBansController = exports.ApplicationBansController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const application_bans_service_1 = require("./application-bans.service");
const scope = zod_1.z.string().regex(/^(\*|[a-z0-9_-]{2,24})$/);
const createBody = zod_1.z.object({
    discordId: zod_1.z.string().trim().regex(/^\d{15,25}$/, 'Discord-ID: 15–25 Ziffern').nullish().or(zod_1.z.literal('')),
    roblox: zod_1.z.string().trim().max(32).nullish(), name: zod_1.z.string().trim().max(80).nullish(),
    scopes: zod_1.z.array(scope).min(1).max(20), reason: zod_1.z.string().trim().min(3).max(500), expiresAt: zod_1.z.string().datetime().nullish(),
});
let ApplicationBansController = class ApplicationBansController {
    s;
    constructor(s) {
        this.s = s;
    }
    list(q) { return this.s.list(q.all === 'true'); }
    create(a, b) { return this.s.create(a, { ...b, discordId: b.discordId || null }); }
    lift(a, id) { return this.s.lift(a, id); }
};
exports.ApplicationBansController = ApplicationBansController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('applications.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ all: zod_1.z.enum(['true', 'false']).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ApplicationBansController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('applications.decide'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(createBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], ApplicationBansController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/lift'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('applications.decide'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ApplicationBansController.prototype, "lift", null);
exports.ApplicationBansController = ApplicationBansController = __decorate([
    (0, swagger_1.ApiTags)('applications'),
    (0, common_1.Controller)('application-bans'),
    __metadata("design:paramtypes", [application_bans_service_1.ApplicationBansService])
], ApplicationBansController);
/** Für den Bot: vor dem Start einer Bewerbung prüfen (auch ohne verknüpftes Konto). */
let BotApplicationBansController = class BotApplicationBansController {
    s;
    constructor(s) {
        this.s = s;
    }
    check(q) { return this.s.check(q.discordId, q.scope, q.name ?? 'diese Bewerbung', q.guildId ?? null); }
};
exports.BotApplicationBansController = BotApplicationBansController;
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)('check'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ discordId: zod_1.z.string().regex(/^\d{15,25}$/), scope, name: zod_1.z.string().max(80).optional(), guildId: zod_1.z.string().regex(/^\d{15,25}$/).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BotApplicationBansController.prototype, "check", null);
exports.BotApplicationBansController = BotApplicationBansController = __decorate([
    (0, swagger_1.ApiTags)('bot'),
    (0, common_1.Controller)('bot/application-bans'),
    __metadata("design:paramtypes", [application_bans_service_1.ApplicationBansService])
], BotApplicationBansController);
//# sourceMappingURL=application-bans.controller.js.map