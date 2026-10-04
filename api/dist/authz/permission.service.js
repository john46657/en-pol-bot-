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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const errors_1 = require("../common/errors");
/** Lädt Rechte-Kontext aus DB; die Entscheidungslogik liegt zentral in @enrp/shared. */
let PermissionService = class PermissionService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async contextFor(userId) {
        const [overrides, direct, groups] = await Promise.all([
            this.prisma.userPermissionOverride.findMany({ where: { userId } }),
            this.prisma.userRole.findMany({ where: { userId }, select: { roleId: true } }),
            this.prisma.groupMember.findMany({ where: { userId }, select: { group: { select: { roles: { select: { roleId: true } } } } } }),
        ]);
        const roleIds = new Set(direct.map((r) => r.roleId));
        for (const g of groups)
            for (const r of g.group.roles)
                roleIds.add(r.roleId);
        const rolePerms = roleIds.size
            ? await this.prisma.rolePermission.findMany({ where: { roleId: { in: [...roleIds] } } })
            : [];
        const toGrant = (p, e) => ({ permission: p, effect: e === 'DENY' ? 'DENY' : 'ALLOW' });
        return {
            userOverrides: overrides.map((o) => toGrant(o.permissionKey, o.effect)),
            roleGrants: rolePerms.map((r) => toGrant(r.permissionKey, r.effect)),
        };
    }
    async check(userId, permission) {
        return (0, shared_1.resolvePermission)(await this.contextFor(userId), permission);
    }
    async has(userId, permission) {
        return (await this.check(userId, permission)).allowed;
    }
    async assert(userId, permission) {
        if (!(await this.has(userId, permission)))
            throw new errors_1.AppError('PERMISSION_DENIED', 'You do not have permission to perform this action.');
    }
    async effective(userId) {
        return (0, shared_1.effectivePermissions)(await this.contextFor(userId));
    }
};
exports.PermissionService = PermissionService;
exports.PermissionService = PermissionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PermissionService);
//# sourceMappingURL=permission.service.js.map