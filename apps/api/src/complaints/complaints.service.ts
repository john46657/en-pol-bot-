import { Injectable } from '@nestjs/common';
import { COMPLAINT_TRANSITIONS, ComplaintStatus } from '@enrp/shared';
import { Complaint } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { PermissionService } from '../authz/permission.service';
import { AppError } from '../common/errors';
import { linkPerson } from '../common/links';
import { makeNumber } from '../common/numbering';
import { nextStatus } from '../common/transition';
import { PageQuery, pageResult, skipTake } from '../common/pagination';

@Injectable()
export class ComplaintsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly timeline: TimelineService, private readonly perms: PermissionService) {}

  /** Interne Notizen/Findings nur für Ermittler. */
  private async shape(userId: string, c: Complaint) {
    if (await this.perms.has(userId, 'complaints.investigate')) return c;
    return { ...c, internalNotes: undefined, findings: undefined };
  }

  async list(actor: Actor, p: PageQuery, status?: string) {
    const where = { ...(status ? { status } : {}), ...(p.q ? { OR: [{ number: { contains: p.q.toUpperCase() } }, { category: { contains: p.q, mode: 'insensitive' as const } }] } : {}) };
    const [rows, total] = await Promise.all([this.prisma.complaint.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(p) }), this.prisma.complaint.count({ where })]);
    return pageResult(await Promise.all(rows.map((c) => this.shape(actor.userId!, c))), total, p);
  }

  async get(actor: Actor, id: string) {
    const c = await this.prisma.complaint.findUnique({ where: { id } });
    if (!c) throw new AppError('NOT_FOUND', 'Complaint not found.');
    return { complaint: await this.shape(actor.userId!, c), timeline: await this.timeline.list('Complaint', id) };
  }

  async create(actor: Actor, d: { complainantId?: string; subjectId?: string; officerId?: string; category: string; description: string }) {
    return this.prisma.$transaction(async (tx) => {
      for (const pid of [d.complainantId, d.subjectId]) if (pid && !(await tx.person.findUnique({ where: { id: pid } }))) throw new AppError('NOT_FOUND', 'Person not found.');
      if (d.officerId && !(await tx.user.findUnique({ where: { id: d.officerId } }))) throw new AppError('NOT_FOUND', 'Officer not found.');
      const c = await tx.complaint.create({ data: { number: makeNumber('C'), ...d } });
      if (d.complainantId) await linkPerson(tx, d.complainantId, 'Complaint', c.id, 'COMPLAINANT');
      if (d.subjectId) await linkPerson(tx, d.subjectId, 'Complaint', c.id, 'SUBJECT');
      for (const pid of new Set([d.complainantId, d.subjectId].filter(Boolean) as string[])) {
        await this.timeline.add(tx, { entityType: 'Person', entityId: pid, action: 'complaint.created', summary: `Complaint ${c.number} filed`, actorId: actor.userId });
      }
      await this.timeline.add(tx, { entityType: 'Complaint', entityId: c.id, action: 'complaint.created', summary: `Complaint ${c.number} received`, actorId: actor.userId });
      await this.audit.record(actor, { action: 'complaint.create', module: 'complaints', entityType: 'Complaint', entityId: c.id, after: { number: c.number, category: c.category } }, tx);
      return { id: c.id, number: c.number, status: c.status };
    });
  }

  async transition(actor: Actor, id: string, to: ComplaintStatus, d: { investigatorId?: string; findings?: string; resolution?: string; internalNotes?: string } = {}) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.complaint.findUnique({ where: { id } });
      if (!c) throw new AppError('NOT_FOUND', 'Complaint not found.');
      nextStatus(COMPLAINT_TRANSITIONS, c.status, to);
      if (to === 'ASSIGNED') {
        if (!d.investigatorId) throw new AppError('VALIDATION_FAILED', 'investigatorId is required.');
        if (!(await tx.user.findUnique({ where: { id: d.investigatorId } }))) throw new AppError('NOT_FOUND', 'Investigator not found.');
        if (d.investigatorId === c.officerId) throw new AppError('CONFLICT', 'The investigator cannot be the officer involved.');
      }
      if (to === 'RESOLVED' && !(d.resolution ?? c.resolution)) throw new AppError('VALIDATION_FAILED', 'A resolution is required.');
      const after = await tx.complaint.update({ where: { id }, data: { status: to, investigatorId: d.investigatorId ?? c.investigatorId, findings: d.findings ?? c.findings, resolution: d.resolution ?? c.resolution, internalNotes: d.internalNotes ?? c.internalNotes, version: { increment: 1 } } });
      await this.timeline.add(tx, { entityType: 'Complaint', entityId: id, action: `complaint.${to.toLowerCase()}`, summary: `${c.number}: ${c.status} → ${to}`, actorId: actor.userId });
      await this.audit.record(actor, { action: 'complaint.status', module: 'complaints', entityType: 'Complaint', entityId: id, before: { status: c.status }, after: { status: to, investigatorId: after.investigatorId } }, tx);
      if (to === 'ASSIGNED') await tx.notification.create({ data: { userId: d.investigatorId!, type: 'COMPLAINT_ASSIGNMENT', title: `Complaint ${c.number} assigned to you`, entityType: 'Complaint', entityId: id } });
      return { id: after.id, status: after.status };
    });
  }
}
