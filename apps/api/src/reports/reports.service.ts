import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { REPORT_TRANSITIONS, ReportStatus, ReportType, statusLabel } from '@enrp/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { PermissionService } from '../authz/permission.service';
import { AppError } from '../common/errors';
import { linkPerson } from '../common/links';
import { makeNumber } from '../common/numbering';
import { nextStatus } from '../common/transition';
import { PageQuery, pageResult, skipTake } from '../common/pagination';
import { LocksService } from '../locks/locks.service';

const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
export const hashContent = (c: unknown) => createHash('sha256').update(stable(c)).digest('hex');

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly timeline: TimelineService, private readonly perms: PermissionService, private readonly locks: LocksService) {}

  /** Autoren sehen eigene Berichte; reports.review/approve-Inhaber sehen alle. Verhindert, dass fremde Entwürfe auftauchen. */
  private async canSeeAll(userId: string) { return (await this.perms.has(userId, 'reports.review')) || (await this.perms.has(userId, 'reports.approve')); }

  async list(actor: Actor, p: PageQuery, status?: string) {
    const all = await this.canSeeAll(actor.userId!);
    const where: Prisma.ReportWhereInput = {
      ...(status ? { status } : {}),
      ...(all ? {} : { OR: [{ authorId: actor.userId! }, { status: { in: ['APPROVED', 'ARCHIVED'] } }] }),
      ...(p.q ? { AND: [{ OR: [{ number: { contains: p.q.toUpperCase() } }, { title: { contains: p.q, mode: 'insensitive' } }] }] } : {}),
    };
    const [items, total] = await Promise.all([this.prisma.report.findMany({ where, orderBy: { updatedAt: 'desc' }, ...skipTake(p) }), this.prisma.report.count({ where })]);
    return pageResult(items, total, p);
  }

  async get(actor: Actor, id: string) {
    const r = await this.prisma.report.findUnique({ where: { id }, include: { versions: { orderBy: { version: 'desc' } } } });
    // Nicht sichtbare Berichte verhalten sich wie nicht existent (keine Existenz-Leaks).
    if (!r || !(await this.visible(actor.userId!, r))) throw new AppError('NOT_FOUND', 'Bericht nicht gefunden.');
    return { report: r, timeline: await this.timeline.list('Report', id) };
  }

  private async visible(userId: string, r: { authorId: string; status: string }) {
    return r.authorId === userId || ['APPROVED', 'ARCHIVED'].includes(r.status) || (await this.canSeeAll(userId));
  }

  async create(actor: Actor, d: { type: ReportType; title: string; content: Prisma.InputJsonValue; incidentId?: string; personIds?: string[] }) {
    const userId = actor.userId!;
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.report.create({ data: { number: makeNumber('R'), type: d.type, title: d.title, authorId: userId, incidentId: d.incidentId } });
      await tx.reportVersion.create({ data: { reportId: r.id, version: 1, authorId: userId, changeSummary: 'Initial draft', content: d.content, contentHash: hashContent(d.content) } });
      for (const pid of new Set(d.personIds ?? [])) {
        if (!(await tx.person.findUnique({ where: { id: pid } }))) throw new AppError('NOT_FOUND', 'Person nicht gefunden.');
        await linkPerson(tx, pid, 'Report', r.id, 'SUBJECT');
        await this.timeline.add(tx, { entityType: 'Person', entityId: pid, action: 'report.created', summary: `Bericht ${r.number} angelegt`, actorId: userId });
      }
      await this.timeline.add(tx, { entityType: 'Report', entityId: r.id, action: 'report.created', summary: `Bericht ${r.number} angelegt`, actorId: userId });
      await this.audit.record(actor, { action: 'report.create', module: 'reports', entityType: 'Report', entityId: r.id, after: { number: r.number, type: r.type } }, tx);
      return r;
    });
  }

  /** Jede Änderung erzeugt eine neue unveränderliche Version; ältere werden nie überschrieben. */
  async edit(actor: Actor, id: string, d: { version: number; title?: string; content: Prisma.InputJsonValue; changeSummary: string }) {
    const userId = actor.userId!;
    await this.locks.assertFree('report', id, userId);
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.report.findUnique({ where: { id } });
      if (!r || !(await this.visible(userId, r))) throw new AppError('NOT_FOUND', 'Bericht nicht gefunden.');
      if (r.status !== 'DRAFT' && r.status !== 'REJECTED') throw new AppError('CONFLICT', 'Nur Entwürfe und abgelehnte Berichte können bearbeitet werden.');
      if (r.authorId !== userId && !(await this.perms.has(userId, 'reports.edit'))) throw new AppError('PERMISSION_DENIED', 'Dafür fehlt dir die Berechtigung.');
      const upd = await tx.report.updateMany({ where: { id, version: d.version }, data: { currentVersion: { increment: 1 }, version: { increment: 1 }, ...(d.title ? { title: d.title } : {}) } });
      if (upd.count === 0) throw new AppError('CONFLICT', 'Der Datensatz wurde inzwischen von jemand anderem geändert. Bitte neu laden und erneut versuchen.');
      const next = r.currentVersion + 1;
      await tx.reportVersion.create({ data: { reportId: id, version: next, authorId: userId, changeSummary: d.changeSummary, content: d.content, contentHash: hashContent(d.content) } });
      await this.timeline.add(tx, { entityType: 'Report', entityId: id, action: 'report.edited', summary: `Version ${next}: ${d.changeSummary}`, actorId: userId });
      await this.audit.record(actor, { action: 'report.edit', module: 'reports', entityType: 'Report', entityId: id, after: { version: next } }, tx);
      return tx.report.findUniqueOrThrow({ where: { id } });
    });
  }

  async transition(actor: Actor, id: string, to: ReportStatus, reason?: string) {
    const userId = actor.userId!;
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.report.findUnique({ where: { id } });
      if (!r || !(await this.visible(userId, r))) throw new AppError('NOT_FOUND', 'Bericht nicht gefunden.');
      nextStatus(REPORT_TRANSITIONS, r.status, to);
      if (to === 'REJECTED' && !reason) throw new AppError('VALIDATION_FAILED', 'Zum Ablehnen eines Berichts bitte eine Begründung angeben.');
      if ((to === 'APPROVED' || to === 'REJECTED') && r.authorId === userId) throw new AppError('CONFLICT', 'Eigene Berichte kannst du nicht prüfen.');
      const after = await tx.report.update({ where: { id }, data: { status: to, version: { increment: 1 } } });
      await this.timeline.add(tx, { entityType: 'Report', entityId: id, action: `report.${to.toLowerCase()}`, summary: `Bericht ${r.number}: ${statusLabel(to)}`, actorId: userId });
      await this.audit.record(actor, { action: `report.${to.toLowerCase()}`, module: 'reports', entityType: 'Report', entityId: id, before: { status: r.status }, after: { status: to }, reason }, tx);
      if (to === 'APPROVED' || to === 'REJECTED' || to === 'UNDER_REVIEW') {
        await tx.notification.create({ data: { userId: r.authorId, type: 'REPORT_REVIEW', title: `Bericht ${r.number}: ${statusLabel(to)}`, body: reason, entityType: 'Report', entityId: id } });
      }
      return after;
    });
  }
}
