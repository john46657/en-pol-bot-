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
exports.BotServerController = exports.ModulesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const guild_context_1 = require("../common/guild-context");
const modules_service_1 = require("./modules.service");
const moduleKey = zod_1.z.string().refine((k) => shared_1.MODULE_KEYS.includes(k), 'Unbekanntes Modul.');
const patchModule = zod_1.z.object({ enabled: zod_1.z.boolean(), version: zod_1.z.number().int().min(0) }).strict();
/** Administration → Module. */
let ModulesController = class ModulesController {
    s;
    constructor(s) {
        this.s = s;
    }
    list() { return this.s.list(); }
    set(a, key, b) { return this.s.set(a, key, b.enabled, b.version); }
};
exports.ModulesController = ModulesController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('modules.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ModulesController.prototype, "list", null);
__decorate([
    (0, common_1.Patch)(':moduleKey'),
    (0, decorators_1.RequirePermission)('modules.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('moduleKey', (0, zod_pipe_1.zodBody)(moduleKey))),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(patchModule))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ModulesController.prototype, "set", null);
exports.ModulesController = ModulesController = __decorate([
    (0, swagger_1.ApiTags)('modules'),
    (0, common_1.Controller)('modules'),
    __metadata("design:paramtypes", [modules_service_1.ModulesService])
], ModulesController);
/** Für den Bot: Discord-Server dieses Systems und abgeschaltete Module (danach registriert er die Befehle). Nur per Bot-Token. */
let BotServerController = class BotServerController {
    s;
    constructor(s) {
        this.s = s;
    }
    async get() { return { guildId: (0, guild_context_1.homeGuild)(), disabled: [...(await this.s.disabled())] }; }
};
exports.BotServerController = BotServerController;
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BotServerController.prototype, "get", null);
exports.BotServerController = BotServerController = __decorate([
    (0, swagger_1.ApiTags)('bot'),
    (0, common_1.Controller)('bot/server'),
    __metadata("design:paramtypes", [modules_service_1.ModulesService])
], BotServerController);
//# sourceMappingURL=modules.controller.js.map