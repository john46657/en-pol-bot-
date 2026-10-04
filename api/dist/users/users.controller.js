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
exports.UsersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const users_service_1 = require("./users.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const pagination_1 = require("../common/pagination");
const createUser = zod_1.z.object({
    username: zod_1.z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
    displayName: zod_1.z.string().trim().min(1).max(64),
    password: zod_1.z.string().min(12).max(256),
    email: zod_1.z.string().email().optional(),
    roleIds: zod_1.z.array(zod_1.z.string().uuid()).optional(),
});
const roblox = zod_1.z.object({ robloxUserId: zod_1.z.string().nullable(), robloxUsername: zod_1.z.string().trim().max(64).optional() });
const active = zod_1.z.object({ active: zod_1.z.boolean(), reason: zod_1.z.string().max(500).optional() });
const roles = zod_1.z.object({ roleIds: zod_1.z.array(zod_1.z.string().uuid()) });
const override = zod_1.z.object({ permission: zod_1.z.string(), effect: zod_1.z.enum(['ALLOW', 'DENY']), reason: zod_1.z.string().max(500).optional() });
let UsersController = class UsersController {
    users;
    constructor(users) {
        this.users = users;
    }
    list(q) { return this.users.list(q); }
    get(id) { return this.users.get(id); }
    create(a, b) { return this.users.create(a, b); }
    setRoblox(a, id, b) { return this.users.setRoblox(a, id, b); }
    setActive(a, id, b) { return this.users.setActive(a, id, b.active, b.reason); }
    setRoles(a, id, b) { return this.users.setRoles(a, id, b.roleIds); }
    setOverride(a, id, b) { return this.users.setOverride(a, id, b); }
    removeOverride(a, id, p) { return this.users.removeOverride(a, id, p); }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('users.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(pagination_1.pageQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('users.view'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('users.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(createUser))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id/roblox'),
    (0, decorators_1.RequirePermission)('users.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(roblox))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "setRoblox", null);
__decorate([
    (0, common_1.Put)(':id/active'),
    (0, decorators_1.RequirePermission)('users.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(active))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "setActive", null);
__decorate([
    (0, common_1.Put)(':id/roles'),
    (0, decorators_1.RequirePermission)('roles.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(roles))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "setRoles", null);
__decorate([
    (0, common_1.Put)(':id/overrides'),
    (0, decorators_1.RequirePermission)('roles.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(override))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "setOverride", null);
__decorate([
    (0, common_1.Delete)(':id/overrides/:permission'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('roles.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('permission')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "removeOverride", null);
exports.UsersController = UsersController = __decorate([
    (0, swagger_1.ApiTags)('users'),
    (0, common_1.Controller)('users'),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], UsersController);
//# sourceMappingURL=users.controller.js.map