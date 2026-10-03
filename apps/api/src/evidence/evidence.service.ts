import { Injectable } from '@nestjs/common';
import { EVIDENCE_TRANSITIONS, EvidenceCustodyState } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { AppError } from '../common/errors';
import { linkPerson } from '../common/links';
import { makeNumber } from '../common/numbering';
import { nextStatus } from '../common/transition';
import { PageQuery, pageResult, skipTake } from '../common/pagination';

@Injectable()
export class EvidenceService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly timeline: TimelineService) {}

  async list(p: PageQuery) {
    const where = p.q ? { OR: [{ number: { contains: p.q.toUpperCase() } }, { description: { contains: p.q, mode: 'insensitive' as const } }, { caseRef: p.q.toUpperCase() }] } : {};
    const [items, total] = await Promise.all([this.prisma.evidence.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(p) }), this.prisma.evidence.count({ where })]);
    return pageResult(items, total, p);
  }

  async get(id: string) {
    const e = await this.prisma.evidence.findUnique({ where: { id }, include: { transfers: { orderBy: { createdAt: 'asc' } } } });
    if (!e) throw new AppError('NOT_FOUND', 'Evidence not found.');
    return e;
  }

  async create(actor: Actor, d: { type: string; description: string; source?: string; caseRef?: string; storageLocation?: string; personIds?: string[] }) {
    return this.prisma.$transaction(async (tx) => {
      if (d.caseRef && !(await tx.investigation.findUnique({ where: { caseNumber: d.caseRef } }))) throw new AppError('NOT_FOUND', 'Case not found.');
      const e = await tx.evidence.create({ data: { number: makeNumber('E'), type: d.type, description: d.description, source: d.source, caseRef: d.caseRef, storageLocation: d.storageLocation, ownerId: actor.userId } });
      await tx.evidenceTransfer.create({ data: { evidenceId: e.id, toUserId: actor.userId, fromState: 'COLLECTED', toState: 'COLLECTED', reason: 'Initial collection', confirmed: true } });
      for (const pid of new Set(d.personIds ?? [])) {
        if (!(await tx.person.findUnique({ where: { id: pid } }))) throw new AppError('NOT_FOUND', 'Person not found.');
        await linkPerson(tx, pid, 'Evidence', e.id, 'RELATED');
        await this.timeline.add(tx, { entityType: 'Person', entityId: pid, action: 'evidence.added', summary: `Evidence ${e.number} added`, actorId: actor.userId });
      }
      await this.timeline.add(tx, { entityType: 'Evidence', entityId: e.id, action: 'evidence.collected', summary: `Evidence ${e.number} collected`, actorId: actor.userId });
      await this.audit.record(actor, { action: 'evidence.create', module: 'evidence', entityType: 'Evidence', entityId: e.id, after: e }, tx);
      return e;
    });
  }

  /** Chain of Custody: jede Zustandsänderung/Übergabe wird als unveränderlicher Transfer festgehalten. */
  async transfer(actor: Actor, id: string, d: { to: EvidenceCustodyState; toUserId?: string; reason: string; storageLocation?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.evidence.findUnique({ where: { id } });
      if (!e) throw new AppError('NOT_FOUND', 'Evidence not found.');
      nextStatus(EVIDENCE_TRANSITIONS, e.custodyState, d.to);
      if (d.to === 'TRANSFERRED' && !d.toUserId) throw new AppError('VALIDATION_FAILED', 'toUserId is required for a transfer.');
      if (d.toUserId && !(await tx.user.findUnique({ where: { id: d.toUserId, active: true } }))) throw new AppError('NOT_FOUND', 'Recipient not found.');
      const after = await tx.evidence.update({ where: { id }, data: { custodyState: d.to, ownerId: d.toUserId ?? e.ownerId, storageLocation: d.storageLocation ?? e.storageLocation, version: { increment: 1 } } });
      await tx.evidenceTransfer.create({ data: { evidenceId: id, fromUserId: e.ownerId, toUserId: d.toUserId ?? e.ownerId, fromState: e.custodyState, toState: d.to, reason: d.reason, confirmed: !d.toUserId || d.toUserId === actor.userId } });
      await this.timeline.add(tx, { entityType: 'Evidence', entityId: id, action: `evidence.${d.to.toLowerCase()}`, summary: `${e.number}: ${e.custodyState} → ${d.to}`, actorId: actor.userId });
      await this.audit.record(actor, { action: `evidence.${d.to.toLowerCase()}`, module: 'evidence', entityType: 'Evidence', entityId: id, before: { state: e.custodyState, ownerId: e.ownerId }, after: { state: d.to, ownerId: after.ownerId }, reason: d.reason }, tx);
      return after;
    });
  }

  /** Empfänger bestätigt die Übergabe. */
  async confirm(actor: Actor, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.evidenceTransfer.findFirst({ where: { evidenceId: id, confirmed: false, toUserId: actor.userId }, orderBy: { createdAt: 'desc' } });
      if (!t) throw new AppError('NOT_FOUND', 'No pending transfer for you.');
      await tx.evidenceTransfer.update({ where: { id: t.id }, data: { confirmed: true } });
      await this.audit.record(actor, { action: 'evidence.confirm', module: 'evidence', entityType: 'Evidence', entityId: id, after: { transferId: t.id } }, tx);
      return { confirmed: true };
    });
  }
}
