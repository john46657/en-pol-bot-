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
exports.CasesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const cases_service_1 = require("./cases.service");
const linkType = zod_1.z.enum(shared_1.CASE_LINK_TYPES);
const link = zod_1.z.object({ entityType: linkType, entityId: zod_1.z.string().uuid(), role: zod_1.z.string().trim().max(40).nullish(), note: zod_1.z.string().trim().max(500).nullish() });
const listQ = zod_1.z.object({
    q: zod_1.z.string().trim().max(80).optional(), status: zod_1.z.enum(shared_1.CASE_STATUSES).optional(), from: zod_1.z.string().date().optional(), to: zod_1.z.string().date().optional(),
    incidentNumber: zod_1.z.string().trim().max(40).optional(), entityType: linkType.optional(), entityId: zod_1.z.string().uuid().optional(),
    page: zod_1.z.coerce.number().int().min(1).optional(), pageSize: zod_1.z.coerce.number().int().min(1).max(200).optional(),
});
const createB = zod_1.z.object({ title: zod_1.z.string().trim().min(3).max(200), description: zod_1.z.string().trim().max(4000).nullish(), links: zod_1.z.array(link).max(50).optional() });
const updateB = zod_1.z.object({ version: zod_1.z.number().int(), title: zod_1.z.string().trim().min(3).max(200).optional(), description: zod_1.z.string().trim().max(4000).nullable().optional(), status: zod_1.z.enum(shared_1.CASE_STATUSES).optional(), reason: zod_1.z.string().trim().max(500).optional() });
const decideB = zod_1.z.object({ keepId: zod_1.z.string().uuid(), otherId: zod_1.z.string().uuid(), decision: zod_1.z.enum(['NOT_DUPLICATE', 'MERGE']), note: zod_1.z.string().trim().max(500).optional() });
let CasesController = class CasesController {
    s;
    constructor(s) {
        this.s = s;
    }
    list(a, q) { return this.s.list(a, q); }
    duplicates() { return this.s.duplicates(); }
    decide(a, b) { return this.s.decideDuplicate(a, b); }
    forEntity(type, id) { return this.s.forEntity(type, id); }
    get(a, id) { return this.s.get(a, id); }
    create(a, b) { return this.s.create(a, b); }
    update(a, id, b) { return this.s.update(a, id, b); }
    addLink(a, id, b) { return this.s.addLink(a, id, b); }
    removeLink(a, id, linkId, b) { return this.s.removeLink(a, id, linkId, b.reason); }
};
exports.CasesController = CasesController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('cases.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], CasesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('duplicates'),
    (0, decorators_1.RequirePermission)('cases.manage'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CasesController.prototype, "duplicates", null);
__decorate([
    (0, common_1.Post)('duplicates/decide'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('cases.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(decideB))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], CasesController.prototype, "decide", null);
__decorate([
    (0, common_1.Get)('for/:type/:id'),
    (0, decorators_1.RequirePermission)('cases.view'),
    __param(0, (0, common_1.Param)('type', (0, zod_pipe_1.zodBody)(linkType))),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0, String]),
    __metadata("design:returntype", void 0)
], CasesController.prototype, "forEntity", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('cases.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CasesController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('cases.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(createB))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], CasesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, decorators_1.RequirePermission)('cases.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(updateB))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], CasesController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/links'),
    (0, decorators_1.RequirePermission)('cases.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(link))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], CasesController.prototype, "addLink", null);
__decorate([
    (0, common_1.Delete)(':id/links/:linkId'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('cases.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('linkId', common_1.ParseUUIDPipe)),
    __param(3, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ reason: zod_1.z.string().trim().min(3, 'Bitte begründen, warum die Verknüpfung gelöst wird.').max(500) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], CasesController.prototype, "removeLink", null);
exports.CasesController = CasesController = __decorate([
    (0, swagger_1.ApiTags)('cases'),
    (0, common_1.Controller)('cases'),
    __metadata("design:paramtypes", [cases_service_1.CasesService])
], CasesController);
//# sourceMappingURL=cases.controller.js.map