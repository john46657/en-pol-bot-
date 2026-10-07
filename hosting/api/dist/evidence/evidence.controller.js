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
exports.EvidenceController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const evidence_service_1 = require("./evidence.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const pagination_1 = require("../common/pagination");
const create = zod_1.z.object({ type: zod_1.z.string().trim().min(2).max(64), description: zod_1.z.string().trim().min(3).max(5000), source: zod_1.z.string().max(200).optional(), caseRef: zod_1.z.string().max(40).optional(), storageLocation: zod_1.z.string().max(200).optional(), personIds: zod_1.z.array(zod_1.z.string().uuid()).max(50).optional() });
const transfer = zod_1.z.object({ to: zod_1.z.enum(shared_1.EVIDENCE_CUSTODY_STATES).refine((s) => s !== 'RELEASED', 'Freigeben bitte über die Freigabe-Aktion.'), toUserId: zod_1.z.string().uuid().optional(), reason: zod_1.z.string().trim().min(3).max(500), storageLocation: zod_1.z.string().max(200).optional() });
let EvidenceController = class EvidenceController {
    e;
    constructor(e) {
        this.e = e;
    }
    list(q) { return this.e.list(q); }
    get(id) { return this.e.get(id); }
    create(a, b) { return this.e.create(a, b); }
    transfer(a, id, b) { return this.e.transfer(a, id, b); }
    release(a, id, b) { return this.e.transfer(a, id, { to: 'RELEASED', reason: b.reason }); }
    confirm(a, id) { return this.e.confirm(a, id); }
};
exports.EvidenceController = EvidenceController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('evidence.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(pagination_1.pageQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], EvidenceController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('evidence.view'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EvidenceController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('evidence.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(create))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], EvidenceController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/transfer'),
    (0, decorators_1.RequirePermission)('evidence.transfer'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(transfer))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], EvidenceController.prototype, "transfer", null);
__decorate([
    (0, common_1.Post)(':id/release'),
    (0, decorators_1.RequirePermission)('evidence.release'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ reason: zod_1.z.string().trim().min(3).max(500) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], EvidenceController.prototype, "release", null);
__decorate([
    (0, common_1.Post)(':id/confirm'),
    (0, decorators_1.RequirePermission)('evidence.transfer'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], EvidenceController.prototype, "confirm", null);
exports.EvidenceController = EvidenceController = __decorate([
    (0, swagger_1.ApiTags)('evidence'),
    (0, common_1.Controller)('evidence'),
    __metadata("design:paramtypes", [evidence_service_1.EvidenceService])
], EvidenceController);
//# sourceMappingURL=evidence.controller.js.map