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
exports.GalaxyController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const galaxy_service_1 = require("./galaxy.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const summarize = zod_1.z.object({ kind: zod_1.z.enum(['incident', 'report', 'complaint', 'investigation']), id: zod_1.z.string().uuid() });
const draft = zod_1.z.object({ notes: zod_1.z.string().trim().min(10).max(4000) });
let GalaxyController = class GalaxyController {
    g;
    constructor(g) {
        this.g = g;
    }
    status() { return this.g.status(); }
    summarize(a, b) { return this.g.summarize(a, b.kind, b.id); }
    draft(a, b) { return this.g.draftReport(a, b.notes); }
    shift(a) { return this.g.shiftSummary(a); }
    proposals(a) { return this.g.listProposals(a); }
    confirm(a, id) { return this.g.confirm(a, id); }
    reject(a, id) { return this.g.reject(a, id); }
};
exports.GalaxyController = GalaxyController;
__decorate([
    (0, common_1.Get)('status'),
    (0, decorators_1.RequirePermission)('galaxy.use'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], GalaxyController.prototype, "status", null);
__decorate([
    (0, common_1.Post)('summarize'),
    (0, decorators_1.RequirePermission)('galaxy.use'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(summarize))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], GalaxyController.prototype, "summarize", null);
__decorate([
    (0, common_1.Post)('draft-report'),
    (0, decorators_1.RequirePermission)('galaxy.use'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(draft))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], GalaxyController.prototype, "draft", null);
__decorate([
    (0, common_1.Post)('shift-summary'),
    (0, decorators_1.RequirePermission)('galaxy.use'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], GalaxyController.prototype, "shift", null);
__decorate([
    (0, common_1.Get)('proposals'),
    (0, decorators_1.RequirePermission)('galaxy.use'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], GalaxyController.prototype, "proposals", null);
__decorate([
    (0, common_1.Post)('proposals/:id/confirm'),
    (0, decorators_1.RequirePermission)('galaxy.use'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], GalaxyController.prototype, "confirm", null);
__decorate([
    (0, common_1.Post)('proposals/:id/reject'),
    (0, decorators_1.RequirePermission)('galaxy.use'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], GalaxyController.prototype, "reject", null);
exports.GalaxyController = GalaxyController = __decorate([
    (0, swagger_1.ApiTags)('galaxy'),
    (0, common_1.Controller)('galaxy'),
    __metadata("design:paramtypes", [galaxy_service_1.GalaxyService])
], GalaxyController);
//# sourceMappingURL=galaxy.controller.js.map