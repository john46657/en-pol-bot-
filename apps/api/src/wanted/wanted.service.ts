import { Injectable } from '@nestjs/common';
import { WANTED_TRANSITIONS, WantedStatus } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { AppError } from '../common/errors';
import { DiscordService } from '../discord/discord.service';
import { nextStatus } from '../common/transition';
import { PageQuery, pageResult, skipTake } from '../common/pagination';

@Injectable()
export class WantedService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly timeline: TimelineService, private readonly discord: DiscordService) {}

  /** Abgelaufene aktive Fahndungen werden beim Lesen/Schreiben konsistent auf EXPIRED gesetzt. */
  async expireDue() {
    return this.prisma.wantedRecord.updateMany({ where: { status: 'ACTIVE', expiresAt: { lt: new Date() } }, data: { status: 'EXPIRED' } });
  }

  async list(p: PageQuery, status = 'ACTIVE') {
    await this.expireDue();
    const where = { status, ...(p.q ? { reason: { contains: p.q, mode: 'insensitive' as const } } : {}) };
    const [items, total] = await Promise.all([this.prisma.wantedRecord.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(p) }), this.prisma.wantedRecord.count({ where })]);
    return pageResult(items, total, p);
  }

  async get(id: string) {
    await this.expireDue();
    const w = await this.prisma.wantedRecord.findUnique({ where: { id } });
    if (!w) throw new AppError('NOT_FOUND', 'Wanted record not found.');
    return { wanted: w, timeline: await this.timeline.list('Wanted', id) };
  }

  async create(actor: Actor, d: { personId?: string; vehicleId?: string; reason: string; description?: string; priority?: string; expiresAt?: Date }) {
    if (!!d.personId === !!d.vehicleId) throw new AppError('VALIDATION_FAILED', 'Provide exactly one of personId or vehicleId.');
    if (d.expiresAt && d.expiresAt <= new Date()) throw new AppError('VALIDATION_FAILED', 'expiresAt must be in the future.');
    return this.prisma.$transaction(async (tx) => {
      if (d.personId && !(await tx.person.findUnique({ where: { id: d.personId } }))) throw new AppError('NOT_FOUND', 'Person not found.');
      if (d.vehicleId && !(await tx.vehicle.findUnique({ where: { id: d.vehicleId } }))) throw new AppError('NOT_FOUND', 'Vehicle not found.');
      const dup = await tx.wantedRecord.findFirst({ where: { status: 'ACTIVE', personId: d.personId ?? undefined, vehicleId: d.vehicleId ?? undefined } });
      if (dup) throw new AppError('CONFLICT', 'An active wanted record already exists.', { existingId: dup.id });
      const w = await tx.wantedRecord.create({ data: { ...d, priority: d.priority ?? 'MEDIUM', createdById: actor.userId! } });
      if (d.personId) {
        await tx.recordLink.upsert({ where: { personId_entityType_entityId_role: { personId: d.personId, entityType: 'Wanted', entityId: w.id, role: 'SUBJECT' } }, create: { personId: d.personId, entityType: 'Wanted', entityId: w.id, role: 'SUBJECT' }, update: {} });
        await this.timeline.add(tx, { entityType: 'Person', entityId: d.personId, action: 'wanted.created', summary: `Wanted: ${d.reason}`, actorId: actor.userId });
      }
      await this.timeline.add(tx, { entityType: 'Wanted', entityId: w.id, action: 'wanted.created', summary: 'Wanted record activated', actorId: actor.userId });
      await this.audit.record(actor, { action: 'wanted.create', module: 'wanted', entityType: 'Wanted', entityId: w.id, after: w }, tx);
      return w;
    }).then(async (w) => {
      const subject = w.personId ? (await this.prisma.person.findUnique({ where: { id: w.personId } }))?.robloxUsername : (await this.prisma.vehicle.findUnique({ where: { id: w.vehicleId! } }))?.plate;
      await this.discord.enqueue('wanted', 'wanted.created', { reason: w.reason, priority: w.priority, subject: subject ?? 'unknown', kind: w.personId ? 'person' : 'vehicle' });
      return w;
    });
  }

  async setStatus(actor: Actor, id: string, to: WantedStatus, reason: string) {
    await this.expireDue();
    return this.prisma.$transaction(async (tx) => {
      const w = await tx.wantedRecord.findUnique({ where: { id } });
      if (!w) throw new AppError('NOT_FOUND', 'Wanted record not found.');
      nextStatus(WANTED_TRANSITIONS, w.status, to);
      const after = await tx.wantedRecord.update({ where: { id }, data: { status: to, expiresAt: to === 'ACTIVE' ? null : w.expiresAt, version: { increment: 1 } } });
      await this.timeline.add(tx, { entityType: 'Wanted', entityId: id, action: `wanted.${to.toLowerCase()}`, summary: `${w.status} → ${to}`, actorId: actor.userId });
      if (w.personId) await this.timeline.add(tx, { entityType: 'Person', entityId: w.personId, action: `wanted.${to.toLowerCase()}`, summary: `Wanted record ${to}`, actorId: actor.userId });
      await this.audit.record(actor, { action: `wanted.${to.toLowerCase()}`, module: 'wanted', entityType: 'Wanted', entityId: id, before: { status: w.status }, after: { status: to }, reason }, tx);
      return after;
    });
  }
}
