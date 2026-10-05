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
exports.InvestigationsService = exports.INVESTIGATION_ROLES = void 0;
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
exports.INVESTIGATION_ROLES = ['SUSPECT', 'WITNESS', 'VICTIM', 'PERSON_OF_INTEREST'];
let InvestigationsService = class InvestigationsService {
    prisma;
    audit;
    timeline;
    constructor(prisma, audit, timeline) {
        this.prisma = prisma;
        this.audit = audit;
        this.timeline = timeline;
    }
    async list(p, status) {
        const where = { ...(status ? { status } : {}), ...(p.q ? { OR: [{ caseNumber: { contains: p.q.toUpperCase() } }, { title: { contains: p.q, mode: 'insensitive' } }] } : {}) };
        const [items, total] = await Promise.all([this.prisma.investigation.findMany({ where, orderBy: { createdAt: 'desc' }, ...(0, pagination_1.skipTake)(p) }), this.prisma.investigation.count({ where })]);
        return (0, pagination_1.pageResult)(items, total, p);
    }
    async get(id) {
        const inv = await this.prisma.investigation.findUnique({ where: { id } });
        if (!inv)
            throw new errors_1.AppError('NOT_FOUND', 'Investigation not found.');
        const [links, evidence, timeline] = await Promise.all([
            this.prisma.recordLink.findMany({ where: { entityType: 'Investigation', entityId: id } }),
            this.prisma.evidence.findMany({ where: { caseRef: inv.caseNumber }, select: { id: true, number: true, type: true, custodyState: true } }),
            this.timeline.list('Investigation', id),
        ]);
        return { investigation: inv, links, evidence, timeline };
    }
    async create(actor, d) {
        return this.prisma.$transaction(async (tx) => {
            const inv = await tx.investigation.create({ data: { caseNumber: (0, numbering_1.makeNumber)('CASE'), title: d.title, description: d.description, leadId: d.leadId ?? actor.userId } });
            for (const { personId, role } of d.persons ?? []) {
                if (!(await tx.person.findUnique({ where: { id: personId } })))
                    throw new errors_1.AppError('NOT_FOUND', 'Person not found.');
                await (0, links_1.linkPerson)(tx, personId, 'Investigation', inv.id, role);
                await this.timeline.add(tx, { entityType: 'Person', entityId: personId, action: 'investigation.linked', summary: `Linked to ${inv.caseNumber} as ${role}`, actorId: actor.userId });
            }
            await this.timeline.add(tx, { entityType: 'Investigation', entityId: inv.id, action: 'investigation.opened', summary: `Case ${inv.caseNumber} opened`, actorId: actor.userId });
            await this.audit.record(actor, { action: 'investigation.create', module: 'investigations', entityType: 'Investigation', entityId: inv.id, after: inv }, tx);
            return inv;
        });
    }
    async addPerson(actor, id, personId, role) {
        await this.get(id);
        return this.prisma.$transaction(async (tx) => {
            if (!(await tx.person.findUnique({ where: { id: personId } })))
                throw new errors_1.AppError('NOT_FOUND', 'Person not found.');
            await (0, links_1.linkPerson)(tx, personId, 'Investigation', id, role);
            await this.timeline.add(tx, { entityType: 'Investigation', entityId: id, action: 'investigation.person_added', summary: `Person added as ${role}`, actorId: actor.userId });
            await this.audit.record(actor, { action: 'investigation.person.add', module: 'investigations', entityType: 'Investigation', entityId: id, after: { personId, role } }, tx);
        });
    }
    async setStatus(actor, id, to, reason) {
        return this.prisma.$transaction(async (tx) => {
            const inv = await tx.investigation.findUnique({ where: { id } });
            if (!inv)
                throw new errors_1.AppError('NOT_FOUND', 'Investigation not found.');
            (0, transition_1.nextStatus)(shared_1.INVESTIGATION_TRANSITIONS, inv.status, to);
            const after = await tx.investigation.update({ where: { id }, data: { status: to, version: { increment: 1 } } });
            await this.timeline.add(tx, { entityType: 'Investigation', entityId: id, action: `investigation.${to.toLowerCase()}`, summary: `${inv.caseNumber}: ${inv.status} → ${to}`, actorId: actor.userId });
            await this.audit.record(actor, { action: 'investigation.status', module: 'investigations', entityType: 'Investigation', entityId: id, before: { status: inv.status }, after: { status: to }, reason }, tx);
            return after;
        });
    }
};
exports.InvestigationsService = InvestigationsService;
exports.InvestigationsService = InvestigationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, timeline_service_1.TimelineService])
], InvestigationsService);
//# sourceMappingURL=investigations.service.js.map