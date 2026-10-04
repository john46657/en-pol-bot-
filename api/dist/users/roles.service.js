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
exports.RolesService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
let RolesService = class RolesService {
    prisma;
    audit;
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    list() {
        return this.prisma.role.findMany({ orderBy: { name: 'asc' }, include: { permissions: { select: { permissionKey: true, effect: true } } } });
    }
    catalog() { return shared_1.ALL_PERMISSIONS; }
    async create(actor, d) {
        return this.prisma.$transaction(async (tx) => {
            const r = await tx.role.create({ data: d });
            await this.audit.record(actor, { action: 'role.create', module: 'roles', entityType: 'Role', entityId: r.id, after: r }, tx);
            return r;
        });
    }
    async setPermissions(actor, id, grants) {
        for (const g of grants) {
            const valid = (0, shared_1.isPermissionKey)(g.permission) || g.permission === '*' || (g.permission.endsWith('.*') && shared_1.ALL_PERMISSIONS.some((p) => p.startsWith(g.permission.slice(0, -1))));
            if (!valid)
                throw new errors_1.AppError('VALIDATION_FAILED', `Unknown permission "${g.permission}".`);
        }
        return this.prisma.$transaction(async (tx) => {
            const role = await tx.role.findUnique({ where: { id }, include: { permissions: true } });
            if (!role)
                throw new errors_1.AppError('NOT_FOUND', 'Role not found.');
            const keys = [...new Set(grants.map((g) => g.permission))];
            for (const k of keys)
                await tx.permission.upsert({ where: { key: k }, create: { key: k, module: k.split('.')[0] ?? k }, update: {} });
            await tx.rolePermission.deleteMany({ where: { roleId: id } });
            await tx.rolePermission.createMany({ data: grants.map((g) => ({ roleId: id, permissionKey: g.permission, effect: g.effect })), skipDuplicates: true });
            const after = await tx.role.findUniqueOrThrow({ where: { id }, include: { permissions: true } });
            await this.audit.record(actor, { action: 'role.permissions.set', module: 'roles', entityType: 'Role', entityId: id, before: role.permissions, after: after.permissions }, tx);
            return after;
        });
    }
};
exports.RolesService = RolesService;
exports.RolesService = RolesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], RolesService);
//# sourceMappingURL=roles.service.js.map