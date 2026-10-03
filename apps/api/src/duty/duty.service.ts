import { Injectable } from '@nestjs/common';
import { DutyStatus } from '@enrp/shared';
import { RealtimeService } from '../realtime/realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';

/** Dienststatus wird ausschließlich explizit gesetzt – Online-Status ist niemals Dienststatus. */
@Injectable()
export class DutyService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly rt: RealtimeService) {}

  async setStatus(actor: Actor, status: DutyStatus, d: { unitId?: string; callsign?: string }, targetUserId?: string) {
    const userId = targetUserId ?? actor.userId!;
    return this.prisma.$transaction(async (tx) => {
      const open = await tx.dutySession.findFirst({ where: { userId, endedAt: null } });
      if ((open?.status ?? 'OFF_DUTY') === status && !d.unitId) throw new AppError('CONFLICT', `Already ${status}.`);
      if (targetUserId && !(await tx.user.findUnique({ where: { id: targetUserId, active: true } }))) throw new AppError('NOT_FOUND', 'User not found.');
      if (open) await tx.dutySession.update({ where: { id: open.id }, data: { endedAt: new Date() } });
      if (d.unitId && !(await tx.unit.findUnique({ where: { id: d.unitId } }))) throw new AppError('NOT_FOUND', 'Unit not found.');
      let created = null;
      if (status !== 'OFF_DUTY') {
        const pers = await tx.personnel.findUnique({ where: { userId } });
        created = await tx.dutySession.create({ data: { userId, status, unitId: d.unitId, callsign: (d.callsign ?? pers?.callsign ?? undefined)?.toUpperCase() } });
      }
      await this.audit.record(actor, { action: targetUserId && targetUserId !== actor.userId ? 'duty.status.set_by_supervisor' : 'duty.status', module: 'team', entityType: 'User', entityId: userId, before: { status: open?.status ?? 'OFF_DUTY' }, after: { status } }, tx);
      return created ?? { status: 'OFF_DUTY' };
    }).then((r) => { this.rt.publish('team', 'duty.changed', { userId, status }); return r; });
  }

  team() {
    return this.prisma.dutySession.findMany({
      where: { endedAt: null },
      include: { user: { select: { id: true, displayName: true, personnel: { select: { rank: true, callsign: true } } } } },
      orderBy: { startedAt: 'asc' },
    });
  }

  mine(userId: string) { return this.prisma.dutySession.findFirst({ where: { userId, endedAt: null } }); }

  /** Team-Dashboard: pro aktivem Beamten Dienststatus, Einheit, aktueller Einsatz und letzte Statusänderung. */
  async overview() {
    const [people, open, units, assignments] = await Promise.all([
      this.prisma.personnel.findMany({ where: { employmentStatus: 'ACTIVE' }, include: { user: { select: { id: true, displayName: true, active: true } } }, orderBy: { callsign: 'asc' } }),
      this.prisma.dutySession.findMany({ where: { endedAt: null } }),
      this.prisma.unit.findMany({ include: { members: true } }),
      this.prisma.incidentUnit.findMany({ where: { clearedAt: null, incident: { status: { notIn: ['CLOSED', 'CANCELLED'] } } }, include: { incident: { select: { id: true, number: true, title: true, status: true, priority: true } } } }),
    ]);
    const ids = people.map((p) => p.userId);
    const lastEnded = await this.prisma.dutySession.groupBy({ by: ['userId'], where: { userId: { in: ids }, endedAt: { not: null } }, _max: { endedAt: true } });
    const ended = new Map(lastEnded.map((l) => [l.userId, l._max.endedAt]));
    return people.filter((p) => p.user.active).map((p) => {
      const session = open.find((o) => o.userId === p.userId);
      const unit = units.find((u) => u.members.some((m) => m.userId === p.userId));
      const inc = unit ? assignments.find((a) => a.unitId === unit.id)?.incident ?? null : null;
      return {
        userId: p.userId, personnelId: p.id, name: p.user.displayName, rank: p.rank, callsign: p.callsign, team: p.team,
        dutyStatus: session?.status ?? 'OFF_DUTY', onDutySince: session?.startedAt ?? null,
        lastStatusChange: session?.startedAt ?? ended.get(p.userId) ?? null,
        unit: unit ? { id: unit.id, callsign: unit.callsign, status: unit.status } : null,
        currentIncident: inc,
      };
    });
  }
}
