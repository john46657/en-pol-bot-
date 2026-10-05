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
exports.WantedController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const wanted_service_1 = require("./wanted.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const pagination_1 = require("../common/pagination");
const create = zod_1.z.object({ personId: zod_1.z.string().uuid().optional(), vehicleId: zod_1.z.string().uuid().optional(), reason: zod_1.z.string().trim().min(3).max(500), description: zod_1.z.string().max(5000).optional(), priority: zod_1.z.enum(shared_1.PRIORITIES).optional(), expiresAt: zod_1.z.coerce.date().optional() });
const reason = zod_1.z.object({ reason: zod_1.z.string().trim().min(3).max(500) });
const listQ = pagination_1.pageQuery.extend({ status: zod_1.z.enum(shared_1.WANTED_STATUSES).optional() });
let WantedController = class WantedController {
    w;
    constructor(w) {
        this.w = w;
    }
    list(q) { return this.w.list(q, q.status); }
    get(id) { return this.w.get(id); }
    create(a, b) { return this.w.create(a, b); }
    activate(a, id, b) { return this.w.setStatus(a, id, 'ACTIVE', b.reason); }
    clear(a, id, b) { return this.w.setStatus(a, id, 'CLEARED', b.reason); }
    cancel(a, id, b) { return this.w.setStatus(a, id, 'CANCELLED', b.reason); }
    archive(a, id, b) { return this.w.setStatus(a, id, 'ARCHIVED', b.reason); }
};
exports.WantedController = WantedController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('wanted.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], WantedController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('wanted.view'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WantedController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('wanted.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(create))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], WantedController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/activate'),
    (0, decorators_1.RequirePermission)('wanted.activate'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(reason))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], WantedController.prototype, "activate", null);
__decorate([
    (0, common_1.Post)(':id/clear'),
    (0, decorators_1.RequirePermission)('wanted.clear'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(reason))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], WantedController.prototype, "clear", null);
__decorate([
    (0, common_1.Post)(':id/cancel'),
    (0, decorators_1.RequirePermission)('wanted.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(reason))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], WantedController.prototype, "cancel", null);
__decorate([
    (0, common_1.Post)(':id/archive'),
    (0, decorators_1.RequirePermission)('wanted.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(reason))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], WantedController.prototype, "archive", null);
exports.WantedController = WantedController = __decorate([
    (0, swagger_1.ApiTags)('wanted'),
    (0, common_1.Controller)('wanted'),
    __metadata("design:paramtypes", [wanted_service_1.WantedService])
], WantedController);
//# sourceMappingURL=wanted.controller.js.map