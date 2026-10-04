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
exports.PersonnelService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const timeline_service_1 = require("../timeline/timeline.service");
const errors_1 = require("../common/errors");
const pagination_1 = require("../common/pagination");
let PersonnelService = class PersonnelService {
    prisma;
    audit;
    timeline;
    constructor(prisma, audit, timeline) {
        this.prisma = prisma;
        this.audit = audit;
        this.timeline = timeline;
    }
    async list(p) {
        const where = p.q ? { OR: [{ callsign: { contains: p.q, mode: 'insensitive' } }, { rank: { contains: p.q, mode: 'insensitive' } }, { user: { displayName: { contains: p.q, mode: 'insensitive' } } }] } : {};
        const [items, total] = await Promise.all([
            this.prisma.personnel.findMany({ where, include: { user: { select: { id: true, displayName: true, robloxUserId: true } } }, orderBy: { callsign: 'asc' }, ...(0, pagination_1.skipTake)(p) }),
            this.prisma.personnel.count({ where }),
        ]);
        return (0, pagination_1.pageResult)(items, total, p);
    }
    /** Vollständige Personalakte inkl. Disziplinarvorgängen; Zugriff wird im Audit festgehalten. */
    async get(actor, id) {
        const rec = await this.prisma.personnel.findUnique({
            where: { id },
            include: { user: { select: { id: true, displayName: true, robloxUserId: true, robloxUsername: true, lastLogin: true } }, records: { orderBy: { createdAt: 'desc' } }, academyEnrollments: { include: { course: true, results: true } } },
        });
        if (!rec)
            throw new errors_1.AppError('NOT_FOUND', 'Personnel file not found.');
        await this.audit.record(actor, { action: 'personnel.read', module: 'personnel', entityType: 'Personnel', entityId: id });
        return rec;
    }
    async create(actor, d) {
        return this.prisma.$transaction(async (tx) => {
            if (!(await tx.user.findUnique({ where: { id: d.userId } })))
                throw new errors_1.AppError('NOT_FOUND', 'User not found.');
            if (await tx.personnel.findUnique({ where: { userId: d.userId } }))
                throw new errors_1.AppError('CONFLICT', 'A personnel file already exists for this user.');
            const p = await tx.personnel.create({ data: { ...d, callsign: d.callsign?.toUpperCase() } });
            await this.timeline.add(tx, { entityType: 'Personnel', entityId: p.id, action: 'personnel.created', summary: 'Personnel file created', actorId: actor.userId });
            await this.audit.record(actor, { action: 'personnel.create', module: 'personnel', entityType: 'Personnel', entityId: p.id, after: p }, tx);
            return p;
        });
    }
    async update(actor, id, d) {
        return this.prisma.$transaction(async (tx) => {
            const before = await tx.personnel.findUnique({ where: { id } });
            if (!before)
                throw new errors_1.AppError('NOT_FOUND', 'Personnel file not found.');
            const after = await tx.personnel.update({ where: { id }, data: { ...d, callsign: d.callsign?.toUpperCase() } });
            await this.audit.record(actor, { action: 'personnel.update', module: 'personnel', entityType: 'Personnel', entityId: id, before, after }, tx);
            return after;
        });
    }
    async promote(actor, id, rank, reason) {
        return this.prisma.$transaction(async (tx) => {
            const before = await tx.personnel.findUnique({ where: { id } });
            if (!before)
                throw new errors_1.AppError('NOT_FOUND', 'Personnel file not found.');
            if (before.userId === actor.userId)
                throw new errors_1.AppError('CONFLICT', 'You cannot change your own rank.');
            const after = await tx.personnel.update({ where: { id }, data: { rank } });
            await tx.personnelRecord.create({ data: { personnelId: id, type: 'PROMOTION', summary: `${before.rank ?? '—'} → ${rank}`, details: reason, createdById: actor.userId } });
            await this.timeline.add(tx, { entityType: 'Personnel', entityId: id, action: 'personnel.promoted', summary: `Rank ${before.rank ?? '—'} → ${rank}`, actorId: actor.userId });
            await this.audit.record(actor, { action: 'personnel.promote', module: 'personnel', entityType: 'Personnel', entityId: id, before: { rank: before.rank }, after: { rank }, reason }, tx);
            await tx.notification.create({ data: { userId: before.userId, type: 'PERSONNEL', title: `Your rank changed to ${rank}` } });
            return after;
        });
    }
    async addRecord(actor, id, d) {
        return this.prisma.$transaction(async (tx) => {
            const p = await tx.personnel.findUnique({ where: { id } });
            if (!p)
                throw new errors_1.AppError('NOT_FOUND', 'Personnel file not found.');
            if (d.type === 'DISCIPLINE' && p.userId === actor.userId)
                throw new errors_1.AppError('CONFLICT', 'You cannot record discipline against yourself.');
            const r = await tx.personnelRecord.create({ data: { personnelId: id, ...d, createdById: actor.userId } });
            await this.audit.record(actor, { action: `personnel.${d.type.toLowerCase()}`, module: 'personnel', entityType: 'Personnel', entityId: id, after: r }, tx);
            return r;
        });
    }
};
exports.PersonnelService = PersonnelService;
exports.PersonnelService = PersonnelService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, timeline_service_1.TimelineService])
], PersonnelService);
//# sourceMappingURL=personnel.service.js.map