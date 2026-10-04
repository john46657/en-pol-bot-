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
exports.VehiclesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const timeline_service_1 = require("../timeline/timeline.service");
const studio_service_1 = require("../studio/studio.service");
const errors_1 = require("../common/errors");
const pagination_1 = require("../common/pagination");
const normPlate = (p) => p.toUpperCase().replace(/\s+/g, '');
let VehiclesService = class VehiclesService {
    prisma;
    audit;
    timeline;
    studio;
    constructor(prisma, audit, timeline, studio) {
        this.prisma = prisma;
        this.audit = audit;
        this.timeline = timeline;
        this.studio = studio;
    }
    async list(p) {
        const where = p.q ? { OR: [{ plate: { contains: normPlate(p.q) } }, { model: { contains: p.q, mode: 'insensitive' } }] } : {};
        const [items, total] = await Promise.all([
            this.prisma.vehicle.findMany({ where, include: { owner: { select: { id: true, robloxUsername: true } } }, orderBy: { plate: 'asc' }, ...(0, pagination_1.skipTake)(p) }),
            this.prisma.vehicle.count({ where }),
        ]);
        return (0, pagination_1.pageResult)(items, total, p);
    }
    async get(id) {
        const v = await this.prisma.vehicle.findUnique({ where: { id }, include: { owner: true } });
        if (!v)
            throw new errors_1.AppError('NOT_FOUND', 'Vehicle not found.');
        return { vehicle: v, timeline: await this.timeline.list('Vehicle', id) };
    }
    async create(actor, d) {
        const custom = await this.studio.check('vehicles', d.custom);
        const { custom: _c, ...rest } = d;
        void _c;
        const plate = normPlate(d.plate);
        if (await this.prisma.vehicle.findFirst({ where: { plate } }))
            throw new errors_1.AppError('CONFLICT', 'A vehicle with this plate already exists.');
        return this.prisma.$transaction(async (tx) => {
            if (d.ownerId && !(await tx.person.findUnique({ where: { id: d.ownerId } })))
                throw new errors_1.AppError('NOT_FOUND', 'Owner not found.');
            const v = await tx.vehicle.create({ data: { ...rest, plate, custom: custom } });
            await this.timeline.add(tx, { entityType: 'Vehicle', entityId: v.id, action: 'vehicle.created', summary: `Vehicle ${plate} registered`, actorId: actor.userId });
            if (d.ownerId)
                await this.timeline.add(tx, { entityType: 'Person', entityId: d.ownerId, action: 'vehicle.linked', summary: `Vehicle ${plate} linked as owner`, actorId: actor.userId });
            await this.audit.record(actor, { action: 'vehicle.create', module: 'vehicles', entityType: 'Vehicle', entityId: v.id, after: v }, tx);
            return v;
        });
    }
    async archive(actor, id, reason) {
        const { vehicle } = await this.get(id);
        return this.prisma.$transaction(async (tx) => {
            const v = await tx.vehicle.update({ where: { id }, data: { status: 'ARCHIVED', version: { increment: 1 } } });
            await this.timeline.add(tx, { entityType: 'Vehicle', entityId: id, action: 'vehicle.archived', summary: 'Vehicle archived', actorId: actor.userId });
            await this.audit.record(actor, { action: 'vehicle.archive', module: 'vehicles', entityType: 'Vehicle', entityId: id, before: { status: vehicle.status }, after: { status: v.status }, reason }, tx);
            return v;
        });
    }
};
exports.VehiclesService = VehiclesService;
exports.VehiclesService = VehiclesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, timeline_service_1.TimelineService, studio_service_1.StudioService])
], VehiclesService);
//# sourceMappingURL=vehicles.service.js.map