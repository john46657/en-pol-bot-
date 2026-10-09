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
exports.FleetController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const fleet_service_1 = require("./fleet.service");
/** Polizeifahrzeuge: Live-Liste (ER:LC), Details, interne Daten, Modellkatalog, Einstellungen. Alle Rechte serverseitig. */
let FleetController = class FleetController {
    s;
    constructor(s) {
        this.s = s;
    }
    config() { return this.s.config(); }
    saveConfig(a, b) { return this.s.saveConfig(a, b); }
    list(q) { return this.s.list(q); }
    get(a, id) { return this.s.get(a, id); }
    /** Interne Felder; Einheit braucht zusätzlich fleet.assign, alles andere fleet.edit (im Service geprüft). */
    update(a, id, b) {
        const { version, ...rest } = b;
        return this.s.updateInternal(a, id, version, rest);
    }
    incident(a, id, b) { return this.s.documentIncident(a, id, b.incidentId, b.note); }
    catalog() { return this.s.catalog(); }
    suggestions() { return this.s.suggestions(); }
    createModel(a, b) { return this.s.createModel(a, b); }
    updateModel(a, id, b) { return this.s.updateModel(a, id, b); }
    deleteModel(a, id) { return this.s.deleteModel(a, id); }
    image(a, id, file) { return this.s.setModelImage(a, id, file); }
};
exports.FleetController = FleetController;
__decorate([
    (0, common_1.Get)('config'),
    (0, decorators_1.RequirePermission)('fleet.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FleetController.prototype, "config", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, decorators_1.RequirePermission)('fleet.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.fleetConfigSchema.partial()))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], FleetController.prototype, "saveConfig", null);
__decorate([
    (0, common_1.Get)('vehicles'),
    (0, decorators_1.RequirePermission)('fleet.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ active: zod_1.z.enum(['active', 'inactive', 'all']).optional(), serverId: zod_1.z.string().uuid().optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], FleetController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('vehicles/:id'),
    (0, decorators_1.RequirePermission)('fleet.view_details'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], FleetController.prototype, "get", null);
__decorate([
    (0, common_1.Patch)('vehicles/:id'),
    (0, decorators_1.RequirePermission)('fleet.view_details'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.fleetInternalSchema.extend({ version: zod_1.z.number().int().optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], FleetController.prototype, "update", null);
__decorate([
    (0, common_1.Post)('vehicles/:id/incidents'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('fleet.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ incidentId: zod_1.z.string().uuid(), note: zod_1.z.string().trim().max(500).nullish() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], FleetController.prototype, "incident", null);
__decorate([
    (0, common_1.Get)('catalog'),
    (0, decorators_1.RequirePermission)('fleet.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FleetController.prototype, "catalog", null);
__decorate([
    (0, common_1.Get)('catalog/suggestions'),
    (0, decorators_1.RequirePermission)('fleet.manage_catalog'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FleetController.prototype, "suggestions", null);
__decorate([
    (0, common_1.Post)('catalog'),
    (0, decorators_1.RequirePermission)('fleet.manage_catalog'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.fleetModelSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], FleetController.prototype, "createModel", null);
__decorate([
    (0, common_1.Patch)('catalog/:id'),
    (0, decorators_1.RequirePermission)('fleet.manage_catalog'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.fleetModelSchema.partial()))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], FleetController.prototype, "updateModel", null);
__decorate([
    (0, common_1.Delete)('catalog/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('fleet.manage_catalog'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], FleetController.prototype, "deleteModel", null);
__decorate([
    (0, common_1.Post)('catalog/:id/image'),
    (0, decorators_1.RequirePermission)('fleet.manage_catalog'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } })),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], FleetController.prototype, "image", null);
exports.FleetController = FleetController = __decorate([
    (0, swagger_1.ApiTags)('fleet'),
    (0, common_1.Controller)('fleet'),
    __metadata("design:paramtypes", [fleet_service_1.FleetService])
], FleetController);
//# sourceMappingURL=fleet.controller.js.map