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
exports.DutyReportsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const duty_reports_service_1 = require("./duty-reports.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const guild_context_1 = require("../common/guild-context");
const errors_1 = require("../common/errors");
const values = zod_1.z.record(zod_1.z.string().max(40), zod_1.z.union([zod_1.z.string().max(4000), zod_1.z.number()]));
const create = zod_1.z.object({ templateId: zod_1.z.string().uuid(), periodStart: zod_1.z.string().date().optional(), values, guildId: zod_1.z.string().regex(/^\d{15,25}$/).nullable().optional(), source: zod_1.z.enum(['WEB', 'DISCORD']).optional() });
const edit = zod_1.z.object({ values, version: zod_1.z.number().int().optional() });
const listQ = zod_1.z.object({ templateId: zod_1.z.string().uuid().optional(), authorId: zod_1.z.string().uuid().optional(), from: zod_1.z.string().date().optional(), to: zod_1.z.string().date().optional(), q: zod_1.z.string().max(80).optional(), status: zod_1.z.enum(['SUBMITTED', 'REVIEWED']).optional(), mine: zod_1.z.coerce.boolean().optional(), page: zod_1.z.coerce.number().int().min(1).default(1), pageSize: zod_1.z.coerce.number().int().min(1).max(200).default(50) });
/** 🗓️ Tages-/Wochenberichte (auch vom Discord-Bot im Namen des verknüpften Benutzers benutzt). */
let DutyReportsController = class DutyReportsController {
    s;
    constructor(s) {
        this.s = s;
    }
    templates(active) { return this.s.listTemplates((0, guild_context_1.currentGuild)(), active === '1'); }
    saveTemplate(a, id, b) { if (b.id !== id)
        throw new errors_1.AppError('VALIDATION_FAILED', 'ID passt nicht.'); return this.s.saveTemplate(a, b); }
    dup(a, id) { return this.s.duplicateTemplate(a, id); }
    removeTemplate(a, id) { return this.s.removeTemplate(a, id); }
    list(a, q) { return this.s.list(a, q, q.page, q.pageSize); }
    get(a, id) { return this.s.get(a, id.slice(0, 40)); }
    create(a, b) { return this.s.create(a, b); }
    edit(a, id, b) { return this.s.update(a, id, b); }
    review(a, id) { return this.s.review(a, id); }
    remove(a, id) { return this.s.remove(a, id); }
};
exports.DutyReportsController = DutyReportsController;
__decorate([
    (0, common_1.Get)('templates'),
    (0, decorators_1.RequirePermission)('dutyreports.view'),
    __param(0, (0, common_1.Query)('active')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DutyReportsController.prototype, "templates", null);
__decorate([
    (0, common_1.Put)('templates/:id'),
    (0, decorators_1.RequirePermission)('dutyreports.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.reportTemplateSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], DutyReportsController.prototype, "saveTemplate", null);
__decorate([
    (0, common_1.Post)('templates/:id/duplicate'),
    (0, decorators_1.RequirePermission)('dutyreports.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DutyReportsController.prototype, "dup", null);
__decorate([
    (0, common_1.Delete)('templates/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('dutyreports.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DutyReportsController.prototype, "removeTemplate", null);
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('dutyreports.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], DutyReportsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('dutyreports.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DutyReportsController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('dutyreports.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(create))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], DutyReportsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, decorators_1.RequirePermission)('dutyreports.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(edit))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], DutyReportsController.prototype, "edit", null);
__decorate([
    (0, common_1.Post)(':id/review'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('dutyreports.review'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DutyReportsController.prototype, "review", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('dutyreports.edit_all'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DutyReportsController.prototype, "remove", null);
exports.DutyReportsController = DutyReportsController = __decorate([
    (0, swagger_1.ApiTags)('duty-reports'),
    (0, common_1.Controller)('duty-reports'),
    __metadata("design:paramtypes", [duty_reports_service_1.DutyReportsService])
], DutyReportsController);
//# sourceMappingURL=duty-reports.controller.js.map