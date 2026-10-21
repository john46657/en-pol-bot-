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
exports.SituationController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const situation_service_1 = require("./situation.service");
let SituationController = class SituationController {
    s;
    constructor(s) {
        this.s = s;
    }
    overview(a) { return this.s.overview(a); }
    reports() { return this.s.listReports(); }
    report(id) { return this.s.getReport(id); }
    create(a, b) { return this.s.createReport(a, b.note ?? null); }
};
exports.SituationController = SituationController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('situation.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SituationController.prototype, "overview", null);
__decorate([
    (0, common_1.Get)('reports'),
    (0, decorators_1.RequirePermission)('situation.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SituationController.prototype, "reports", null);
__decorate([
    (0, common_1.Get)('reports/:id'),
    (0, decorators_1.RequirePermission)('situation.view'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SituationController.prototype, "report", null);
__decorate([
    (0, common_1.Post)('reports'),
    (0, decorators_1.RequirePermission)('situation.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ note: zod_1.z.string().trim().max(2000).nullish() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], SituationController.prototype, "create", null);
exports.SituationController = SituationController = __decorate([
    (0, swagger_1.ApiTags)('situation'),
    (0, common_1.Controller)('situation'),
    __metadata("design:paramtypes", [situation_service_1.SituationService])
], SituationController);
//# sourceMappingURL=situation.controller.js.map