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
exports.TicketsService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const timeline_service_1 = require("../timeline/timeline.service");
const errors_1 = require("../common/errors");
const links_1 = require("../common/links");
const numbering_1 = require("../common/numbering");
const pagination_1 = require("../common/pagination");
let TicketsService = class TicketsService {
    prisma;
    audit;
    timeline;
    constructor(prisma, audit, timeline) {
        this.prisma = prisma;
        this.audit = audit;
        this.timeline = timeline;
    }
    async list(p, personId) {
        const where = { ...(personId ? { personId } : {}), ...(p.q ? { OR: [{ number: { contains: p.q.toUpperCase() } }, { reason: { contains: p.q, mode: 'insensitive' } }] } : {}) };
        const [items, total] = await Promise.all([
            this.prisma.ticket.findMany({ where, include: { person: { select: { id: true, robloxUsername: true } } }, orderBy: { issuedAt: 'desc' }, ...(0, pagination_1.skipTake)(p) }),
            this.prisma.ticket.count({ where }),
        ]);
        return (0, pagination_1.pageResult)(items, total, p);
    }
    async get(id) {
        const t = await this.prisma.ticket.findUnique({ where: { id }, include: { person: true, legalCode: true } });
        if (!t)
            throw new errors_1.AppError('NOT_FOUND', 'Ticket nicht gefunden.');
        return { ticket: t, timeline: await this.timeline.list('Ticket', id) };
    }
    /** Ticket + Personenverknüpfung + Timeline + Audit + Notification in EINER Transaktion. */
    async create(actor, d) {
        if (!actor.userId)
            throw new errors_1.AppError('UNAUTHENTICATED', 'Bitte melde dich an.');
        const officerId = actor.userId;
        return this.prisma.$transaction(async (tx) => {
            const person = await tx.person.findUnique({ where: { id: d.personId } });
            if (!person || person.status !== 'ACTIVE')
                throw new errors_1.AppError('NOT_FOUND', 'Person nicht gefunden.');
            let amount = d.amount;
            if (d.legalCodeId) {
                const code = await tx.legalCode.findUnique({ where: { id: d.legalCodeId } });
                const now = new Date();
                if (!code || !code.active || code.effectiveDate > now || (code.expiresAt && code.expiresAt < now))
                    throw new errors_1.AppError('VALIDATION_FAILED', 'Dieser Tatbestand ist nicht aktiv.');
                if (amount === undefined)
                    amount = Number(code.penalty.fine ?? 0);
            }
            const ticket = await tx.ticket.create({ data: { number: (0, numbering_1.makeNumber)('T'), personId: d.personId, officerId, legalCodeId: d.legalCodeId, reason: d.reason, amount: amount ?? 0, notes: d.notes, reportId: d.reportId } });
            await (0, links_1.linkPerson)(tx, d.personId, 'Ticket', ticket.id, 'SUBJECT');
            await this.timeline.add(tx, { entityType: 'Ticket', entityId: ticket.id, action: 'ticket.created', summary: `Strafzettel ${ticket.number} ausgestellt`, actorId: officerId });
            await this.timeline.add(tx, { entityType: 'Person', entityId: d.personId, action: 'ticket.created', summary: `Strafzettel ${ticket.number} ausgestellt`, actorId: officerId });
            await this.audit.record(actor, { action: 'ticket.create', module: 'tickets', entityType: 'Ticket', entityId: ticket.id, after: ticket }, tx);
            await tx.notification.create({ data: { userId: officerId, type: 'TICKET_ISSUED', title: `Strafzettel ${ticket.number} ausgestellt`, entityType: 'Ticket', entityId: ticket.id } });
            return ticket;
        });
    }
    async void(actor, id, reason) {
        return this.prisma.$transaction(async (tx) => {
            const t = await tx.ticket.findUnique({ where: { id } });
            if (!t)
                throw new errors_1.AppError('NOT_FOUND', 'Ticket nicht gefunden.');
            (0, shared_1.assertTransition)(shared_1.TICKET_TRANSITIONS, t.status, 'VOID');
            const after = await tx.ticket.update({ where: { id }, data: { status: 'VOID', voidReason: reason, voidedById: actor.userId, version: { increment: 1 } } });
            await this.timeline.add(tx, { entityType: 'Ticket', entityId: id, action: 'ticket.voided', summary: `Strafzettel ${t.number} storniert`, actorId: actor.userId });
            await this.timeline.add(tx, { entityType: 'Person', entityId: t.personId, action: 'ticket.voided', summary: `Strafzettel ${t.number} storniert`, actorId: actor.userId });
            await this.audit.record(actor, { action: 'ticket.void', module: 'tickets', entityType: 'Ticket', entityId: id, before: { status: t.status }, after: { status: after.status }, reason }, tx);
            return after;
        });
    }
};
exports.TicketsService = TicketsService;
exports.TicketsService = TicketsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, timeline_service_1.TimelineService])
], TicketsService);
//# sourceMappingURL=tickets.service.js.map