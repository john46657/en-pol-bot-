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
exports.NotificationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const prisma_service_1 = require("../prisma/prisma.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const pagination_1 = require("../common/pagination");
const q = pagination_1.pageQuery.extend({ filter: zod_1.z.enum(['unread', 'read', 'archived', 'all']).default('unread'), type: zod_1.z.string().max(40).optional() });
/** Jeder Benutzer sieht ausschließlich eigene Benachrichtigungen (immer per userId gefiltert). */
let NotificationsController = class NotificationsController {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list(u, f) {
        const state = f.filter === 'unread' ? { readAt: null, archivedAt: null } : f.filter === 'read' ? { readAt: { not: null }, archivedAt: null } : f.filter === 'archived' ? { archivedAt: { not: null } } : {};
        // Persönlich ausgeblendete Arten (Einstellungen → Benachrichtigungen) erscheinen weder in der Liste noch im Zähler
        const prefs = (await this.prisma.userSettings.findUnique({ where: { userId: u.id }, select: { preferences: true } }))?.preferences;
        const muted = prefs?.notifications?.muted ?? [];
        const type = f.type ? { type: f.type } : muted.length ? { type: { notIn: muted } } : {};
        const where = { userId: u.id, ...state, ...type };
        const [items, total, unread] = await Promise.all([
            this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...(0, pagination_1.skipTake)(f) }),
            this.prisma.notification.count({ where }),
            this.prisma.notification.count({ where: { userId: u.id, readAt: null, archivedAt: null, ...(muted.length ? { type: { notIn: muted } } : {}) } }),
        ]);
        return { ...(0, pagination_1.pageResult)(items, total, f), unread };
    }
    async readAll(u) { return { updated: (await this.prisma.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } })).count }; }
    async read(u, id) { return { updated: (await this.prisma.notification.updateMany({ where: { id, userId: u.id }, data: { readAt: new Date() } })).count }; }
    async archive(u, id) { return { updated: (await this.prisma.notification.updateMany({ where: { id, userId: u.id }, data: { archivedAt: new Date(), readAt: new Date() } })).count }; }
};
exports.NotificationsController = NotificationsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(q))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('read-all'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, decorators_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "readAll", null);
__decorate([
    (0, common_1.Post)(':id/read'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "read", null);
__decorate([
    (0, common_1.Post)(':id/archive'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "archive", null);
exports.NotificationsController = NotificationsController = __decorate([
    (0, swagger_1.ApiTags)('notifications'),
    (0, common_1.Controller)('notifications'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], NotificationsController);
//# sourceMappingURL=notifications.controller.js.map