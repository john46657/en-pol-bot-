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
exports.DispatchController = exports.IncidentsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const dispatch_service_1 = require("./dispatch.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const pagination_1 = require("../common/pagination");
const prio = zod_1.z.enum(shared_1.PRIORITIES);
const create = zod_1.z.object({ title: zod_1.z.string().trim().min(3).max(200), description: zod_1.z.string().max(5000).optional(), priority: prio.optional(), location: zod_1.z.string().max(200).optional(), personIds: zod_1.z.array(zod_1.z.string().uuid()).max(50).optional(), vehicleIds: zod_1.z.array(zod_1.z.string().uuid()).max(50).optional() });
const update = zod_1.z.object({ version: zod_1.z.number().int(), title: zod_1.z.string().trim().min(3).max(200).optional(), description: zod_1.z.string().max(5000).optional(), priority: prio.optional(), location: zod_1.z.string().max(200).optional(), supervisorId: zod_1.z.string().uuid().nullable().optional() });
const status = zod_1.z.object({ status: zod_1.z.enum(shared_1.DISPATCH_STATUSES).refine((s) => s !== 'CLOSED', 'Use POST /dispatch/incidents/:id/close (requires dispatch.close).'), note: zod_1.z.string().max(500).optional() });
const listQ = pagination_1.pageQuery.extend({ status: zod_1.z.enum(shared_1.DISPATCH_STATUSES).optional(), active: zod_1.z.coerce.boolean().optional() });
const attach = zod_1.z.object({ personIds: zod_1.z.array(zod_1.z.string().uuid()).optional(), vehicleIds: zod_1.z.array(zod_1.z.string().uuid()).optional() });
const unit = zod_1.z.object({ callsign: zod_1.z.string().trim().min(2).max(16), vehicle: zod_1.z.string().max(64).optional(), notes: zod_1.z.string().max(1000).optional(), memberIds: zod_1.z.array(zod_1.z.string().uuid()).optional() });
let IncidentsController = class IncidentsController {
    d;
    constructor(d) {
        this.d = d;
    }
    list(q) { return this.d.list(q, q.status, q.active); }
    get(id) { return this.d.get(id); }
    create(a, b) { return this.d.create(a, b); }
    update(a, id, b) { const { version, ...r } = b; return this.d.update(a, id, version, r); }
    attach(a, id, b) { return this.d.attachRecords(a, id, b); }
};
exports.IncidentsController = IncidentsController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('incidents.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], IncidentsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('incidents.view'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], IncidentsController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('incidents.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(create))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], IncidentsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, decorators_1.RequirePermission)('incidents.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(update))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], IncidentsController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/attach'),
    (0, decorators_1.RequirePermission)('incidents.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(attach))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], IncidentsController.prototype, "attach", null);
exports.IncidentsController = IncidentsController = __decorate([
    (0, swagger_1.ApiTags)('incidents'),
    (0, common_1.Controller)('incidents'),
    __metadata("design:paramtypes", [dispatch_service_1.DispatchService])
], IncidentsController);
let DispatchController = class DispatchController {
    d;
    constructor(d) {
        this.d = d;
    }
    units() { return this.d.listUnits(); }
    createUnit(a, b) { return this.d.createUnit(a, b); }
    unitStatus(a, id, b) { return this.d.setUnitStatus(a, id, b.status); }
    members(a, id, b) { return this.d.setUnitMembers(a, id, b.userIds); }
    assign(a, id, b) { return this.d.assignUnit(a, id, b.unitId); }
    setStatus(a, id, b) { return this.d.setStatus(a, id, b.status, b.note); }
    close(a, id) { return this.d.setStatus(a, id, 'CLOSED'); }
};
exports.DispatchController = DispatchController;
__decorate([
    (0, common_1.Get)('units'),
    (0, decorators_1.RequirePermission)('dispatch.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], DispatchController.prototype, "units", null);
__decorate([
    (0, common_1.Post)('units'),
    (0, decorators_1.RequirePermission)('dispatch.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(unit))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], DispatchController.prototype, "createUnit", null);
__decorate([
    (0, common_1.Put)('units/:id/status'),
    (0, decorators_1.RequirePermission)('dispatch.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ status: zod_1.z.enum(shared_1.UNIT_STATUSES) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], DispatchController.prototype, "unitStatus", null);
__decorate([
    (0, common_1.Put)('units/:id/members'),
    (0, decorators_1.RequirePermission)('dispatch.assign'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ userIds: zod_1.z.array(zod_1.z.string().uuid()).max(20) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], DispatchController.prototype, "members", null);
__decorate([
    (0, common_1.Post)('incidents/:id/assign'),
    (0, decorators_1.RequirePermission)('dispatch.assign'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ unitId: zod_1.z.string().uuid() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], DispatchController.prototype, "assign", null);
__decorate([
    (0, common_1.Put)('incidents/:id/status'),
    (0, decorators_1.RequirePermission)('dispatch.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(status))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], DispatchController.prototype, "setStatus", null);
__decorate([
    (0, common_1.Post)('incidents/:id/close'),
    (0, decorators_1.RequirePermission)('dispatch.close'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DispatchController.prototype, "close", null);
exports.DispatchController = DispatchController = __decorate([
    (0, swagger_1.ApiTags)('dispatch'),
    (0, common_1.Controller)('dispatch'),
    __metadata("design:paramtypes", [dispatch_service_1.DispatchService])
], DispatchController);
//# sourceMappingURL=dispatch.controller.js.map