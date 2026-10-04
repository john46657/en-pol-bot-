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
exports.ComplaintsService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const timeline_service_1 = require("../timeline/timeline.service");
const permission_service_1 = require("../authz/permission.service");
const errors_1 = require("../common/errors");
const links_1 = require("../common/links");
const numbering_1 = require("../common/numbering");
const transition_1 = require("../common/transition");
const pagination_1 = require("../common/pagination");
let ComplaintsService = class ComplaintsService {
    prisma;
    audit;
    timeline;
    perms;
    constructor(prisma, audit, timeline, perms) {
        this.prisma = prisma;
        this.audit = audit;
        this.timeline = timeline;
        this.perms = perms;
    }
    /** Interne Notizen/Findings nur für Ermittler. */
    async shape(userId, c) {
        if (await this.perms.has(userId, 'complaints.investigate'))
            return c;
        return { ...c, internalNotes: undefined, findings: undefined };
    }
    async list(actor, p, status) {
        const where = { ...(status ? { status } : {}), ...(p.q ? { OR: [{ number: { contains: p.q.toUpperCase() } }, { category: { contains: p.q, mode: 'insensitive' } }] } : {}) };
        const [rows, total] = await Promise.all([this.prisma.complaint.findMany({ where, orderBy: { createdAt: 'desc' }, ...(0, pagination_1.skipTake)(p) }), this.prisma.complaint.count({ where })]);
        return (0, pagination_1.pageResult)(await Promise.all(rows.map((c) => this.shape(actor.userId, c))), total, p);
    }
    async get(actor, id) {
        const c = await this.prisma.complaint.findUnique({ where: { id } });
        if (!c)
            throw new errors_1.AppError('NOT_FOUND', 'Complaint not found.');
        return { complaint: await this.shape(actor.userId, c), timeline: await this.timeline.list('Complaint', id) };
    }
    async create(actor, d) {
        return this.prisma.$transaction(async (tx) => {
            for (const pid of [d.complainantId, d.subjectId])
                if (pid && !(await tx.person.findUnique({ where: { id: pid } })))
                    throw new errors_1.AppError('NOT_FOUND', 'Person not found.');
            if (d.officerId && !(await tx.user.findUnique({ where: { id: d.officerId } })))
                throw new errors_1.AppError('NOT_FOUND', 'Officer not found.');
            const c = await tx.complaint.create({ data: { number: (0, numbering_1.makeNumber)('C'), ...d } });
            if (d.complainantId)
                await (0, links_1.linkPerson)(tx, d.complainantId, 'Complaint', c.id, 'COMPLAINANT');
            if (d.subjectId)
                await (0, links_1.linkPerson)(tx, d.subjectId, 'Complaint', c.id, 'SUBJECT');
            for (const pid of new Set([d.complainantId, d.subjectId].filter(Boolean))) {
                await this.timeline.add(tx, { entityType: 'Person', entityId: pid, action: 'complaint.created', summary: `Complaint ${c.number} filed`, actorId: actor.userId });
            }
            await this.timeline.add(tx, { entityType: 'Complaint', entityId: c.id, action: 'complaint.created', summary: `Complaint ${c.number} received`, actorId: actor.userId });
            await this.audit.record(actor, { action: 'complaint.create', module: 'complaints', entityType: 'Complaint', entityId: c.id, after: { number: c.number, category: c.category } }, tx);
            return { id: c.id, number: c.number, status: c.status };
        });
    }
    async transition(actor, id, to, d = {}) {
        return this.prisma.$transaction(async (tx) => {
            const c = await tx.complaint.findUnique({ where: { id } });
            if (!c)
                throw new errors_1.AppError('NOT_FOUND', 'Complaint not found.');
            (0, transition_1.nextStatus)(shared_1.COMPLAINT_TRANSITIONS, c.status, to);
            if (to === 'ASSIGNED') {
                if (!d.investigatorId)
                    throw new errors_1.AppError('VALIDATION_FAILED', 'investigatorId is required.');
                if (!(await tx.user.findUnique({ where: { id: d.investigatorId } })))
                    throw new errors_1.AppError('NOT_FOUND', 'Investigator not found.');
                if (d.investigatorId === c.officerId)
                    throw new errors_1.AppError('CONFLICT', 'The investigator cannot be the officer involved.');
            }
            if (to === 'RESOLVED' && !(d.resolution ?? c.resolution))
                throw new errors_1.AppError('VALIDATION_FAILED', 'A resolution is required.');
            const after = await tx.complaint.update({ where: { id }, data: { status: to, investigatorId: d.investigatorId ?? c.investigatorId, findings: d.findings ?? c.findings, resolution: d.resolution ?? c.resolution, internalNotes: d.internalNotes ?? c.internalNotes, version: { increment: 1 } } });
            await this.timeline.add(tx, { entityType: 'Complaint', entityId: id, action: `complaint.${to.toLowerCase()}`, summary: `${c.number}: ${c.status} → ${to}`, actorId: actor.userId });
            await this.audit.record(actor, { action: 'complaint.status', module: 'complaints', entityType: 'Complaint', entityId: id, before: { status: c.status }, after: { status: to, investigatorId: after.investigatorId } }, tx);
            if (to === 'ASSIGNED')
                await tx.notification.create({ data: { userId: d.investigatorId, type: 'COMPLAINT_ASSIGNMENT', title: `Complaint ${c.number} assigned to you`, entityType: 'Complaint', entityId: id } });
            return { id: after.id, status: after.status };
        });
    }
};
exports.ComplaintsService = ComplaintsService;
exports.ComplaintsService = ComplaintsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, timeline_service_1.TimelineService, permission_service_1.PermissionService])
], ComplaintsService);
//# sourceMappingURL=complaints.service.js.map