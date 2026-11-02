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
exports.AccessMatrixController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const access_matrix_service_1 = require("./access-matrix.service");
const area = zod_1.z.enum(shared_1.ACCESS_AREAS);
const level = zod_1.z.enum(shared_1.ACCESS_LEVELS);
/** Zentraler Berechtigungseditor: Matrix Rolle × Bereich × Zugriffsstufe. */
let AccessMatrixController = class AccessMatrixController {
    s;
    constructor(s) {
        this.s = s;
    }
    matrix() { return this.s.matrix(); }
    preview(q) { return this.s.preview(q.roleId, q.area, q.level); }
    set(a, roleId, ar, b) { return this.s.setLevel(a, roleId, ar, b.level); }
    user(id) { return this.s.userLevels(id); }
};
exports.AccessMatrixController = AccessMatrixController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('roles.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AccessMatrixController.prototype, "matrix", null);
__decorate([
    (0, common_1.Get)('preview'),
    (0, decorators_1.RequirePermission)('roles.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ roleId: zod_1.z.string().uuid(), area, level })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AccessMatrixController.prototype, "preview", null);
__decorate([
    (0, common_1.Put)('roles/:roleId/:area'),
    (0, decorators_1.RequirePermission)('roles.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('roleId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('area', (0, zod_pipe_1.zodBody)(area))),
    __param(3, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ level })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], AccessMatrixController.prototype, "set", null);
__decorate([
    (0, common_1.Get)('users/:userId'),
    (0, decorators_1.RequirePermission)('users.view'),
    __param(0, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AccessMatrixController.prototype, "user", null);
exports.AccessMatrixController = AccessMatrixController = __decorate([
    (0, swagger_1.ApiTags)('roles'),
    (0, common_1.Controller)('access-matrix'),
    __metadata("design:paramtypes", [access_matrix_service_1.AccessMatrixService])
], AccessMatrixController);
//# sourceMappingURL=access-matrix.controller.js.map