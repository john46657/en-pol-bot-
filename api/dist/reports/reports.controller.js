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
exports.ReportsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const reports_service_1 = require("./reports.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const pagination_1 = require("../common/pagination");
const content = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown());
const create = zod_1.z.object({ type: zod_1.z.enum(shared_1.REPORT_TYPES), title: zod_1.z.string().trim().min(3).max(200), content, incidentId: zod_1.z.string().uuid().optional(), personIds: zod_1.z.array(zod_1.z.string().uuid()).max(50).optional() });
const edit = zod_1.z.object({ version: zod_1.z.number().int(), title: zod_1.z.string().trim().min(3).max(200).optional(), content, changeSummary: zod_1.z.string().trim().min(3).max(300) });
const reason = zod_1.z.object({ reason: zod_1.z.string().trim().min(3).max(1000).optional() });
const listQ = pagination_1.pageQuery.extend({ status: zod_1.z.enum(shared_1.REPORT_STATUSES).optional() });
let ReportsController = class ReportsController {
    r;
    constructor(r) {
        this.r = r;
    }
    list(a, q) { return this.r.list(a, q, q.status); }
    get(a, id) { return this.r.get(a, id); }
    create(a, b) { return this.r.create(a, b); }
    edit(a, id, b) { return this.r.edit(a, id, b); }
    submit(a, id) { return this.r.transition(a, id, 'SUBMITTED'); }
    review(a, id) { return this.r.transition(a, id, 'UNDER_REVIEW'); }
    approve(a, id) { return this.r.transition(a, id, 'APPROVED'); }
    reject(a, id, b) { return this.r.transition(a, id, 'REJECTED', b.reason); }
    archive(a, id) { return this.r.transition(a, id, 'ARCHIVED'); }
};
exports.ReportsController = ReportsController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('reports.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('reports.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('reports.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(create))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, decorators_1.RequirePermission)('reports.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(edit))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "edit", null);
__decorate([
    (0, common_1.Post)(':id/submit'),
    (0, decorators_1.RequirePermission)('reports.submit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "submit", null);
__decorate([
    (0, common_1.Post)(':id/start-review'),
    (0, decorators_1.RequirePermission)('reports.review'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "review", null);
__decorate([
    (0, common_1.Post)(':id/approve'),
    (0, decorators_1.RequirePermission)('reports.approve'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)(':id/reject'),
    (0, decorators_1.RequirePermission)('reports.reject'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(reason))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "reject", null);
__decorate([
    (0, common_1.Post)(':id/archive'),
    (0, decorators_1.RequirePermission)('reports.archive'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "archive", null);
exports.ReportsController = ReportsController = __decorate([
    (0, swagger_1.ApiTags)('reports'),
    (0, common_1.Controller)('reports'),
    __metadata("design:paramtypes", [reports_service_1.ReportsService])
], ReportsController);
//# sourceMappingURL=reports.controller.js.map