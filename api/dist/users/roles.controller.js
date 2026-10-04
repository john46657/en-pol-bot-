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
exports.RolesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const roles_service_1 = require("./roles.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const createRole = zod_1.z.object({ name: zod_1.z.string().trim().min(2).max(64), description: zod_1.z.string().max(500).optional() });
const grants = zod_1.z.object({ grants: zod_1.z.array(zod_1.z.object({ permission: zod_1.z.string(), effect: zod_1.z.enum(['ALLOW', 'DENY']) })).max(500) });
let RolesController = class RolesController {
    roles;
    constructor(roles) {
        this.roles = roles;
    }
    list() { return this.roles.list(); }
    catalog() { return this.roles.catalog(); }
    create(a, b) { return this.roles.create(a, b); }
    setPermissions(a, id, b) { return this.roles.setPermissions(a, id, b.grants); }
};
exports.RolesController = RolesController;
__decorate([
    (0, common_1.Get)('roles'),
    (0, decorators_1.RequirePermission)('roles.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], RolesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('permissions'),
    (0, decorators_1.RequirePermission)('roles.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], RolesController.prototype, "catalog", null);
__decorate([
    (0, common_1.Post)('roles'),
    (0, decorators_1.RequirePermission)('roles.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(createRole))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], RolesController.prototype, "create", null);
__decorate([
    (0, common_1.Put)('roles/:id/permissions'),
    (0, decorators_1.RequirePermission)('roles.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(grants))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], RolesController.prototype, "setPermissions", null);
exports.RolesController = RolesController = __decorate([
    (0, swagger_1.ApiTags)('roles'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [roles_service_1.RolesService])
], RolesController);
//# sourceMappingURL=roles.controller.js.map