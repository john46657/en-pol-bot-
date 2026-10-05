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
exports.AuditController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const prisma_service_1 = require("../prisma/prisma.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const pagination_1 = require("../common/pagination");
const q = pagination_1.pageQuery.extend({ module: zod_1.z.string().optional(), entityType: zod_1.z.string().optional(), entityId: zod_1.z.string().optional() });
/** Nur lesend. Es gibt bewusst keine Schreib-/Lösch-Endpunkte für Audit-Logs. */
let AuditController = class AuditController {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list(f) {
        const where = { ...(f.module ? { module: f.module } : {}), ...(f.entityType ? { entityType: f.entityType } : {}), ...(f.entityId ? { entityId: f.entityId } : {}) };
        const [items, total] = await Promise.all([this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...(0, pagination_1.skipTake)(f) }), this.prisma.auditLog.count({ where })]);
        return (0, pagination_1.pageResult)(items, total, f);
    }
};
exports.AuditController = AuditController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('audit.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(q))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", Promise)
], AuditController.prototype, "list", null);
exports.AuditController = AuditController = __decorate([
    (0, swagger_1.ApiTags)('audit'),
    (0, common_1.Controller)('audit'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AuditController);
//# sourceMappingURL=audit.controller.js.map