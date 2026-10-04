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
exports.LegalCodesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const create = zod_1.z.object({
    code: zod_1.z.string().trim().min(1).max(32), title: zod_1.z.string().trim().min(1).max(200), description: zod_1.z.string().max(5000).optional(),
    category: zod_1.z.string().trim().min(1).max(64), penalty: zod_1.z.object({ fine: zod_1.z.number().min(0).optional(), jailMinutes: zod_1.z.number().min(0).optional() }),
});
/** Gesetzeskatalog liegt in der Datenbank – nie im Frontend hartcodiert. */
let LegalCodesController = class LegalCodesController {
    prisma;
    audit;
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    list() { return this.prisma.legalCode.findMany({ where: { active: true }, orderBy: { code: 'asc' } }); }
    async create(a, b) {
        return this.prisma.$transaction(async (tx) => {
            const c = await tx.legalCode.create({ data: b });
            await this.audit.record(a, { action: 'legalcode.create', module: 'settings', entityType: 'LegalCode', entityId: c.id, after: c }, tx);
            return c;
        });
    }
};
exports.LegalCodesController = LegalCodesController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('tickets.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LegalCodesController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(create))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", Promise)
], LegalCodesController.prototype, "create", null);
exports.LegalCodesController = LegalCodesController = __decorate([
    (0, swagger_1.ApiTags)('legal-codes'),
    (0, common_1.Controller)('legal-codes'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], LegalCodesController);
//# sourceMappingURL=legal-codes.controller.js.map