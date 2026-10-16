import { Injectable } from '@nestjs/common';
import { INVESTIGATION_TRANSITIONS, InvestigationStatus, statusLabel } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { AppError } from '../common/errors';
import { linkPerson } from '../common/links';
import { makeNumber } from '../common/numbering';
import { nextStatus } from '../common/transition';
import { PageQuery, pageResult, skipTake } from '../common/pagination';

export const INVESTIGATION_ROLES = ['SUSPECT', 'WITNESS', 'VICTIM', 'PERSON_OF_INTEREST'] as const;
const ROLE_DE: Record<string, string> = { SUSPECT: 'Verdächtige Person', WITNESS: 'Zeuge', VICTIM: 'Opfer', PERSON_OF_INTEREST: 'Relevante Person' };

@Injectable()
export class InvestigationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly timeline: TimelineService) {}

  async list(p: PageQuery, status?: string) {
    const where = { ...(status ? { status } : {}), ...(p.q ? { OR: [{ caseNumber: { contains: p.q.toUpperCase() } }, { title: { contains: p.q, mode: 'insensitive' as const } }] } : {}) };
    const [items, total] = await Promise.all([this.prisma.investigation.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(p) }), this.prisma.investigation.count({ where })]);
    return pageResult(items, total, p);
  }

  async get(id: string) {
    const inv = await this.prisma.investigation.findUnique({ where: { id } });
    if (!inv) throw new AppError('NOT_FOUND', 'Ermittlung nicht gefunden.');
    const [links, evidence, timeline] = await Promise.all([
      this.prisma.recordLink.findMany({ where: { entityType: 'Investigation', entityId: id }, include: { person: { select: { id: true, robloxUsername: true } } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.evidence.findMany({ where: { caseRef: inv.caseNumber }, select: { id: true, number: true, type: true, custodyState: true } }),
      this.timeline.list('Investigation', id),
    ]);
    const lead = inv.leadId ? await this.prisma.user.findUnique({ where: { id: inv.leadId }, select: { id: true, displayName: true } }) : null;
    return { investigation: { ...inv, lead }, links, evidence, timeline };
  }

  /** Titel, Beschreibung und Leitung ändern (mit Versionsprüfung gegen gleichzeitiges Bearbeiten). */
  async update(actor: Actor, id: string, d: { title?: string; description?: string | null; leadId?: string | null; version?: number }) {
    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.investigation.findUnique({ where: { id } });
      if (!inv) throw new AppError('NOT_FOUND', 'Ermittlung nicht gefunden.');
      if (d.version !== undefined && d.version !== inv.version) throw new AppError('CONFLICT', 'Der Fall wurde inzwischen geändert. Bitte neu laden.');
      if (inv.status === 'ARCHIVED') throw new AppError('CONFLICT', 'Archivierte Fälle können nicht bearbeitet werden.');
      if (d.leadId && !(await tx.user.findUnique({ where: { id: d.leadId } }))) throw new AppError('NOT_FOUND', 'Benutzer für die Leitung nicht gefunden.');
      const data = { ...(d.title !== undefined ? { title: d.title } : {}), ...(d.description !== undefined ? { description: d.description || null } : {}), ...(d.leadId !== undefined ? { leadId: d.leadId } : {}) };
      const after = await tx.investigation.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
      const changed = Object.keys(data).map((k) => ({ title: 'Titel', description: 'Beschreibung', leadId: 'Leitung' })[k]).join(', ');
      await this.timeline.add(tx, { entityType: 'Investigation', entityId: id, action: 'investigation.updated', summary: `Geändert: ${changed || 'nichts'}`, actorId: actor.userId });
      await this.audit.record(actor, { action: 'investigation.update', module: 'investigations', entityType: 'Investigation', entityId: id, before: { title: inv.title, description: inv.description, leadId: inv.leadId }, after: data }, tx);
      return after;
    });
  }

  /** Fallnotiz im Verlauf (unveränderlich, mit Verfasser). */
  async addNote(actor: Actor, id: string, text: string) {
    const inv = await this.prisma.investigation.findUnique({ where: { id } });
    if (!inv) throw new AppError('NOT_FOUND', 'Ermittlung nicht gefunden.');
    if (inv.status === 'ARCHIVED') throw new AppError('CONFLICT', 'Archivierte Fälle können nicht ergänzt werden.');
    await this.prisma.$transaction(async (tx) => {
      await this.timeline.add(tx, { entityType: 'Investigation', entityId: id, action: 'investigation.note', summary: text, actorId: actor.userId });
      await this.audit.record(actor, { action: 'investigation.note', module: 'investigations', entityType: 'Investigation', entityId: id, after: { note: text } }, tx);
    });
    return { ok: true };
  }

  async create(actor: Actor, d: { title: string; description?: string; leadId?: string; persons?: { personId: string; role: (typeof INVESTIGATION_ROLES)[number] }[] }) {
    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.investigation.create({ data: { caseNumber: makeNumber('CASE'), title: d.title, description: d.description, leadId: d.leadId ?? actor.userId } });
      for (const { personId, role } of d.persons ?? []) {
        if (!(await tx.person.findUnique({ where: { id: personId } }))) throw new AppError('NOT_FOUND', 'Person nicht gefunden.');
        await linkPerson(tx, personId, 'Investigation', inv.id, role);
        await this.timeline.add(tx, { entityType: 'Person', entityId: personId, action: 'investigation.linked', summary: `Mit ${inv.caseNumber} verknüpft als ${ROLE_DE[role] ?? role}`, actorId: actor.userId });
      }
      await this.timeline.add(tx, { entityType: 'Investigation', entityId: inv.id, action: 'investigation.opened', summary: `Ermittlung ${inv.caseNumber} eröffnet`, actorId: actor.userId });
      await this.audit.record(actor, { action: 'investigation.create', module: 'investigations', entityType: 'Investigation', entityId: inv.id, after: inv }, tx);
      return inv;
    });
  }

  async addPerson(actor: Actor, id: string, personId: string, role: (typeof INVESTIGATION_ROLES)[number]) {
    await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      if (!(await tx.person.findUnique({ where: { id: personId } }))) throw new AppError('NOT_FOUND', 'Person nicht gefunden.');
      await linkPerson(tx, personId, 'Investigation', id, role);
      await this.timeline.add(tx, { entityType: 'Investigation', entityId: id, action: 'investigation.person_added', summary: `Person hinzugefügt als ${ROLE_DE[role] ?? role}`, actorId: actor.userId });
      await this.audit.record(actor, { action: 'investigation.person.add', module: 'investigations', entityType: 'Investigation', entityId: id, after: { personId, role } }, tx);
    });
  }

  async setStatus(actor: Actor, id: string, to: InvestigationStatus, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.investigation.findUnique({ where: { id } });
      if (!inv) throw new AppError('NOT_FOUND', 'Ermittlung nicht gefunden.');
      nextStatus(INVESTIGATION_TRANSITIONS, inv.status, to);
      const after = await tx.investigation.update({ where: { id }, data: { status: to, version: { increment: 1 } } });
      await this.timeline.add(tx, { entityType: 'Investigation', entityId: id, action: `investigation.${to.toLowerCase()}`, summary: `${inv.caseNumber}: ${statusLabel(inv.status)} → ${statusLabel(to)}`, actorId: actor.userId });
      await this.audit.record(actor, { action: 'investigation.status', module: 'investigations', entityType: 'Investigation', entityId: id, before: { status: inv.status }, after: { status: to }, reason }, tx);
      return after;
    });
  }
}
