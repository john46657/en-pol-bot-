import { Injectable } from '@nestjs/common';
import { isValidRobloxUserId } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { StudioService } from '../studio/studio.service';
import { Prisma } from '@prisma/client';
import { AppError } from '../common/errors';
import { PageQuery, pageResult, skipTake } from '../common/pagination';
import { RobloxService } from './roblox.service';

@Injectable()
export class PersonsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly timeline: TimelineService, private readonly studio: StudioService, private readonly roblox: RobloxService) {}

  async list(p: PageQuery, includeArchived = false) {
    const where = {
      ...(includeArchived ? {} : { status: 'ACTIVE' }),
      ...(p.q ? { OR: [{ robloxUsername: { contains: p.q, mode: 'insensitive' as const } }, { robloxUserId: p.q }, { aliases: { has: p.q } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.person.findMany({ where, orderBy: { robloxUsername: 'asc' }, ...skipTake(p) }),
      this.prisma.person.count({ where }),
    ]);
    return pageResult(items, total, p);
  }

  async get(id: string) {
    const person = await this.prisma.person.findUnique({ where: { id }, include: { vehicles: true } });
    if (!person) throw new AppError('NOT_FOUND', 'Person not found.');
    return person;
  }

  async overview(id: string) {
    const person = await this.get(id);
    const [tickets, links, timeline] = await Promise.all([
      this.prisma.ticket.findMany({ where: { personId: id }, orderBy: { issuedAt: 'desc' }, take: 50 }),
      this.prisma.recordLink.findMany({ where: { personId: id }, orderBy: { createdAt: 'desc' }, take: 200 }),
      this.timeline.list('Person', id),
    ]);
    return { person, tickets, links, timeline };
  }

  /** Mögliche Duplikate: gleiche Roblox-ID (hart, Unique) oder gleicher Username (weich → Hinweis, kein Auto-Merge). */
  async findDuplicates(robloxUsername: string, robloxUserId?: string | null) {
    return this.prisma.person.findMany({
      where: { OR: [...(robloxUserId ? [{ robloxUserId }] : []), { robloxUsername: { equals: robloxUsername, mode: 'insensitive' } }] },
      select: { id: true, robloxUsername: true, robloxUserId: true, status: true },
    });
  }

  async create(actor: Actor, d: { robloxUsername: string; robloxUserId?: string | null; aliases?: string[]; notes?: string; custom?: Record<string, unknown> }) {
    const custom = await this.studio.check('persons', d.custom);
    if (d.robloxUserId && !isValidRobloxUserId(d.robloxUserId)) throw new AppError('VALIDATION_FAILED', 'Invalid Roblox user id.');
    // Nur Name oder nur ID angegeben → das Fehlende bei Roblox nachschlagen (Name in der richtigen Schreibweise)
    if (!d.robloxUserId) {
      const r = await this.roblox.lookup(d.robloxUsername).catch(() => null);
      if (r) d = { ...d, robloxUsername: r.name, robloxUserId: r.id };
    }
    const dups = await this.findDuplicates(d.robloxUsername, d.robloxUserId);
    const hard = dups.find((x) => d.robloxUserId && x.robloxUserId === d.robloxUserId);
    if (hard) throw new AppError('CONFLICT', 'A person with this Roblox user id already exists.', { existingId: hard.id });
    const person = await this.prisma.$transaction(async (tx) => {
      const created = await tx.person.create({ data: { robloxUsername: d.robloxUsername, robloxUserId: d.robloxUserId ?? null, aliases: d.aliases ?? [], notes: d.notes, custom: custom as Prisma.InputJsonValue | undefined, createdById: actor.userId } });
      await this.timeline.add(tx, { entityType: 'Person', entityId: created.id, action: 'person.created', summary: 'Person record created', actorId: actor.userId });
      await this.audit.record(actor, { action: 'person.create', module: 'persons', entityType: 'Person', entityId: created.id, after: created }, tx);
      return created;
    });
    return { person, possibleDuplicates: dups };
  }

  async update(actor: Actor, id: string, version: number, d: { robloxUsername?: string; aliases?: string[]; notes?: string | null; custom?: Record<string, unknown> }) {
    const before = await this.get(id);
    const { custom: rawCustom, ...rest } = d;
    const custom = rawCustom ? await this.studio.check('persons', rawCustom, before.custom as Record<string, unknown> | null) : undefined;
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.person.updateMany({ where: { id, version }, data: { ...rest, ...(custom ? { custom: custom as Prisma.InputJsonValue } : {}), version: { increment: 1 } } });
      if (r.count === 0) throw new AppError('CONFLICT', 'The record was modified by someone else. Reload and retry.');
      const after = await tx.person.findUniqueOrThrow({ where: { id } });
      await this.timeline.add(tx, { entityType: 'Person', entityId: id, action: 'person.updated', summary: 'Person record updated', actorId: actor.userId });
      await this.audit.record(actor, { action: 'person.update', module: 'persons', entityType: 'Person', entityId: id, before, after }, tx);
      return after;
    });
  }

  async archive(actor: Actor, id: string, reason: string) {
    const before = await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.person.update({ where: { id }, data: { status: 'ARCHIVED', version: { increment: 1 } } });
      await this.timeline.add(tx, { entityType: 'Person', entityId: id, action: 'person.archived', summary: 'Person record archived', actorId: actor.userId });
      await this.audit.record(actor, { action: 'person.archive', module: 'persons', entityType: 'Person', entityId: id, before: { status: before.status }, after: { status: after.status }, reason }, tx);
      return after;
    });
  }

  /** Merge nur auf ausdrückliche Bestätigung (nie automatisch). Quelle wird archiviert, nichts wird gelöscht. */
  async merge(actor: Actor, sourceId: string, targetId: string, reason: string) {
    if (sourceId === targetId) throw new AppError('VALIDATION_FAILED', 'Source and target must differ.');
    return this.prisma.$transaction(async (tx) => {
      const [src, dst] = await Promise.all([tx.person.findUnique({ where: { id: sourceId } }), tx.person.findUnique({ where: { id: targetId } })]);
      if (!src || !dst) throw new AppError('NOT_FOUND', 'Person not found.');
      if (src.status !== 'ACTIVE' || dst.status !== 'ACTIVE') throw new AppError('CONFLICT', 'Both persons must be active.');
      if (src.robloxUserId && dst.robloxUserId && src.robloxUserId !== dst.robloxUserId) throw new AppError('CONFLICT', 'Persons have different Roblox user ids.');
      // Links umhängen, dabei Duplikate (gleiche Entität+Rolle) verwerfen
      const links = await tx.recordLink.findMany({ where: { personId: sourceId } });
      for (const l of links) {
        const exists = await tx.recordLink.findFirst({ where: { personId: targetId, entityType: l.entityType, entityId: l.entityId, role: l.role } });
        if (exists) await tx.recordLink.delete({ where: { id: l.id } });
        else await tx.recordLink.update({ where: { id: l.id }, data: { personId: targetId } });
      }
      await tx.ticket.updateMany({ where: { personId: sourceId }, data: { personId: targetId } });
      await tx.vehicle.updateMany({ where: { ownerId: sourceId }, data: { ownerId: targetId } });
      await tx.wantedRecord.updateMany({ where: { personId: sourceId }, data: { personId: targetId } });
      await tx.timelineEvent.updateMany({ where: { entityType: 'Person', entityId: sourceId }, data: { entityId: targetId } });
      const robloxUserId = dst.robloxUserId ?? src.robloxUserId;
      await tx.person.update({ where: { id: sourceId }, data: { status: 'ARCHIVED', robloxUserId: null, notes: `${src.notes ?? ''}\n[merged into ${targetId}]`.trim(), version: { increment: 1 } } });
      const merged = await tx.person.update({ where: { id: targetId }, data: { robloxUserId, aliases: [...new Set([...dst.aliases, ...src.aliases, src.robloxUsername])].filter((a) => a !== dst.robloxUsername), version: { increment: 1 } } });
      await this.timeline.add(tx, { entityType: 'Person', entityId: targetId, action: 'person.merged', summary: `Merged record ${src.robloxUsername}`, actorId: actor.userId });
      await this.audit.record(actor, { action: 'person.merge', module: 'persons', entityType: 'Person', entityId: targetId, before: { source: src, target: dst }, after: merged, reason }, tx);
      return merged;
    });
  }
}
