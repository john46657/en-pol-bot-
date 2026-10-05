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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const admin_service_1 = require("./admin.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const layout = zod_1.z.object({ layout: zod_1.z.array(zod_1.z.unknown()).nullable() });
const evQ = zod_1.z.object({ take: zod_1.z.coerce.number().int().min(1).max(500).default(100), type: zod_1.z.string().max(40).optional() });
let AdminController = class AdminController {
    a;
    constructor(a) {
        this.a = a;
    }
    settings() { return this.a.getSettings(); }
    set(ac, key, b) { return this.a.setSetting(ac, key, b.value); }
    events(q) { return this.a.securityEvents(q.take, q.type); }
    retention(ac) { return this.a.runRetention(ac); }
    getLayout(ac) { return this.a.getLayout(ac.userId); }
    setLayout(ac, b) { return this.a.setLayout(ac, b.layout); }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)('settings'),
    (0, decorators_1.RequirePermission)('settings.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "settings", null);
__decorate([
    (0, common_1.Put)('settings/:key'),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('key')),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ value: zod_1.z.unknown() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "set", null);
__decorate([
    (0, common_1.Get)('security-events'),
    (0, decorators_1.RequirePermission)('audit.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(evQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "events", null);
__decorate([
    (0, common_1.Post)('retention/run'),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "retention", null);
__decorate([
    (0, common_1.Get)('dashboard/layout'),
    (0, decorators_1.RequirePermission)('dashboard.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getLayout", null);
__decorate([
    (0, common_1.Put)('dashboard/layout'),
    (0, decorators_1.RequirePermission)('dashboard.customize'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(layout))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "setLayout", null);
exports.AdminController = AdminController = __decorate([
    (0, swagger_1.ApiTags)('admin'),
    (0, common_1.Controller)('admin'),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map