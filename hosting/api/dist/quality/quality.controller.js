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
exports.QualityController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const quality_service_1 = require("./quality.service");
const target = zod_1.z.enum(shared_1.QUALITY_TARGETS);
const exceptionBody = zod_1.z.object({ targetType: target, targetId: zod_1.z.string().uuid(), code: zod_1.z.string().trim().min(3).max(60), reason: zod_1.z.string().trim().min(10, 'Bitte die Ausnahme nachvollziehbar begründen (mind. 10 Zeichen).').max(1000) });
let QualityController = class QualityController {
    s;
    constructor(s) {
        this.s = s;
    }
    config() { return this.s.config(); }
    saveConfig(a, b) { return this.s.saveConfig(a, b); }
    overview(a) { return this.s.overview(a); }
    check(a, t, id) { return this.s.check(a, t, id); }
    addException(a, b) { return this.s.addException(a, b); }
    revoke(a, id, b) { return this.s.revokeException(a, id, b.reason); }
};
exports.QualityController = QualityController;
__decorate([
    (0, common_1.Get)('config'),
    (0, decorators_1.RequirePermission)('quality.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], QualityController.prototype, "config", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, decorators_1.RequirePermission)('quality.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.qualityConfigSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], QualityController.prototype, "saveConfig", null);
__decorate([
    (0, common_1.Get)('overview'),
    (0, decorators_1.RequirePermission)('quality.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], QualityController.prototype, "overview", null);
__decorate([
    (0, common_1.Get)('check/:target/:id'),
    (0, decorators_1.RequirePermission)('quality.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('target', (0, zod_pipe_1.zodBody)(target))),
    __param(2, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], QualityController.prototype, "check", null);
__decorate([
    (0, common_1.Post)('exceptions'),
    (0, decorators_1.RequirePermission)('quality.exception'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(exceptionBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], QualityController.prototype, "addException", null);
__decorate([
    (0, common_1.Delete)('exceptions/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('quality.exception'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ reason: zod_1.z.string().trim().min(3).max(500) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], QualityController.prototype, "revoke", null);
exports.QualityController = QualityController = __decorate([
    (0, swagger_1.ApiTags)('quality'),
    (0, common_1.Controller)('quality'),
    __metadata("design:paramtypes", [quality_service_1.QualityService])
], QualityController);
//# sourceMappingURL=quality.controller.js.map