import { Injectable } from '@nestjs/common';
import { assertTransition, TICKET_TRANSITIONS, TicketStatus } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { AppError } from '../common/errors';
import { linkPerson } from '../common/links';
import { makeNumber } from '../common/numbering';
import { PageQuery, pageResult, skipTake } from '../common/pagination';

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly timeline: TimelineService) {}

  async list(p: PageQuery, personId?: string) {
    const where = { ...(personId ? { personId } : {}), ...(p.q ? { OR: [{ number: { contains: p.q.toUpperCase() } }, { reason: { contains: p.q, mode: 'insensitive' as const } }] } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.ticket.findMany({ where, include: { person: { select: { id: true, robloxUsername: true } } }, orderBy: { issuedAt: 'desc' }, ...skipTake(p) }),
      this.prisma.ticket.count({ where }),
    ]);
    return pageResult(items, total, p);
  }

  async get(id: string) {
    const t = await this.prisma.ticket.findUnique({ where: { id }, include: { person: true, legalCode: true } });
    if (!t) throw new AppError('NOT_FOUND', 'Ticket not found.');
    return { ticket: t, timeline: await this.timeline.list('Ticket', id) };
  }

  /** Ticket + Personenverknüpfung + Timeline + Audit + Notification in EINER Transaktion. */
  async create(actor: Actor, d: { personId: string; legalCodeId?: string; reason: string; amount?: number; notes?: string; reportId?: string }) {
    if (!actor.userId) throw new AppError('UNAUTHENTICATED', 'Authentication required.');
    const officerId = actor.userId;
    return this.prisma.$transaction(async (tx) => {
      const person = await tx.person.findUnique({ where: { id: d.personId } });
      if (!person || person.status !== 'ACTIVE') throw new AppError('NOT_FOUND', 'Person not found.');
      let amount = d.amount;
      if (d.legalCodeId) {
        const code = await tx.legalCode.findUnique({ where: { id: d.legalCodeId } });
        const now = new Date();
        if (!code || !code.active || code.effectiveDate > now || (code.expiresAt && code.expiresAt < now)) throw new AppError('VALIDATION_FAILED', 'Legal code is not active.');
        if (amount === undefined) amount = Number((code.penalty as { fine?: number }).fine ?? 0);
      }
      const ticket = await tx.ticket.create({ data: { number: makeNumber('T'), personId: d.personId, officerId, legalCodeId: d.legalCodeId, reason: d.reason, amount: amount ?? 0, notes: d.notes, reportId: d.reportId } });
      await linkPerson(tx, d.personId, 'Ticket', ticket.id, 'SUBJECT');
      await this.timeline.add(tx, { entityType: 'Ticket', entityId: ticket.id, action: 'ticket.created', summary: `Ticket ${ticket.number} issued`, actorId: officerId });
      await this.timeline.add(tx, { entityType: 'Person', entityId: d.personId, action: 'ticket.created', summary: `Ticket ${ticket.number} issued`, actorId: officerId });
      await this.audit.record(actor, { action: 'ticket.create', module: 'tickets', entityType: 'Ticket', entityId: ticket.id, after: ticket }, tx);
      await tx.notification.create({ data: { userId: officerId, type: 'TICKET_ISSUED', title: `Ticket ${ticket.number} issued`, entityType: 'Ticket', entityId: ticket.id } });
      return ticket;
    });
  }

  async void(actor: Actor, id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.ticket.findUnique({ where: { id } });
      if (!t) throw new AppError('NOT_FOUND', 'Ticket not found.');
      assertTransition(TICKET_TRANSITIONS, t.status as TicketStatus, 'VOID');
      const after = await tx.ticket.update({ where: { id }, data: { status: 'VOID', voidReason: reason, voidedById: actor.userId, version: { increment: 1 } } });
      await this.timeline.add(tx, { entityType: 'Ticket', entityId: id, action: 'ticket.voided', summary: `Ticket ${t.number} voided`, actorId: actor.userId });
      await this.timeline.add(tx, { entityType: 'Person', entityId: t.personId, action: 'ticket.voided', summary: `Ticket ${t.number} voided`, actorId: actor.userId });
      await this.audit.record(actor, { action: 'ticket.void', module: 'tickets', entityType: 'Ticket', entityId: id, before: { status: t.status }, after: { status: after.status }, reason }, tx);
      return after;
    });
  }
}
