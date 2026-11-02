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
exports.OrgController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const org_service_1 = require("./org.service");
const uuid = zod_1.z.string().uuid();
const updateSchema = shared_1.orgUnitSchema.partial().extend({ version: zod_1.z.number().int().optional() });
/** Organigramm (Dashboard-Editor, MDT-/Leitstellen-Übersicht, Bot). */
let OrgController = class OrgController {
    s;
    constructor(s) {
        this.s = s;
    }
    units(q) { return this.s.structure({ includeInactive: q.inactive === '1' }); }
    /** Führungsstruktur ohne Mitgliederlisten (MDT, Leitstelle, Bot) */
    summary() { return this.s.summary(); }
    detail(id) { return this.s.detail(id); }
    unitsOf(id) { return this.s.unitsOf(id); }
    create(a, b) { return this.s.create(a, b); }
    update(a, id, b) { return this.s.update(a, id, b); }
    deactivate(a, id) { return this.s.setActive(a, id, false); }
    activate(a, id) { return this.s.setActive(a, id, true); }
    assign(a, id, b) { return this.s.assign(a, id, b); }
    unassign(a, id, pid) { return this.s.unassign(a, id, pid); }
    importDepartments(a, b) { return this.s.importDepartments(a, b.parentId); }
};
exports.OrgController = OrgController;
__decorate([
    (0, common_1.Get)('units'),
    (0, decorators_1.RequirePermission)('org.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ inactive: zod_1.z.enum(['1', '0']).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OrgController.prototype, "units", null);
__decorate([
    (0, common_1.Get)('summary'),
    (0, decorators_1.RequirePermission)('org.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], OrgController.prototype, "summary", null);
__decorate([
    (0, common_1.Get)('units/:id'),
    (0, decorators_1.RequirePermission)('org.view'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], OrgController.prototype, "detail", null);
__decorate([
    (0, common_1.Get)('people/:personnelId'),
    (0, decorators_1.RequirePermission)('org.view'),
    __param(0, (0, common_1.Param)('personnelId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], OrgController.prototype, "unitsOf", null);
__decorate([
    (0, common_1.Post)('units'),
    (0, decorators_1.RequirePermission)('org.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.orgUnitSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], OrgController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)('units/:id'),
    (0, decorators_1.RequirePermission)('org.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(updateSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], OrgController.prototype, "update", null);
__decorate([
    (0, common_1.Post)('units/:id/deactivate'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('org.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], OrgController.prototype, "deactivate", null);
__decorate([
    (0, common_1.Post)('units/:id/activate'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('org.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], OrgController.prototype, "activate", null);
__decorate([
    (0, common_1.Post)('units/:id/members'),
    (0, decorators_1.RequirePermission)('org.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ personnelId: uuid, function: zod_1.z.string().trim().max(80).nullable().optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], OrgController.prototype, "assign", null);
__decorate([
    (0, common_1.Delete)('units/:id/members/:personnelId'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('org.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('personnelId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], OrgController.prototype, "unassign", null);
__decorate([
    (0, common_1.Post)('import-departments'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('org.hierarchy'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ parentId: uuid.nullable().optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], OrgController.prototype, "importDepartments", null);
exports.OrgController = OrgController = __decorate([
    (0, swagger_1.ApiTags)('org'),
    (0, common_1.Controller)('org'),
    __metadata("design:paramtypes", [org_service_1.OrgService])
], OrgController);
//# sourceMappingURL=org.controller.js.map