import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { StudioService } from '../studio/studio.service';
import { Prisma } from '@prisma/client';
import { AppError } from '../common/errors';
import { PageQuery, pageResult, skipTake } from '../common/pagination';

const normPlate = (p: string) => p.toUpperCase().replace(/\s+/g, '');

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly timeline: TimelineService, private readonly studio: StudioService) {}

  async list(p: PageQuery) {
    const where = p.q ? { OR: [{ plate: { contains: normPlate(p.q) } }, { model: { contains: p.q, mode: 'insensitive' as const } }] } : {};
    const [items, total] = await Promise.all([
      this.prisma.vehicle.findMany({ where, include: { owner: { select: { id: true, robloxUsername: true } } }, orderBy: { plate: 'asc' }, ...skipTake(p) }),
      this.prisma.vehicle.count({ where }),
    ]);
    return pageResult(items, total, p);
  }

  async get(id: string) {
    const v = await this.prisma.vehicle.findUnique({ where: { id }, include: { owner: true } });
    if (!v) throw new AppError('NOT_FOUND', 'Vehicle not found.');
    return { vehicle: v, timeline: await this.timeline.list('Vehicle', id) };
  }

  async create(actor: Actor, d: { plate: string; model?: string; color?: string; ownerId?: string; notes?: string; erlcReference?: string; custom?: Record<string, unknown> }) {
    const custom = await this.studio.check('vehicles', d.custom);
    const { custom: _c, ...rest } = d; void _c;
    const plate = normPlate(d.plate);
    if (await this.prisma.vehicle.findFirst({ where: { plate } })) throw new AppError('CONFLICT', 'A vehicle with this plate already exists.');
    return this.prisma.$transaction(async (tx) => {
      if (d.ownerId && !(await tx.person.findUnique({ where: { id: d.ownerId } }))) throw new AppError('NOT_FOUND', 'Owner not found.');
      const v = await tx.vehicle.create({ data: { ...rest, plate, custom: custom as Prisma.InputJsonValue | undefined } });
      await this.timeline.add(tx, { entityType: 'Vehicle', entityId: v.id, action: 'vehicle.created', summary: `Vehicle ${plate} registered`, actorId: actor.userId });
      if (d.ownerId) await this.timeline.add(tx, { entityType: 'Person', entityId: d.ownerId, action: 'vehicle.linked', summary: `Vehicle ${plate} linked as owner`, actorId: actor.userId });
      await this.audit.record(actor, { action: 'vehicle.create', module: 'vehicles', entityType: 'Vehicle', entityId: v.id, after: v }, tx);
      return v;
    });
  }

  async archive(actor: Actor, id: string, reason: string) {
    const { vehicle } = await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.vehicle.update({ where: { id }, data: { status: 'ARCHIVED', version: { increment: 1 } } });
      await this.timeline.add(tx, { entityType: 'Vehicle', entityId: id, action: 'vehicle.archived', summary: 'Vehicle archived', actorId: actor.userId });
      await this.audit.record(actor, { action: 'vehicle.archive', module: 'vehicles', entityType: 'Vehicle', entityId: id, before: { status: vehicle.status }, after: { status: v.status }, reason }, tx);
      return v;
    });
  }
}
