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
exports.ComplaintsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const complaints_service_1 = require("./complaints.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const pagination_1 = require("../common/pagination");
const create = zod_1.z.object({ complainantId: zod_1.z.string().uuid().optional(), subjectId: zod_1.z.string().uuid().optional(), officerId: zod_1.z.string().uuid().optional(), category: zod_1.z.string().trim().min(2).max(64), description: zod_1.z.string().trim().min(10).max(10000) });
const assign = zod_1.z.object({ investigatorId: zod_1.z.string().uuid() });
const note = zod_1.z.object({ findings: zod_1.z.string().max(10000).optional(), internalNotes: zod_1.z.string().max(10000).optional() });
const resolve = zod_1.z.object({ resolution: zod_1.z.string().trim().min(3).max(5000), findings: zod_1.z.string().max(10000).optional() });
const listQ = pagination_1.pageQuery.extend({ status: zod_1.z.enum(shared_1.COMPLAINT_STATUSES).optional() });
let ComplaintsController = class ComplaintsController {
    c;
    constructor(c) {
        this.c = c;
    }
    list(a, q) { return this.c.list(a, q, q.status); }
    get(a, id) { return this.c.get(a, id); }
    create(a, b) { return this.c.create(a, b); }
    screen(a, id) { return this.c.transition(a, id, 'SCREENING'); }
    assign(a, id, b) { return this.c.transition(a, id, 'ASSIGNED', b); }
    investigate(a, id, b) { return this.c.transition(a, id, 'INVESTIGATION', b); }
    review(a, id, b) { return this.c.transition(a, id, 'REVIEW', b); }
    resolve(a, id, b) { return this.c.transition(a, id, 'RESOLVED', b); }
    close(a, id) { return this.c.transition(a, id, 'CLOSED'); }
};
exports.ComplaintsController = ComplaintsController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('complaints.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], ComplaintsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('complaints.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ComplaintsController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('complaints.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(create))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], ComplaintsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/screen'),
    (0, decorators_1.RequirePermission)('complaints.assign'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ComplaintsController.prototype, "screen", null);
__decorate([
    (0, common_1.Post)(':id/assign'),
    (0, decorators_1.RequirePermission)('complaints.assign'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(assign))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ComplaintsController.prototype, "assign", null);
__decorate([
    (0, common_1.Post)(':id/investigate'),
    (0, decorators_1.RequirePermission)('complaints.investigate'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(note))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ComplaintsController.prototype, "investigate", null);
__decorate([
    (0, common_1.Post)(':id/review'),
    (0, decorators_1.RequirePermission)('complaints.investigate'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(note))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ComplaintsController.prototype, "review", null);
__decorate([
    (0, common_1.Post)(':id/resolve'),
    (0, decorators_1.RequirePermission)('complaints.resolve'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(resolve))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ComplaintsController.prototype, "resolve", null);
__decorate([
    (0, common_1.Post)(':id/close'),
    (0, decorators_1.RequirePermission)('complaints.close'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ComplaintsController.prototype, "close", null);
exports.ComplaintsController = ComplaintsController = __decorate([
    (0, swagger_1.ApiTags)('complaints'),
    (0, common_1.Controller)('complaints'),
    __metadata("design:paramtypes", [complaints_service_1.ComplaintsService])
], ComplaintsController);
//# sourceMappingURL=complaints.controller.js.map