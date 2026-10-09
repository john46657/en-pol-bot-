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
exports.MdtController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const pagination_1 = require("../common/pagination");
const mdt_service_1 = require("./mdt.service");
const citizenQ = pagination_1.pageQuery.extend({ flag: zod_1.z.string().max(32).optional() });
const citizenUpdate = shared_1.personDetailsSchema.extend({ version: zod_1.z.number().int(), notes: zod_1.z.string().max(5000).nullish() });
const weaponQ = pagination_1.pageQuery.extend({ ownerId: zod_1.z.string().uuid().optional(), status: zod_1.z.enum(shared_1.WEAPON_STATUS_KEYS).optional() });
const weaponBody = zod_1.z.object({
    serial: zod_1.z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9\- ]+$/, 'Seriennummer: Buchstaben, Ziffern, Bindestrich'), type: zod_1.z.string().max(32), model: zod_1.z.string().trim().max(60).nullish(),
    ownerId: zod_1.z.string().uuid().nullish(), status: zod_1.z.enum(shared_1.WEAPON_STATUS_KEYS).optional(), notes: zod_1.z.string().trim().max(2000).nullish(),
});
/** Polizei-MDT (Streifen-Terminal): Bürger, Fahrzeuge, Waffen, Haftbefehle. Gleiche Akten und Rechte wie im Dashboard. */
let MdtController = class MdtController {
    s;
    constructor(s) {
        this.s = s;
    }
    config() { return this.s.config(); }
    saveConfig(a, b) { return this.s.saveConfig(a, b); }
    citizens(q) { return this.s.citizens(q); }
    citizen(a, id) { return this.s.profile(a, id); }
    citizenRoblox(a, id) { return this.s.robloxProfile(a, id); }
    updateCitizen(a, id, b) {
        const { version, ...rest } = b;
        return this.s.updateCitizen(a, id, version, rest);
    }
    photo(a, id, file) { return this.s.setPhoto(a, id, file); }
    vehicles(q) { return this.s.vehicles(q); }
    vehicle(a, id) { return this.s.vehicle(a, id); }
    weapons(q) { return this.s.weapons(q); }
    createWeapon(a, b) { return this.s.createWeapon(a, b); }
    updateWeapon(a, id, b) {
        const { version, ...rest } = b;
        return this.s.updateWeapon(a, id, version, rest);
    }
    warrants(q) { return this.s.warrants(q.status ?? 'ACTIVE'); }
};
exports.MdtController = MdtController;
__decorate([
    (0, common_1.Get)('config'),
    (0, decorators_1.RequirePermission)('dashboard.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MdtController.prototype, "config", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.mdtConfigSchema.partial()))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], MdtController.prototype, "saveConfig", null);
__decorate([
    (0, common_1.Get)('citizens'),
    (0, decorators_1.RequirePermission)('persons.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(citizenQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], MdtController.prototype, "citizens", null);
__decorate([
    (0, common_1.Get)('citizens/:id'),
    (0, decorators_1.RequirePermission)('persons.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MdtController.prototype, "citizen", null);
__decorate([
    (0, common_1.Get)('citizens/:id/roblox'),
    (0, decorators_1.RequirePermission)('persons.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MdtController.prototype, "citizenRoblox", null);
__decorate([
    (0, common_1.Patch)('citizens/:id'),
    (0, decorators_1.RequirePermission)('persons.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(citizenUpdate))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], MdtController.prototype, "updateCitizen", null);
__decorate([
    (0, common_1.Post)('citizens/:id/photo'),
    (0, decorators_1.RequirePermission)('persons.edit'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } })),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], MdtController.prototype, "photo", null);
__decorate([
    (0, common_1.Get)('vehicles'),
    (0, decorators_1.RequirePermission)('vehicles.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(pagination_1.pageQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], MdtController.prototype, "vehicles", null);
__decorate([
    (0, common_1.Get)('vehicles/:id'),
    (0, decorators_1.RequirePermission)('vehicles.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MdtController.prototype, "vehicle", null);
__decorate([
    (0, common_1.Get)('weapons'),
    (0, decorators_1.RequirePermission)('weapons.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(weaponQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], MdtController.prototype, "weapons", null);
__decorate([
    (0, common_1.Post)('weapons'),
    (0, decorators_1.RequirePermission)('weapons.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(weaponBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], MdtController.prototype, "createWeapon", null);
__decorate([
    (0, common_1.Patch)('weapons/:id'),
    (0, decorators_1.RequirePermission)('weapons.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(weaponBody.omit({ serial: true }).partial().extend({ version: zod_1.z.number().int() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], MdtController.prototype, "updateWeapon", null);
__decorate([
    (0, common_1.Get)('warrants'),
    (0, decorators_1.RequirePermission)('wanted.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ status: zod_1.z.enum(['ACTIVE', 'ALL']).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MdtController.prototype, "warrants", null);
exports.MdtController = MdtController = __decorate([
    (0, swagger_1.ApiTags)('mdt'),
    (0, common_1.Controller)('mdt'),
    __metadata("design:paramtypes", [mdt_service_1.MdtService])
], MdtController);
//# sourceMappingURL=mdt.controller.js.map