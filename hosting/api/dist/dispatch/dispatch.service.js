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
exports.DispatchService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const realtime_service_1 = require("../realtime/realtime.service");
const discord_service_1 = require("../discord/discord.service");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const timeline_service_1 = require("../timeline/timeline.service");
const errors_1 = require("../common/errors");
const links_1 = require("../common/links");
const numbering_1 = require("../common/numbering");
const transition_1 = require("../common/transition");
const pagination_1 = require("../common/pagination");
const locks_service_1 = require("../locks/locks.service");
const OPEN = ['CLOSED', 'CANCELLED'];
let DispatchService = class DispatchService {
    prisma;
    audit;
    timeline;
    rt;
    discord;
    locks;
    constructor(prisma, audit, timeline, rt, discord, locks) {
        this.prisma = prisma;
        this.audit = audit;
        this.timeline = timeline;
        this.rt = rt;
        this.discord = discord;
        this.locks = locks;
    }
    // ---- Units ----
    listUnits() { return this.prisma.unit.findMany({ include: { members: true }, orderBy: { callsign: 'asc' } }); }
    async createUnit(actor, d) {
        return this.prisma.$transaction(async (tx) => {
            const u = await tx.unit.create({ data: { callsign: d.callsign.toUpperCase(), vehicle: d.vehicle, notes: d.notes, members: { create: (d.memberIds ?? []).map((userId) => ({ userId })) } } });
            await this.audit.record(actor, { action: 'unit.create', module: 'dispatch', entityType: 'Unit', entityId: u.id, after: u }, tx);
            return u;
        });
    }
    async setUnitStatus(actor, id, status) {
        const before = await this.prisma.unit.findUnique({ where: { id } });
        if (!before)
            throw new errors_1.AppError('NOT_FOUND', 'Unit not found.');
        return this.prisma.$transaction(async (tx) => {
            const u = await tx.unit.update({ where: { id }, data: { status } });
            await this.audit.record(actor, { action: 'unit.status', module: 'dispatch', entityType: 'Unit', entityId: id, before: { status: before.status }, after: { status } }, tx);
            return u;
        }).then((u) => { this.rt.publish('dispatch', 'unit.status', { unitId: id, status }); this.rt.publish('team', 'unit.status', { unitId: id, status }); return u; });
    }
    /** Besetzung einer Einheit (Supervisor/Leitstelle). Nur aktive Benutzer; ersetzt die bisherige Besetzung vollständig. */
    async setUnitMembers(actor, id, userIds) {
        return this.prisma.$transaction(async (tx) => {
            const unit = await tx.unit.findUnique({ where: { id }, include: { members: true } });
            if (!unit)
                throw new errors_1.AppError('NOT_FOUND', 'Unit not found.');
            const unique = [...new Set(userIds)];
            if ((await tx.user.count({ where: { id: { in: unique }, active: true } })) !== unique.length)
                throw new errors_1.AppError('NOT_FOUND', 'User not found.');
            await tx.unitMember.deleteMany({ where: { unitId: id, userId: { notIn: unique } } });
            await tx.unitMember.createMany({ data: unique.map((userId) => ({ unitId: id, userId })), skipDuplicates: true });
            await this.audit.record(actor, { action: 'unit.members', module: 'dispatch', entityType: 'Unit', entityId: id, before: unit.members.map((m) => m.userId), after: unique }, tx);
            return tx.unit.findUniqueOrThrow({ where: { id }, include: { members: true } });
        }).then((u) => { this.rt.publish('team', 'unit.status', { unitId: id }); return u; });
    }
    // ---- Incidents ----
    async list(p, status, activeOnly = false) {
        const where = {
            ...(status ? { status } : {}),
            ...(activeOnly ? { status: { notIn: OPEN } } : {}),
            ...(p.q ? { OR: [{ number: { contains: p.q.toUpperCase() } }, { title: { contains: p.q, mode: 'insensitive' } }] } : {}),
        };
        const [items, total] = await Promise.all([
            this.prisma.incident.findMany({ where, include: { units: { include: { unit: { select: { callsign: true } } } } }, orderBy: { createdAt: 'desc' }, ...(0, pagination_1.skipTake)(p) }),
            this.prisma.incident.count({ where }),
        ]);
        return (0, pagination_1.pageResult)(items, total, p);
    }
    async get(id) {
        const incident = await this.prisma.incident.findUnique({ where: { id }, include: { units: { include: { unit: true } } } });
        if (!incident)
            throw new errors_1.AppError('NOT_FOUND', 'Incident not found.');
        const [links, timeline] = await Promise.all([this.prisma.recordLink.findMany({ where: { entityType: 'Incident', entityId: id } }), this.timeline.list('Incident', id)]);
        return { incident, links, timeline };
    }
    async create(actor, d) {
        return this.prisma.$transaction(async (tx) => {
            const inc = await tx.incident.create({ data: { number: (0, numbering_1.makeNumber)('I'), title: d.title, description: d.description, priority: d.priority ?? 'MEDIUM', location: d.location, dispatcherId: actor.userId } });
            await this.attach(tx, inc.id, d.personIds, d.vehicleIds, actor);
            await this.timeline.add(tx, { entityType: 'Incident', entityId: inc.id, action: 'incident.created', summary: `Incident ${inc.number} created`, actorId: actor.userId });
            await this.audit.record(actor, { action: 'incident.create', module: 'incidents', entityType: 'Incident', entityId: inc.id, after: inc }, tx);
            return inc;
        }).then(async (inc) => { this.rt.publish('incidents', 'incident.created', { id: inc.id, number: inc.number }); this.rt.publish('dispatch', 'queue.changed', { id: inc.id }); await this.discord.enqueue('dispatch', 'incident.created', { number: inc.number, title: inc.title, priority: inc.priority, location: inc.location }); return inc; });
    }
    async attach(tx, incidentId, personIds = [], vehicleIds = [], actor) {
        for (const pid of new Set(personIds)) {
            if (!(await tx.person.findUnique({ where: { id: pid } })))
                throw new errors_1.AppError('NOT_FOUND', 'Person not found.');
            await (0, links_1.linkPerson)(tx, pid, 'Incident', incidentId, 'PARTICIPANT');
            await this.timeline.add(tx, { entityType: 'Person', entityId: pid, action: 'incident.linked', summary: 'Linked to incident', actorId: actor.userId });
        }
        for (const vid of new Set(vehicleIds)) {
            if (!(await tx.vehicle.findUnique({ where: { id: vid } })))
                throw new errors_1.AppError('NOT_FOUND', 'Vehicle not found.');
            await (0, links_1.linkVehicle)(tx, vid, 'Incident', incidentId, 'INVOLVED');
        }
    }
    async attachRecords(actor, id, d) {
        await this.get(id);
        return this.prisma.$transaction(async (tx) => {
            await this.attach(tx, id, d.personIds, d.vehicleIds, actor);
            await this.audit.record(actor, { action: 'incident.attach', module: 'incidents', entityType: 'Incident', entityId: id, after: d }, tx);
        });
    }
    async update(actor, id, version, d) {
        await this.locks.assertFree('incident', id, actor.userId);
        return this.prisma.$transaction(async (tx) => {
            const before = await tx.incident.findUnique({ where: { id } });
            if (!before)
                throw new errors_1.AppError('NOT_FOUND', 'Incident not found.');
            if ((await tx.incident.updateMany({ where: { id, version }, data: { ...d, version: { increment: 1 } } })).count === 0)
                throw new errors_1.AppError('CONFLICT', 'The record was modified by someone else. Reload and retry.');
            const after = await tx.incident.findUniqueOrThrow({ where: { id } });
            await this.timeline.add(tx, { entityType: 'Incident', entityId: id, action: 'incident.updated', summary: 'Incident updated', actorId: actor.userId });
            await this.audit.record(actor, { action: 'incident.update', module: 'incidents', entityType: 'Incident', entityId: id, before, after }, tx);
            return after;
        });
    }
    async setStatus(actor, id, to, note) {
        return this.prisma.$transaction(async (tx) => {
            const inc = await tx.incident.findUnique({ where: { id } });
            if (!inc)
                throw new errors_1.AppError('NOT_FOUND', 'Incident not found.');
            (0, transition_1.nextStatus)(shared_1.DISPATCH_TRANSITIONS, inc.status, to);
            const closing = to === 'CLOSED' || to === 'CANCELLED';
            const after = await tx.incident.update({ where: { id }, data: { status: to, closedAt: closing ? new Date() : null, version: { increment: 1 } } });
            if (closing) {
                await tx.incidentUnit.updateMany({ where: { incidentId: id, clearedAt: null }, data: { clearedAt: new Date() } });
                const unitIds = (await tx.incidentUnit.findMany({ where: { incidentId: id } })).map((x) => x.unitId);
                await tx.unit.updateMany({ where: { id: { in: unitIds }, status: { not: 'OFF_DUTY' } }, data: { status: 'AVAILABLE' } });
            }
            await this.timeline.add(tx, { entityType: 'Incident', entityId: id, action: 'incident.status', summary: `Status ${inc.status} → ${to}${note ? `: ${note}` : ''}`, actorId: actor.userId });
            await this.audit.record(actor, { action: 'incident.status', module: 'dispatch', entityType: 'Incident', entityId: id, before: { status: inc.status }, after: { status: to }, reason: note }, tx);
            return after;
        }).then((after) => { this.rt.publish('incidents', 'incident.status', { id, status: to }); this.rt.publish('dispatch', 'queue.changed', { id }); return after; });
    }
    async assignUnit(actor, id, unitId) {
        return this.prisma.$transaction(async (tx) => {
            const inc = await tx.incident.findUnique({ where: { id } });
            if (!inc)
                throw new errors_1.AppError('NOT_FOUND', 'Incident not found.');
            if (OPEN.includes(inc.status))
                throw new errors_1.AppError('INVALID_TRANSITION', 'Incident is closed.');
            const unit = await tx.unit.findUnique({ where: { id: unitId }, include: { members: true } });
            if (!unit)
                throw new errors_1.AppError('NOT_FOUND', 'Unit not found.');
            if (unit.status === 'OFF_DUTY' || unit.status === 'UNAVAILABLE')
                throw new errors_1.AppError('CONFLICT', 'Unit is not available.');
            await tx.incidentUnit.upsert({ where: { incidentId_unitId: { incidentId: id, unitId } }, create: { incidentId: id, unitId }, update: { clearedAt: null } });
            await tx.unit.update({ where: { id: unitId }, data: { status: 'BUSY' } });
            if (['NEW', 'ACKNOWLEDGED'].includes(inc.status))
                await tx.incident.update({ where: { id }, data: { status: 'ASSIGNED', version: { increment: 1 } } });
            await this.timeline.add(tx, { entityType: 'Incident', entityId: id, action: 'incident.unit_assigned', summary: `Unit ${unit.callsign} assigned`, actorId: actor.userId });
            await this.audit.record(actor, { action: 'incident.assign', module: 'dispatch', entityType: 'Incident', entityId: id, after: { unitId, callsign: unit.callsign } }, tx);
            if (unit.members.length)
                await tx.notification.createMany({ data: unit.members.map((m) => ({ userId: m.userId, type: 'INCIDENT_ASSIGNMENT', title: `Assigned to ${inc.number}`, entityType: 'Incident', entityId: id })) });
            return tx.incident.findUniqueOrThrow({ where: { id }, include: { units: true } });
        }).then(async (r) => {
            this.rt.publish('dispatch', 'unit.assigned', { incidentId: id, unitId });
            const [inc, unit] = await Promise.all([this.prisma.incident.findUnique({ where: { id } }), this.prisma.unit.findUnique({ where: { id: unitId } })]);
            if (inc && unit)
                await this.discord.enqueue('dispatch', 'incident.assigned', { number: inc.number, title: inc.title, priority: inc.priority, callsign: unit.callsign, location: inc.location });
            return r;
        });
    }
};
exports.DispatchService = DispatchService;
exports.DispatchService = DispatchService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, timeline_service_1.TimelineService, realtime_service_1.RealtimeService, discord_service_1.DiscordService, locks_service_1.LocksService])
], DispatchService);
//# sourceMappingURL=dispatch.service.js.map