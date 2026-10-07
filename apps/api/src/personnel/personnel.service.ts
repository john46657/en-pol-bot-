import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { AppError } from '../common/errors';
import { PageQuery, pageResult, skipTake } from '../common/pagination';
import { LocksService } from '../locks/locks.service';

@Injectable()
export class PersonnelService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly timeline: TimelineService, private readonly locks: LocksService) {}

  async list(p: PageQuery) {
    const where = p.q ? { OR: [{ callsign: { contains: p.q, mode: 'insensitive' as const } }, { rank: { contains: p.q, mode: 'insensitive' as const } }, { user: { displayName: { contains: p.q, mode: 'insensitive' as const } } }] } : {};
    const [items, total] = await Promise.all([
      this.prisma.personnel.findMany({ where, include: { user: { select: { id: true, displayName: true, robloxUserId: true } } }, orderBy: { callsign: 'asc' }, ...skipTake(p) }),
      this.prisma.personnel.count({ where }),
    ]);
    return pageResult(items, total, p);
  }

  /** Vollständige Personalakte inkl. Disziplinarvorgängen; Zugriff wird im Audit festgehalten. */
  async get(actor: Actor, id: string) {
    const rec = await this.prisma.personnel.findUnique({
      where: { id },
      include: { user: { select: { id: true, displayName: true, robloxUserId: true, robloxUsername: true, lastLogin: true } }, records: { orderBy: { createdAt: 'desc' } }, academyEnrollments: { include: { course: true, results: true } } },
    });
    if (!rec) throw new AppError('NOT_FOUND', 'Personnel file not found.');
    await this.audit.record(actor, { action: 'personnel.read', module: 'personnel', entityType: 'Personnel', entityId: id });
    return rec;
  }

  async create(actor: Actor, d: { userId: string; rank?: string; team?: string; office?: string; serviceNumber?: string; callsign?: string; qualifications?: string[] }) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await tx.user.findUnique({ where: { id: d.userId } }))) throw new AppError('NOT_FOUND', 'User not found.');
      if (await tx.personnel.findUnique({ where: { userId: d.userId } })) throw new AppError('CONFLICT', 'A personnel file already exists for this user.');
      const p = await tx.personnel.create({ data: { ...d, callsign: d.callsign?.toUpperCase() } });
      await this.timeline.add(tx, { entityType: 'Personnel', entityId: p.id, action: 'personnel.created', summary: 'Personnel file created', actorId: actor.userId });
      await this.audit.record(actor, { action: 'personnel.create', module: 'personnel', entityType: 'Personnel', entityId: p.id, after: p }, tx);
      return p;
    });
  }

  async update(actor: Actor, id: string, d: { team?: string; office?: string | null; serviceNumber?: string | null; callsign?: string; employmentStatus?: string; qualifications?: string[] }) {
    await this.locks.assertFree('personnel', id, actor.userId);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.personnel.findUnique({ where: { id } });
      if (!before) throw new AppError('NOT_FOUND', 'Personnel file not found.');
      const after = await tx.personnel.update({ where: { id }, data: { ...d, callsign: d.callsign?.toUpperCase() } });
      await this.audit.record(actor, { action: 'personnel.update', module: 'personnel', entityType: 'Personnel', entityId: id, before, after }, tx);
      return after;
    });
  }

  async promote(actor: Actor, id: string, rank: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.personnel.findUnique({ where: { id } });
      if (!before) throw new AppError('NOT_FOUND', 'Personnel file not found.');
      if (before.userId === actor.userId) throw new AppError('CONFLICT', 'You cannot change your own rank.');
      const after = await tx.personnel.update({ where: { id }, data: { rank } });
      await tx.personnelRecord.create({ data: { personnelId: id, type: 'PROMOTION', summary: `${before.rank ?? '—'} → ${rank}`, details: reason, createdById: actor.userId! } });
      await this.timeline.add(tx, { entityType: 'Personnel', entityId: id, action: 'personnel.promoted', summary: `Rank ${before.rank ?? '—'} → ${rank}`, actorId: actor.userId });
      await this.audit.record(actor, { action: 'personnel.promote', module: 'personnel', entityType: 'Personnel', entityId: id, before: { rank: before.rank }, after: { rank }, reason }, tx);
      await tx.notification.create({ data: { userId: before.userId, type: 'PERSONNEL', title: `Your rank changed to ${rank}` } });
      return after;
    });
  }

  async addRecord(actor: Actor, id: string, d: { type: 'AWARD' | 'DISCIPLINE' | 'NOTE'; summary: string; details?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.personnel.findUnique({ where: { id } });
      if (!p) throw new AppError('NOT_FOUND', 'Personnel file not found.');
      if (d.type === 'DISCIPLINE' && p.userId === actor.userId) throw new AppError('CONFLICT', 'You cannot record discipline against yourself.');
      const r = await tx.personnelRecord.create({ data: { personnelId: id, ...d, createdById: actor.userId! } });
      await this.audit.record(actor, { action: `personnel.${d.type.toLowerCase()}`, module: 'personnel', entityType: 'Personnel', entityId: id, after: r }, tx);
      return r;
    });
  }
}
