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
exports.SystemStatusController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const decorators_1 = require("../authz/decorators");
const permission_service_1 = require("../authz/permission.service");
const guild_context_1 = require("../common/guild-context");
const zod_pipe_1 = require("../common/zod.pipe");
const system_status_service_1 = require("./system-status.service");
const q = zod_1.z.object({ deep: zod_1.z.enum(['0', '1']).optional() });
/**
 * Systemstatus für Dashboard, MDT und Leitstelle (`settings.view`). Die Diagnose (`deep=1`: Konfiguration, Speicher,
 * Administratorzugang) nur für globale Systemadministratoren – für alle anderen wird sie still weggelassen.
 */
let SystemStatusController = class SystemStatusController {
    s;
    perms;
    constructor(s, perms) {
        this.s = s;
        this.perms = perms;
    }
    async status(a, query) {
        const owner = !!a.userId && (await this.perms.isOwner(a.userId));
        const res = await this.s.status({ guildId: (0, guild_context_1.currentGuild)(), deep: query.deep === '1' && owner });
        return { ...res, canDiagnose: owner };
    }
};
exports.SystemStatusController = SystemStatusController;
__decorate([
    (0, common_1.Get)('status'),
    (0, decorators_1.RequirePermission)('settings.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(q))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", Promise)
], SystemStatusController.prototype, "status", null);
exports.SystemStatusController = SystemStatusController = __decorate([
    (0, swagger_1.ApiTags)('system'),
    (0, common_1.Controller)('system'),
    __metadata("design:paramtypes", [system_status_service_1.SystemStatusService, permission_service_1.PermissionService])
], SystemStatusController);
//# sourceMappingURL=system-status.controller.js.map