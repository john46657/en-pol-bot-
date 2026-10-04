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
exports.WantedService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const timeline_service_1 = require("../timeline/timeline.service");
const errors_1 = require("../common/errors");
const discord_service_1 = require("../discord/discord.service");
const transition_1 = require("../common/transition");
const pagination_1 = require("../common/pagination");
let WantedService = class WantedService {
    prisma;
    audit;
    timeline;
    discord;
    constructor(prisma, audit, timeline, discord) {
        this.prisma = prisma;
        this.audit = audit;
        this.timeline = timeline;
        this.discord = discord;
    }
    /** Abgelaufene aktive Fahndungen werden beim Lesen/Schreiben konsistent auf EXPIRED gesetzt. */
    async expireDue() {
        return this.prisma.wantedRecord.updateMany({ where: { status: 'ACTIVE', expiresAt: { lt: new Date() } }, data: { status: 'EXPIRED' } });
    }
    async list(p, status = 'ACTIVE') {
        await this.expireDue();
        const where = { status, ...(p.q ? { reason: { contains: p.q, mode: 'insensitive' } } : {}) };
        const [items, total] = await Promise.all([this.prisma.wantedRecord.findMany({ where, orderBy: { createdAt: 'desc' }, ...(0, pagination_1.skipTake)(p) }), this.prisma.wantedRecord.count({ where })]);
        return (0, pagination_1.pageResult)(items, total, p);
    }
    async get(id) {
        await this.expireDue();
        const w = await this.prisma.wantedRecord.findUnique({ where: { id } });
        if (!w)
            throw new errors_1.AppError('NOT_FOUND', 'Wanted record not found.');
        return { wanted: w, timeline: await this.timeline.list('Wanted', id) };
    }
    async create(actor, d) {
        if (!!d.personId === !!d.vehicleId)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Provide exactly one of personId or vehicleId.');
        if (d.expiresAt && d.expiresAt <= new Date())
            throw new errors_1.AppError('VALIDATION_FAILED', 'expiresAt must be in the future.');
        return this.prisma.$transaction(async (tx) => {
            if (d.personId && !(await tx.person.findUnique({ where: { id: d.personId } })))
                throw new errors_1.AppError('NOT_FOUND', 'Person not found.');
            if (d.vehicleId && !(await tx.vehicle.findUnique({ where: { id: d.vehicleId } })))
                throw new errors_1.AppError('NOT_FOUND', 'Vehicle not found.');
            const dup = await tx.wantedRecord.findFirst({ where: { status: 'ACTIVE', personId: d.personId ?? undefined, vehicleId: d.vehicleId ?? undefined } });
            if (dup)
                throw new errors_1.AppError('CONFLICT', 'An active wanted record already exists.', { existingId: dup.id });
            const w = await tx.wantedRecord.create({ data: { ...d, priority: d.priority ?? 'MEDIUM', createdById: actor.userId } });
            if (d.personId) {
                await tx.recordLink.upsert({ where: { personId_entityType_entityId_role: { personId: d.personId, entityType: 'Wanted', entityId: w.id, role: 'SUBJECT' } }, create: { personId: d.personId, entityType: 'Wanted', entityId: w.id, role: 'SUBJECT' }, update: {} });
                await this.timeline.add(tx, { entityType: 'Person', entityId: d.personId, action: 'wanted.created', summary: `Wanted: ${d.reason}`, actorId: actor.userId });
            }
            await this.timeline.add(tx, { entityType: 'Wanted', entityId: w.id, action: 'wanted.created', summary: 'Wanted record activated', actorId: actor.userId });
            await this.audit.record(actor, { action: 'wanted.create', module: 'wanted', entityType: 'Wanted', entityId: w.id, after: w }, tx);
            return w;
        }).then(async (w) => {
            const subject = w.personId ? (await this.prisma.person.findUnique({ where: { id: w.personId } }))?.robloxUsername : (await this.prisma.vehicle.findUnique({ where: { id: w.vehicleId } }))?.plate;
            await this.discord.enqueue('wanted', 'wanted.created', { reason: w.reason, priority: w.priority, subject: subject ?? 'unknown', kind: w.personId ? 'person' : 'vehicle' });
            return w;
        });
    }
    async setStatus(actor, id, to, reason) {
        await this.expireDue();
        return this.prisma.$transaction(async (tx) => {
            const w = await tx.wantedRecord.findUnique({ where: { id } });
            if (!w)
                throw new errors_1.AppError('NOT_FOUND', 'Wanted record not found.');
            (0, transition_1.nextStatus)(shared_1.WANTED_TRANSITIONS, w.status, to);
            const after = await tx.wantedRecord.update({ where: { id }, data: { status: to, expiresAt: to === 'ACTIVE' ? null : w.expiresAt, version: { increment: 1 } } });
            await this.timeline.add(tx, { entityType: 'Wanted', entityId: id, action: `wanted.${to.toLowerCase()}`, summary: `${w.status} → ${to}`, actorId: actor.userId });
            if (w.personId)
                await this.timeline.add(tx, { entityType: 'Person', entityId: w.personId, action: `wanted.${to.toLowerCase()}`, summary: `Wanted record ${to}`, actorId: actor.userId });
            await this.audit.record(actor, { action: `wanted.${to.toLowerCase()}`, module: 'wanted', entityType: 'Wanted', entityId: id, before: { status: w.status }, after: { status: to }, reason }, tx);
            return after;
        });
    }
};
exports.WantedService = WantedService;
exports.WantedService = WantedService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, timeline_service_1.TimelineService, discord_service_1.DiscordService])
], WantedService);
//# sourceMappingURL=wanted.service.js.map