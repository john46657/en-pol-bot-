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
exports.TimelineService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let TimelineService = class TimelineService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async add(tx, e) {
        await tx.timelineEvent.create({ data: e });
    }
    /** Verlauf mit Anzeigenamen der handelnden Person (`actorName`, null bei System/Bot). */
    async list(entityType, entityId, take = 100) {
        const rows = await this.prisma.timelineEvent.findMany({ where: { entityType, entityId }, orderBy: { createdAt: 'desc' }, take });
        const ids = [...new Set(rows.map((r) => r.actorId).filter((x) => !!x))];
        const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : [];
        const name = new Map(users.map((u) => [u.id, u.displayName]));
        return rows.map((r) => ({ ...r, actorName: r.actorId ? name.get(r.actorId) ?? null : null }));
    }
};
exports.TimelineService = TimelineService;
exports.TimelineService = TimelineService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TimelineService);
//# sourceMappingURL=timeline.service.js.map