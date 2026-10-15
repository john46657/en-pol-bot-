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
const discordId = zod_1.z.string().regex(/^\d{15,25}$/, 'Discord-Rollen-ID (15–25 Ziffern)');
const fields = {
    description: zod_1.z.string().max(500).nullable().optional(),
    color: zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
    icon: zod_1.z.string().trim().max(32).nullable().optional(),
    active: zod_1.z.boolean().optional(),
    priority: zod_1.z.number().int().min(1).max(100_000).optional(),
    discordRoleIds: zod_1.z.array(discordId).max(25).optional(),
};
const createRole = zod_1.z.object({ name: zod_1.z.string().trim().min(2).max(64), guildId: zod_1.z.string().regex(/^\d{15,25}$/).nullable().optional(), ...fields });
const updateRole = zod_1.z.object({ name: zod_1.z.string().trim().min(2).max(64).optional(), ...fields });
const grants = zod_1.z.object({ grants: zod_1.z.array(zod_1.z.object({ permission: zod_1.z.string(), effect: zod_1.z.enum(['ALLOW', 'DENY']) })).max(500) });
const single = zod_1.z.object({ permission: zod_1.z.string().max(80), effect: zod_1.z.enum(['ALLOW', 'DENY', 'NONE']) });
const order = zod_1.z.object({ ids: zod_1.z.array(zod_1.z.string().uuid()).min(1).max(200) });
const dup = zod_1.z.object({ name: zod_1.z.string().trim().min(2).max(64).optional() });
let RolesController = class RolesController {
    roles;
    constructor(roles) {
        this.roles = roles;
    }
    list() { return this.roles.list(); }
    myRank(a) { return this.roles.myRank(a.userId); }
    catalog() { return this.roles.catalog(); }
    create(a, b) { return this.roles.create(a, b); }
    reorder(a, b) { return this.roles.reorder(a, b.ids); }
    update(a, id, b) { return this.roles.update(a, id, b); }
    remove(a, id) { return this.roles.remove(a, id); }
    duplicate(a, id, b) { return this.roles.duplicate(a, id, b.name); }
    setPermissions(a, id, b) { return this.roles.setPermissions(a, id, b.grants); }
    setPermission(a, id, b) { return this.roles.setPermission(a, id, b.permission, b.effect); }
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
    (0, common_1.Get)('roles/my-rank'),
    (0, decorators_1.RequirePermission)('roles.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RolesController.prototype, "myRank", null);
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
    (0, common_1.Put)('roles/order'),
    (0, decorators_1.RequirePermission)('roles.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(order))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], RolesController.prototype, "reorder", null);
__decorate([
    (0, common_1.Patch)('roles/:id'),
    (0, decorators_1.RequirePermission)('roles.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(updateRole))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], RolesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)('roles/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('roles.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], RolesController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('roles/:id/duplicate'),
    (0, decorators_1.RequirePermission)('roles.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(dup))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], RolesController.prototype, "duplicate", null);
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
__decorate([
    (0, common_1.Patch)('roles/:id/permissions'),
    (0, decorators_1.RequirePermission)('roles.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(single))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], RolesController.prototype, "setPermission", null);
exports.RolesController = RolesController = __decorate([
    (0, swagger_1.ApiTags)('roles'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [roles_service_1.RolesService])
], RolesController);
//# sourceMappingURL=roles.controller.js.map