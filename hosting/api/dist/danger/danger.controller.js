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
exports.DangerController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const danger_service_1 = require("./danger.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const panelBody = zod_1.z.object({ channelId: zod_1.z.string().regex(/^\d{15,25}$/, 'Discord-Kanal-ID') });
const body = zod_1.z.object({ level: zod_1.z.string().trim().min(1).max(40), reason: zod_1.z.string().trim().max(200).optional() });
let DangerController = class DangerController {
    d;
    constructor(d) {
        this.d = d;
    }
    get() { return this.d.get(); }
    set(a, b, r) {
        // aus Discord (Bot im Namen eines Benutzers): Rollen des Klickenden für stufenbezogene Freigaben
        const fromDiscord = typeof r.headers.authorization === 'string' && r.headers.authorization.startsWith('Bot ') && typeof r.headers['x-discord-user'] === 'string';
        const roles = fromDiscord ? (typeof r.headers['x-discord-roles'] === 'string' ? r.headers['x-discord-roles'].split(',').filter((x) => /^\d{15,25}$/.test(x)).slice(0, 100) : []) : null;
        return this.d.set(a, b.level, b.reason, roles);
    }
    /** Stufen, Texte, Farben, Buttons und Pings (Dashboard). */
    config() { return this.d.config(); }
    /** Button-Panel (Status per Klick) in einen Discord-Kanal senden. */
    panel() { return this.d.panel(); }
    sendPanel(a, b) { return this.d.sendPanel(a, b.channelId); }
    saveConfig(a, b) { return this.d.saveConfig(a, b); }
};
exports.DangerController = DangerController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('dashboard.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], DangerController.prototype, "get", null);
__decorate([
    (0, common_1.Put)(),
    (0, decorators_1.RequirePermission)('dispatch.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(body))),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0, Object]),
    __metadata("design:returntype", void 0)
], DangerController.prototype, "set", null);
__decorate([
    (0, common_1.Get)('config'),
    (0, decorators_1.RequirePermission)('dashboard.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], DangerController.prototype, "config", null);
__decorate([
    (0, common_1.Get)('panel'),
    (0, decorators_1.RequirePermission)('dashboard.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], DangerController.prototype, "panel", null);
__decorate([
    (0, common_1.Post)('panel'),
    (0, common_1.HttpCode)(202),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(panelBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], DangerController.prototype, "sendPanel", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(danger_service_1.dangerConfigSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], DangerController.prototype, "saveConfig", null);
exports.DangerController = DangerController = __decorate([
    (0, swagger_1.ApiTags)('danger'),
    (0, common_1.Controller)('danger-level'),
    __metadata("design:paramtypes", [danger_service_1.DangerService])
], DangerController);
//# sourceMappingURL=danger.controller.js.map