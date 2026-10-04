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
exports.EvidenceService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const timeline_service_1 = require("../timeline/timeline.service");
const errors_1 = require("../common/errors");
const links_1 = require("../common/links");
const numbering_1 = require("../common/numbering");
const transition_1 = require("../common/transition");
const pagination_1 = require("../common/pagination");
let EvidenceService = class EvidenceService {
    prisma;
    audit;
    timeline;
    constructor(prisma, audit, timeline) {
        this.prisma = prisma;
        this.audit = audit;
        this.timeline = timeline;
    }
    async list(p) {
        const where = p.q ? { OR: [{ number: { contains: p.q.toUpperCase() } }, { description: { contains: p.q, mode: 'insensitive' } }, { caseRef: p.q.toUpperCase() }] } : {};
        const [items, total] = await Promise.all([this.prisma.evidence.findMany({ where, orderBy: { createdAt: 'desc' }, ...(0, pagination_1.skipTake)(p) }), this.prisma.evidence.count({ where })]);
        return (0, pagination_1.pageResult)(items, total, p);
    }
    async get(id) {
        const e = await this.prisma.evidence.findUnique({ where: { id }, include: { transfers: { orderBy: { createdAt: 'asc' } } } });
        if (!e)
            throw new errors_1.AppError('NOT_FOUND', 'Evidence not found.');
        return e;
    }
    async create(actor, d) {
        return this.prisma.$transaction(async (tx) => {
            if (d.caseRef && !(await tx.investigation.findUnique({ where: { caseNumber: d.caseRef } })))
                throw new errors_1.AppError('NOT_FOUND', 'Case not found.');
            const e = await tx.evidence.create({ data: { number: (0, numbering_1.makeNumber)('E'), type: d.type, description: d.description, source: d.source, caseRef: d.caseRef, storageLocation: d.storageLocation, ownerId: actor.userId } });
            await tx.evidenceTransfer.create({ data: { evidenceId: e.id, toUserId: actor.userId, fromState: 'COLLECTED', toState: 'COLLECTED', reason: 'Initial collection', confirmed: true } });
            for (const pid of new Set(d.personIds ?? [])) {
                if (!(await tx.person.findUnique({ where: { id: pid } })))
                    throw new errors_1.AppError('NOT_FOUND', 'Person not found.');
                await (0, links_1.linkPerson)(tx, pid, 'Evidence', e.id, 'RELATED');
                await this.timeline.add(tx, { entityType: 'Person', entityId: pid, action: 'evidence.added', summary: `Evidence ${e.number} added`, actorId: actor.userId });
            }
            await this.timeline.add(tx, { entityType: 'Evidence', entityId: e.id, action: 'evidence.collected', summary: `Evidence ${e.number} collected`, actorId: actor.userId });
            await this.audit.record(actor, { action: 'evidence.create', module: 'evidence', entityType: 'Evidence', entityId: e.id, after: e }, tx);
            return e;
        });
    }
    /** Chain of Custody: jede Zustandsänderung/Übergabe wird als unveränderlicher Transfer festgehalten. */
    async transfer(actor, id, d) {
        return this.prisma.$transaction(async (tx) => {
            const e = await tx.evidence.findUnique({ where: { id } });
            if (!e)
                throw new errors_1.AppError('NOT_FOUND', 'Evidence not found.');
            (0, transition_1.nextStatus)(shared_1.EVIDENCE_TRANSITIONS, e.custodyState, d.to);
            if (d.to === 'TRANSFERRED' && !d.toUserId)
                throw new errors_1.AppError('VALIDATION_FAILED', 'toUserId is required for a transfer.');
            if (d.toUserId && !(await tx.user.findUnique({ where: { id: d.toUserId, active: true } })))
                throw new errors_1.AppError('NOT_FOUND', 'Recipient not found.');
            const after = await tx.evidence.update({ where: { id }, data: { custodyState: d.to, ownerId: d.toUserId ?? e.ownerId, storageLocation: d.storageLocation ?? e.storageLocation, version: { increment: 1 } } });
            await tx.evidenceTransfer.create({ data: { evidenceId: id, fromUserId: e.ownerId, toUserId: d.toUserId ?? e.ownerId, fromState: e.custodyState, toState: d.to, reason: d.reason, confirmed: !d.toUserId || d.toUserId === actor.userId } });
            await this.timeline.add(tx, { entityType: 'Evidence', entityId: id, action: `evidence.${d.to.toLowerCase()}`, summary: `${e.number}: ${e.custodyState} → ${d.to}`, actorId: actor.userId });
            await this.audit.record(actor, { action: `evidence.${d.to.toLowerCase()}`, module: 'evidence', entityType: 'Evidence', entityId: id, before: { state: e.custodyState, ownerId: e.ownerId }, after: { state: d.to, ownerId: after.ownerId }, reason: d.reason }, tx);
            return after;
        });
    }
    /** Empfänger bestätigt die Übergabe. */
    async confirm(actor, id) {
        return this.prisma.$transaction(async (tx) => {
            const t = await tx.evidenceTransfer.findFirst({ where: { evidenceId: id, confirmed: false, toUserId: actor.userId }, orderBy: { createdAt: 'desc' } });
            if (!t)
                throw new errors_1.AppError('NOT_FOUND', 'No pending transfer for you.');
            await tx.evidenceTransfer.update({ where: { id: t.id }, data: { confirmed: true } });
            await this.audit.record(actor, { action: 'evidence.confirm', module: 'evidence', entityType: 'Evidence', entityId: id, after: { transferId: t.id } }, tx);
            return { confirmed: true };
        });
    }
};
exports.EvidenceService = EvidenceService;
exports.EvidenceService = EvidenceService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, timeline_service_1.TimelineService])
], EvidenceService);
//# sourceMappingURL=evidence.service.js.map