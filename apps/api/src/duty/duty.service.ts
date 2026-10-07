import { Injectable } from '@nestjs/common';
import { DutyStatus } from '@enrp/shared';
import { RealtimeService } from '../realtime/realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { DiscordService } from '../discord/discord.service';
import { ShiftsService, type ShiftsConfig, type ShiftType } from './shifts';

/** Dienststatus wird ausschließlich explizit gesetzt – Online-Status ist niemals Dienststatus. */
@Injectable()
export class DutyService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly rt: RealtimeService, private readonly discord: DiscordService, private readonly shifts: ShiftsService) {}

  async setStatus(actor: Actor, status: DutyStatus, d: { unitId?: string; callsign?: string; shiftType?: string }, targetUserId?: string) {
    const userId = targetUserId ?? actor.userId!;
    let previous: { status: string; startedAt: Date; shiftType: string | null } | null = null;
    const cfg = await this.shifts.config();
    let type: ShiftType | null = null;
    return this.prisma.$transaction(async (tx) => {
      const open = await tx.dutySession.findFirst({ where: { userId, endedAt: null } });
      type = status === 'OFF_DUTY' ? (cfg.types.find((t) => t.id === open?.shiftType) ?? null) : await this.shifts.resolve(cfg, d.shiftType, open?.shiftType);
      const sameType = !type || status === 'OFF_DUTY' || type.id === open?.shiftType;
      if ((open?.status ?? 'OFF_DUTY') === status && !d.unitId && sameType) throw new AppError('CONFLICT', `Dieser Status ist bereits gesetzt (${status}).`);
      if (targetUserId && !(await tx.user.findUnique({ where: { id: targetUserId, active: true } }))) throw new AppError('NOT_FOUND', 'Benutzer nicht gefunden.');
      if (open) await tx.dutySession.update({ where: { id: open.id }, data: { endedAt: new Date() } });
      previous = open ? { status: open.status, startedAt: open.startedAt, shiftType: open.shiftType } : null;
      if (d.unitId && !(await tx.unit.findUnique({ where: { id: d.unitId } }))) throw new AppError('NOT_FOUND', 'Einheit nicht gefunden.');
      let created = null;
      if (status !== 'OFF_DUTY') {
        const pers = await tx.personnel.findUnique({ where: { userId } });
        created = await tx.dutySession.create({ data: { userId, status, unitId: d.unitId, shiftType: type?.id ?? null, callsign: (d.callsign ?? pers?.callsign ?? undefined)?.toUpperCase() } });
      }
      await this.audit.record(actor, { action: targetUserId && targetUserId !== actor.userId ? 'duty.status.set_by_supervisor' : 'duty.status', module: 'team', entityType: 'User', entityId: userId, before: { status: open?.status ?? 'OFF_DUTY' }, after: { status } }, tx);
      return created ?? { status: 'OFF_DUTY' };
    }).then(async (r) => {
      this.rt.publish('team', 'duty.changed', { userId, status });
      const before = (previous as { status: string; startedAt: Date; shiftType: string | null } | null);
      const t = type as ShiftType | null;
      if ((before?.status ?? 'OFF_DUTY') !== status || (t && status !== 'OFF_DUTY' && t.id !== before?.shiftType)) await this.notifyDiscord(actor, userId, status, before, cfg, t);
      return r;
    });
  }

  /**
   * Discord-Abgleich: Dienst-Rollen (Im Dienst/Pause/Training/Verwaltung) und Meldung im Dienst-Channel.
   * Wird nur eingereiht, wenn ein Dienst-Channel oder eine Dienst-Rolle eingestellt ist. Fehler stören den Statuswechsel nie.
   */
  private async notifyDiscord(actor: Actor, userId: string, status: string, before: { status: string; startedAt: Date } | null, cfg: ShiftsConfig, type: ShiftType | null) {
    try {
      const ch = await this.discord.channels();
      // Schichten-Modul an: Rollen und Log-Channel der Schicht-Art; sonst die Dienst-Rollen aus den Einstellungen
      const shift = cfg.enabled && cfg.types.length ? { ...ShiftsService.roleChanges(cfg, type, status), channelId: type?.logChannelId ?? null, name: type?.name ?? null } : null;
      const roles = shift ? shift.add.length + shift.remove.length > 0 : !!(ch.dutyRole || ch.breakRole || ch.trainingRole || ch.adminDutyRole);
      if (!ch.duty && !roles && !shift?.channelId) return;
      const [user, link] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, personnel: { select: { callsign: true, rank: true } } } }),
        this.prisma.discordLink.findUnique({ where: { userId } }),
      ]);
      const by = actor.userId && actor.userId !== userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
      await this.discord.enqueue('duty', 'duty.changed', {
        discordId: link?.discordId ?? null, name: user?.displayName ?? '—', callsign: user?.personnel?.callsign ?? null, rank: user?.personnel?.rank ?? null,
        status, previous: before?.status ?? 'OFF_DUTY', previousMinutes: before ? Math.round((Date.now() - before.startedAt.getTime()) / 60_000) : null, setBy: by?.displayName ?? null,
        ...(shift ? { shiftType: shift.name, roles: { add: shift.add, remove: shift.remove }, ...(shift.channelId ? { channelId: shift.channelId } : {}) } : {}),
      }, { always: roles || !!shift?.channelId });
    } catch { /* best effort */ }
  }

  team() {
    return this.prisma.dutySession.findMany({
      where: { endedAt: null },
      include: { user: { select: { id: true, displayName: true, personnel: { select: { rank: true, callsign: true } } } } },
      orderBy: { startedAt: 'asc' },
    });
  }

  mine(userId: string) { return this.prisma.dutySession.findFirst({ where: { userId, endedAt: null } }); }

  /**
   * Dienststunden der letzten `days` Tage, pro Benutzer und Status (in Minuten).
   * Sitzungen, die vor dem Zeitraum begonnen haben oder noch laufen, zählen nur mit dem Anteil im Zeitraum.
   */
  async hours(days: number, userId?: string) {
    const now = new Date();
    const since = new Date(now.getTime() - days * 86_400_000);
    const sessions = await this.prisma.dutySession.findMany({
      where: { ...(userId ? { userId } : {}), OR: [{ endedAt: null }, { endedAt: { gt: since } }] },
      include: { user: { select: { displayName: true, personnel: { select: { rank: true, callsign: true } } } } },
    });
    const rows = new Map<string, { userId: string; name: string; rank: string | null; callsign: string | null; minutes: number; byStatus: Record<string, number>; sessions: number }>();
    for (const s of sessions) {
      const from = Math.max(s.startedAt.getTime(), since.getTime());
      const to = (s.endedAt ?? now).getTime();
      if (to <= from) continue;
      const r = rows.get(s.userId) ?? { userId: s.userId, name: s.user.displayName, rank: s.user.personnel?.rank ?? null, callsign: s.user.personnel?.callsign ?? null, minutes: 0, byStatus: {}, sessions: 0 };
      const min = (to - from) / 60_000;
      r.minutes += min; r.byStatus[s.status] = (r.byStatus[s.status] ?? 0) + min; r.sessions++;
      rows.set(s.userId, r);
    }
    const round = (r: { minutes: number; byStatus: Record<string, number> }) => ({ ...r, minutes: Math.round(r.minutes), byStatus: Object.fromEntries(Object.entries(r.byStatus).map(([k, v]) => [k, Math.round(v)])) });
    const users = [...rows.values()].map(round).sort((a, b) => b.minutes - a.minutes);
    return { days, since, users };
  }

  /** Team-Dashboard: pro aktivem Beamten Dienststatus, Einheit, aktueller Einsatz und letzte Statusänderung. */
  async overview() {
    const [people, open, units, assignments, cfg] = await Promise.all([
      this.prisma.personnel.findMany({ where: { employmentStatus: 'ACTIVE' }, include: { user: { select: { id: true, displayName: true, active: true } } }, orderBy: { callsign: 'asc' } }),
      this.prisma.dutySession.findMany({ where: { endedAt: null } }),
      this.prisma.unit.findMany({ include: { members: true } }),
      this.prisma.incidentUnit.findMany({ where: { clearedAt: null, incident: { status: { notIn: ['CLOSED', 'CANCELLED'] } } }, include: { incident: { select: { id: true, number: true, title: true, status: true, priority: true } } } }),
      this.shifts.config(),
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
        shiftType: cfg.enabled ? cfg.types.find((t) => t.id === session?.shiftType)?.name ?? null : null,
        lastStatusChange: session?.startedAt ?? ended.get(p.userId) ?? null,
        unit: unit ? { id: unit.id, callsign: unit.callsign, status: unit.status } : null,
        currentIncident: inc,
      };
    });
  }
}
