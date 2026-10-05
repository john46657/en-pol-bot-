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
exports.VehiclesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const vehicles_service_1 = require("./vehicles.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const pagination_1 = require("../common/pagination");
const create = zod_1.z.object({ plate: zod_1.z.string().trim().min(2).max(16), model: zod_1.z.string().max(64).optional(), color: zod_1.z.string().max(32).optional(), ownerId: zod_1.z.string().uuid().optional(), notes: zod_1.z.string().max(2000).optional(), erlcReference: zod_1.z.string().max(64).optional(), custom: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional() });
const archive = zod_1.z.object({ reason: zod_1.z.string().trim().min(3).max(500) });
let VehiclesController = class VehiclesController {
    vehicles;
    constructor(vehicles) {
        this.vehicles = vehicles;
    }
    list(q) { return this.vehicles.list(q); }
    get(id) { return this.vehicles.get(id); }
    create(a, b) { return this.vehicles.create(a, b); }
    archive(a, id, b) { return this.vehicles.archive(a, id, b.reason); }
};
exports.VehiclesController = VehiclesController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('vehicles.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(pagination_1.pageQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], VehiclesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('vehicles.view'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], VehiclesController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('vehicles.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(create))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], VehiclesController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/archive'),
    (0, decorators_1.RequirePermission)('vehicles.archive'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(archive))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], VehiclesController.prototype, "archive", null);
exports.VehiclesController = VehiclesController = __decorate([
    (0, swagger_1.ApiTags)('vehicles'),
    (0, common_1.Controller)('vehicles'),
    __metadata("design:paramtypes", [vehicles_service_1.VehiclesService])
], VehiclesController);
//# sourceMappingURL=vehicles.controller.js.map