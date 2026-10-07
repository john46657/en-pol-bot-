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
exports.InvestigationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const investigations_service_1 = require("./investigations.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const pagination_1 = require("../common/pagination");
const role = zod_1.z.enum(investigations_service_1.INVESTIGATION_ROLES);
const create = zod_1.z.object({ title: zod_1.z.string().trim().min(3).max(200), description: zod_1.z.string().max(10000).optional(), leadId: zod_1.z.string().uuid().optional(), persons: zod_1.z.array(zod_1.z.object({ personId: zod_1.z.string().uuid(), role })).max(100).optional() });
const addPerson = zod_1.z.object({ personId: zod_1.z.string().uuid(), role });
const status = zod_1.z.object({ status: zod_1.z.enum(shared_1.INVESTIGATION_STATUSES).refine((s) => s !== 'CLOSED', 'Abschließen bitte über die Abschließen-Aktion.'), reason: zod_1.z.string().max(500).optional() });
const listQ = pagination_1.pageQuery.extend({ status: zod_1.z.enum(shared_1.INVESTIGATION_STATUSES).optional() });
let InvestigationsController = class InvestigationsController {
    i;
    constructor(i) {
        this.i = i;
    }
    list(q) { return this.i.list(q, q.status); }
    get(id) { return this.i.get(id); }
    create(a, b) { return this.i.create(a, b); }
    addPerson(a, id, b) { return this.i.addPerson(a, id, b.personId, b.role); }
    setStatus(a, id, b) { return this.i.setStatus(a, id, b.status, b.reason); }
    close(a, id, b) { return this.i.setStatus(a, id, 'CLOSED', b.reason); }
};
exports.InvestigationsController = InvestigationsController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('investigations.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], InvestigationsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('investigations.view'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], InvestigationsController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('investigations.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(create))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], InvestigationsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/persons'),
    (0, decorators_1.RequirePermission)('investigations.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(addPerson))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], InvestigationsController.prototype, "addPerson", null);
__decorate([
    (0, common_1.Put)(':id/status'),
    (0, decorators_1.RequirePermission)('investigations.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(status))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], InvestigationsController.prototype, "setStatus", null);
__decorate([
    (0, common_1.Post)(':id/close'),
    (0, decorators_1.RequirePermission)('investigations.close'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ reason: zod_1.z.string().trim().min(3).max(500) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], InvestigationsController.prototype, "close", null);
exports.InvestigationsController = InvestigationsController = __decorate([
    (0, swagger_1.ApiTags)('investigations'),
    (0, common_1.Controller)('investigations'),
    __metadata("design:paramtypes", [investigations_service_1.InvestigationsService])
], InvestigationsController);
//# sourceMappingURL=investigations.controller.js.map