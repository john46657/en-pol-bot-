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
exports.PersonnelController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const personnel_service_1 = require("./personnel.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const pagination_1 = require("../common/pagination");
const create = zod_1.z.object({ userId: zod_1.z.string().uuid(), rank: zod_1.z.string().max(64).optional(), team: zod_1.z.string().max(64).optional(), callsign: zod_1.z.string().trim().min(2).max(16).optional(), qualifications: zod_1.z.array(zod_1.z.string().max(64)).max(50).optional() });
const update = zod_1.z.object({ team: zod_1.z.string().max(64).optional(), callsign: zod_1.z.string().trim().min(2).max(16).optional(), employmentStatus: zod_1.z.enum(['ACTIVE', 'LOA', 'SUSPENDED', 'RESIGNED', 'TERMINATED']).optional(), qualifications: zod_1.z.array(zod_1.z.string().max(64)).max(50).optional() });
const promote = zod_1.z.object({ rank: zod_1.z.string().trim().min(2).max(64), reason: zod_1.z.string().trim().min(3).max(1000) });
const record = zod_1.z.object({ type: zod_1.z.enum(['AWARD', 'DISCIPLINE', 'NOTE']), summary: zod_1.z.string().trim().min(3).max(300), details: zod_1.z.string().max(5000).optional() });
let PersonnelController = class PersonnelController {
    p;
    constructor(p) {
        this.p = p;
    }
    list(q) { return this.p.list(q); }
    get(a, id) { return this.p.get(a, id); }
    create(a, b) { return this.p.create(a, b); }
    update(a, id, b) { return this.p.update(a, id, b); }
    promote(a, id, b) { return this.p.promote(a, id, b.rank, b.reason); }
    record(a, id, b) { return this.p.addRecord(a, id, b); }
};
exports.PersonnelController = PersonnelController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('personnel.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(pagination_1.pageQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], PersonnelController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('personnel.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PersonnelController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('personnel.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(create))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], PersonnelController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, decorators_1.RequirePermission)('personnel.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(update))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], PersonnelController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/promote'),
    (0, decorators_1.RequirePermission)('personnel.promote'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(promote))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], PersonnelController.prototype, "promote", null);
__decorate([
    (0, common_1.Post)(':id/records'),
    (0, decorators_1.RequirePermission)('personnel.discipline'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(record))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], PersonnelController.prototype, "record", null);
exports.PersonnelController = PersonnelController = __decorate([
    (0, swagger_1.ApiTags)('personnel'),
    (0, common_1.Controller)('personnel'),
    __metadata("design:paramtypes", [personnel_service_1.PersonnelService])
], PersonnelController);
//# sourceMappingURL=personnel.controller.js.map