import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { DutyStatus } from '@enrp/shared';
import { RealtimeService } from '../realtime/realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { DiscordService } from '../discord/discord.service';
import { ShiftsService, type ShiftsConfig, type ShiftType } from './shifts';
import { recordSpace, recordWhere, onePersonnel } from '../common/guild-context';

/** Schicht-ID wie bei Trident: Discord-Snowflake aus dem Beginn der Schicht (Zeitstempel + Zufall), als Text. */
export const newShiftId = (at: Date) => ((BigInt(at.getTime() - 1_420_070_400_000) << BigInt(22)) | BigInt(randomInt(1 << 22))).toString();

/** Eckdaten einer Schicht für das Shift-Log: ID, Beginn, Zeit im Dienst und in der Pause (Sekunden). */
export interface ShiftSummary { shiftId: string; startedAt: Date; workSeconds: number; breakSeconds: number }

/** Dienststatus wird ausschließlich explizit gesetzt – Online-Status ist niemals Dienststatus. */
@Injectable()
export class DutyService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly rt: RealtimeService, private readonly discord: DiscordService, private readonly shifts: ShiftsService) {}

  async setStatus(actor: Actor, status: DutyStatus, d: { unitId?: string; callsign?: string; shiftType?: string; discordRoleIds?: string[] }, targetUserId?: string) {
    const userId = targetUserId ?? actor.userId!;
    let previous: { status: string; startedAt: Date; shiftType: string | null } | null = null;
    let summary: ShiftSummary | null = null;
    const cfg = await this.shifts.config();
    let type: ShiftType | null = null;
    return this.prisma.$transaction(async (tx) => {
      const open = await tx.dutySession.findFirst({ where: { userId, endedAt: null } });
      type = status === 'OFF_DUTY' ? (cfg.types.find((t) => t.id === open?.shiftType) ?? null) : await this.shifts.resolve(cfg, d.shiftType, open?.shiftType);
      const sameType = !type || status === 'OFF_DUTY' || type.id === open?.shiftType;
      if ((open?.status ?? 'OFF_DUTY') === status && !d.unitId && sameType) throw new AppError('CONFLICT', `Dieser Status ist bereits gesetzt (${status}).`);
      // Erlaubte Rollen der Schichtart (wie Trident „Permitted Roles“): beim Start bzw. Wechsel der Art; die Leitung darf für andere setzen
      if (type && status !== 'OFF_DUTY' && type.id !== open?.shiftType && !targetUserId && type.permittedRoleIds.length) {
        const roles = d.discordRoleIds ?? (await tx.serverMembership.findMany({ where: { userId, status: 'MEMBER' }, select: { discordRoleIds: true } })).flatMap((m) => m.discordRoleIds);
        // ohne Auswahl: statt der Standard-Art die erste, die erlaubt ist
        if (!d.shiftType && !ShiftsService.permitted(type, roles)) type = cfg.types.find((t) => ShiftsService.permitted(t, roles)) ?? type;
        if (!ShiftsService.permitted(type, roles)) throw new AppError('PERMISSION_DENIED', `Für die Schichtart „${type.name}“ fehlt dir die passende Discord-Rolle.`);
      }
      if (targetUserId && !(await tx.user.findUnique({ where: { id: targetUserId, active: true } }))) throw new AppError('NOT_FOUND', 'Benutzer nicht gefunden.');
      const at = new Date(); // gleicher Zeitpunkt für Ende und Beginn → Schicht-Logs erkennen zusammenhängende Sitzungen
      if (open) await tx.dutySession.update({ where: { id: open.id }, data: { endedAt: at } });
      previous = open ? { status: open.status, startedAt: open.startedAt, shiftType: open.shiftType } : null;
      if (d.unitId && !(await tx.unit.findUnique({ where: { id: d.unitId } }))) throw new AppError('NOT_FOUND', 'Einheit nicht gefunden.');
      // Schicht-ID: neue Schicht → neue ID; Pause/Schichtwechsel → ID der laufenden Schicht
      let shiftId = open?.shiftId ?? null;
      if (open && !shiftId) {
        // ältere Sitzungen ohne ID: zusammenhängende Sitzungen der laufenden Schicht nachträglich verknüpfen
        const chain = [open.id];
        let start = open.startedAt;
        for (let i = 0; i < 500; i++) {
          const p = await tx.dutySession.findFirst({ where: { userId, endedAt: start }, select: { id: true, startedAt: true, shiftId: true } });
          if (!p) break;
          chain.push(p.id); start = p.startedAt;
          if (p.shiftId) { shiftId = p.shiftId; break; }
        }
        shiftId ??= newShiftId(start);
        await tx.dutySession.updateMany({ where: { id: { in: chain } }, data: { shiftId } });
      }
      if (!open && status !== 'OFF_DUTY') shiftId = newShiftId(at);
      let created = null;
      if (status !== 'OFF_DUTY') {
        const pers = await tx.personnel.findFirst({ where: { userId } });
        // servereigene Dienstzeit: Akten-Bereich des Servers (bzw. der gemeinsamen Shift-Log-Gruppe); ohne Server gemeinsamer Bestand
        created = await tx.dutySession.create({ data: { userId, serverId: recordSpace() ?? null, status, startedAt: at, lastActivityAt: at, unitId: d.unitId, shiftType: type?.id ?? null, shiftId, callsign: (d.callsign ?? pers?.callsign ?? undefined)?.toUpperCase() } });
      }
      if (shiftId) {
        const parts = await tx.dutySession.findMany({ where: { userId, shiftId }, select: { status: true, startedAt: true, endedAt: true } });
        const sec = (x: (typeof parts)[number]) => Math.max(0, Math.round(((x.endedAt ?? at).getTime() - x.startedAt.getTime()) / 1000));
        summary = { shiftId, startedAt: new Date(Math.min(...parts.map((x) => x.startedAt.getTime()))),
          workSeconds: parts.filter((x) => x.status !== 'BREAK').reduce((n, x) => n + sec(x), 0), breakSeconds: parts.filter((x) => x.status === 'BREAK').reduce((n, x) => n + sec(x), 0) };
      }
      await this.audit.record(actor, { action: targetUserId && targetUserId !== actor.userId ? 'duty.status.set_by_supervisor' : 'duty.status', module: 'team', entityType: 'User', entityId: userId, before: { status: open?.status ?? 'OFF_DUTY' }, after: { status } }, tx);
      return created ?? { status: 'OFF_DUTY' };
    }).then(async (r) => {
      this.rt.publish('team', 'duty.changed', { userId, status });
      const before = (previous as { status: string; startedAt: Date; shiftType: string | null } | null);
      const t = type as ShiftType | null;
      if ((before?.status ?? 'OFF_DUTY') !== status || (t && status !== 'OFF_DUTY' && t.id !== before?.shiftType)) await this.notifyDiscord(actor, userId, status, before, cfg, t, summary as ShiftSummary | null);
      return r;
    });
  }

  /**
   * Discord-Abgleich: Dienst-Rollen (Im Dienst/Pause/Training/Verwaltung) und Meldung im Dienst-Channel.
   * Wird nur eingereiht, wenn ein Dienst-Channel oder eine Dienst-Rolle eingestellt ist. Fehler stören den Statuswechsel nie.
   */
  private async notifyDiscord(actor: Actor, userId: string, status: string, before: { status: string; startedAt: Date } | null, cfg: ShiftsConfig, type: ShiftType | null, summary: ShiftSummary | null) {
    try {
      const ch = await this.discord.channels();
      // Schichten-Modul an: Rollen und Log-Channel der Schicht-Art; sonst die Dienst-Rollen aus den Einstellungen
      const shift = cfg.enabled && cfg.types.length ? { ...ShiftsService.roleChanges(cfg, type, status), channelId: type?.logChannelId ?? null, name: type?.name ?? null } : null;
      const roles = shift ? shift.add.length + shift.remove.length > 0 : !!(ch.dutyRole || ch.breakRole || ch.trainingRole || ch.adminDutyRole);
      if (!ch.duty && !roles && !shift?.channelId) return;
      const [user, link] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, personnel: { ...onePersonnel(), select: { callsign: true, rank: true } } } }),
        this.prisma.discordLink.findUnique({ where: { userId } }),
      ]);
      const by = actor.userId && actor.userId !== userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
      await this.discord.enqueue('duty', 'duty.changed', {
        discordId: link?.discordId ?? null, name: user?.displayName ?? '—', callsign: user?.personnel[0]?.callsign ?? null, rank: user?.personnel[0]?.rank ?? null,
        status, previous: before?.status ?? 'OFF_DUTY', previousMinutes: before ? Math.round((Date.now() - before.startedAt.getTime()) / 60_000) : null,
        previousSeconds: before ? Math.round((Date.now() - before.startedAt.getTime()) / 1000) : null, setBy: by?.displayName ?? null,
        // Shift-Log wie Trident: Schicht-ID, Beginn der Schicht, Gesamtzeit ohne Pausen, Pausenzeit
        ...(summary ? { shiftId: summary.shiftId, shiftStartedAt: summary.startedAt.toISOString(), totalSeconds: summary.workSeconds, breakSeconds: summary.breakSeconds } : {}),
        ...(shift ? { shiftType: shift.name, roles: { add: shift.add, remove: shift.remove }, ...(shift.channelId ? { channelId: shift.channelId } : {}) } : {}),
      }, { always: roles || !!shift?.channelId });
    } catch { /* best effort */ }
  }

  private touched = new Map<string, number>();
  /** Aktivität merken (höchstens einmal pro Minute in die Datenbank). Nur laufende Schichten „Im Dienst“. */
  async touch(userId: string, force = false) {
    const now = Date.now();
    if (!force && now - (this.touched.get(userId) ?? 0) < 60_000) return;
    this.touched.set(userId, now);
    if (this.touched.size > 5000) this.touched.clear();
    await this.prisma.dutySession.updateMany({ where: { userId, endedAt: null, status: 'ON_DUTY' }, data: { lastActivityAt: new Date(now) } }).catch(() => undefined);
  }

  /** „Bin noch im Dienst“ / Herzschlag aus dem Dashboard. */
  async active(userId: string) {
    await this.touch(userId, true);
    const open = await this.prisma.dutySession.findFirst({ where: { userId, endedAt: null } });
    return { onDuty: open?.status === 'ON_DUTY', status: open?.status ?? 'OFF_DUTY' };
  }

  /**
   * Jede Minute: Wer „Im Dienst“ ist und seit `afterMinutes` nichts gemacht hat, bekommt eine Erinnerung (Discord-DM mit Buttons + Glocke im Dashboard).
   * Mit `autoOffMinutes` endet die Schicht automatisch, wenn danach weiter nichts passiert. Pause/Training/Verwaltung sind ausgenommen.
   */
  async remindTick(now = new Date()) {
    const { reminder: r } = await this.shifts.config();
    const out = { reminded: 0, ended: 0 };
    if (!r.enabled) return out;
    const sessions = await this.prisma.dutySession.findMany({ where: { endedAt: null, status: 'ON_DUTY' } });
    for (const s of sessions) {
      const last = Math.max(s.startedAt.getTime(), s.lastActivityAt?.getTime() ?? 0);
      const link = await this.prisma.discordLink.findUnique({ where: { userId: s.userId } });
      if (s.remindedAt && s.remindedAt.getTime() >= last) {
        // schon erinnert, seitdem nichts passiert
        if (r.autoOffMinutes > 0 && now.getTime() - s.remindedAt.getTime() >= r.autoOffMinutes * 60_000) {
          await this.setStatus({ userId: null }, 'OFF_DUTY', {}, s.userId).catch(() => undefined);
          const minutes = Math.round((now.getTime() - s.startedAt.getTime()) / 60_000);
          await this.prisma.notification.create({ data: { userId: s.userId, type: 'DUTY_REMINDER', title: 'Deine Schicht wurde automatisch beendet', body: `Keine Aktivität seit ${Math.round((now.getTime() - last) / 60_000)} Minuten.` } });
          if (link) await this.discord.enqueue('duty', 'duty.reminder', { kind: 'ended', discordId: link.discordId, idleMinutes: Math.round((now.getTime() - last) / 60_000), shiftMinutes: minutes }, { always: true });
          out.ended++;
        }
        continue;
      }
      if (now.getTime() - last < r.afterMinutes * 60_000) continue;
      await this.prisma.dutySession.update({ where: { id: s.id }, data: { remindedAt: now } });
      const idle = Math.round((now.getTime() - last) / 60_000);
      await this.prisma.notification.create({ data: { userId: s.userId, type: 'DUTY_REMINDER', title: 'Bist du noch im Dienst?', body: `Seit ${idle} Minuten keine Aktivität.${r.autoOffMinutes ? ` Ohne Reaktion endet deine Schicht in ${r.autoOffMinutes} Minuten automatisch.` : ''}` } });
      if (link) await this.discord.enqueue('duty', 'duty.reminder', { kind: 'reminder', discordId: link.discordId, idleMinutes: idle, autoOffMinutes: r.autoOffMinutes }, { always: true });
      this.rt.publish('team', 'duty.reminder', { userId: s.userId });
      out.reminded++;
    }
    return out;
  }

  team() {
    return this.prisma.dutySession.findMany({
      where: { endedAt: null, ...recordWhere() },
      include: { user: { select: { id: true, displayName: true, personnel: { ...onePersonnel(), select: { rank: true, callsign: true } } } } },
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
      where: { ...(userId ? { userId } : {}), ...recordWhere(), OR: [{ endedAt: null }, { endedAt: { gt: since } }] },
      include: { user: { select: { displayName: true, personnel: { ...onePersonnel(), select: { rank: true, callsign: true } } } } },
    });
    const rows = new Map<string, { userId: string; name: string; rank: string | null; callsign: string | null; minutes: number; byStatus: Record<string, number>; sessions: number }>();
    for (const s of sessions) {
      const from = Math.max(s.startedAt.getTime(), since.getTime());
      const to = (s.endedAt ?? now).getTime();
      if (to <= from) continue;
      const r = rows.get(s.userId) ?? { userId: s.userId, name: s.user.displayName, rank: s.user.personnel[0]?.rank ?? null, callsign: s.user.personnel[0]?.callsign ?? null, minutes: 0, byStatus: {}, sessions: 0 };
      const min = (to - from) / 60_000;
      r.minutes += min; r.byStatus[s.status] = (r.byStatus[s.status] ?? 0) + min; r.sessions++;
      rows.set(s.userId, r);
    }
    const round = <T extends { minutes: number; byStatus: Record<string, number> }>(r: T): T => ({ ...r, minutes: Math.round(r.minutes), byStatus: Object.fromEntries(Object.entries(r.byStatus).map(([k, v]) => [k, Math.round(v)])) });
    const users = [...rows.values()].map(round).sort((a, b) => b.minutes - a.minutes);
    return { days, since, users };
  }

  /** Gesamtwerte aller Schichten eines Benutzers (Discord: `/shift manage`): Anzahl und Zeit im Dienst ohne Pausen. */
  async shiftStats(userId: string) {
    const sessions = await this.prisma.dutySession.findMany({ where: { userId, ...recordWhere() }, select: { startedAt: true, endedAt: true, status: true }, orderBy: { startedAt: 'asc' } });
    const now = Date.now();
    let count = 0, ms = 0, prevEnd: number | null = null;
    for (const s of sessions) {
      // nahtloser Statuswechsel (Im Dienst ↔ Pause) gehört zur selben Schicht – wie in `shiftLog`
      if (prevEnd !== s.startedAt.getTime()) count++;
      const end = s.endedAt?.getTime() ?? now;
      if (s.status !== 'BREAK') ms += Math.max(0, end - s.startedAt.getTime());
      prevEnd = s.endedAt?.getTime() ?? null;
    }
    return { count, minutes: Math.round(ms / 60_000), seconds: Math.round(ms / 1000) };
  }

  /** Rangliste: Zeit im Dienst ohne Pausen, nur Name/Rufzeichen (keine Aufschlüsselung wie bei `hours`). */
  async leaderboard(days: number, me: string) {
    const { users } = await this.hours(days);
    const rows = users.map((u) => ({ userId: u.userId, name: u.name, callsign: u.callsign, minutes: u.minutes - (u.byStatus.BREAK ?? 0) }))
      .filter((u) => u.minutes > 0).sort((a, b) => b.minutes - a.minutes);
    return { days, me, users: rows };
  }

  /**
   * Schicht-Logs: zusammenhängende Dienst-Sitzungen (Im Dienst ↔ Pause ↔ Schichtwechsel) bis „Außer Dienst“ ergeben eine Schicht.
   * Je Schicht: wer, Schichtart, Beginn/Ende, Dauer, Pausen und wer sie gestartet/beendet hat (aus dem Audit-Log).
   */
  async shiftLog(f: { days: number; userId?: string; shiftType?: string; discordId?: string }) {
    // Discord-Mitglied (`/shift admin`) → Benutzer; nicht verknüpft = keine Schichten
    let member: { userId: string; name: string } | null | undefined;
    if (f.discordId) {
      const link = await this.prisma.discordLink.findUnique({ where: { discordId: f.discordId }, select: { userId: true } });
      const user = link && await this.prisma.user.findUnique({ where: { id: link.userId }, select: { displayName: true } });
      if (!link || !user) return { days: f.days, since: new Date(Date.now() - f.days * 86_400_000), member: null, items: [] };
      member = { userId: link.userId, name: user.displayName };
      f = { ...f, userId: link.userId };
    }
    const now = new Date();
    const since = new Date(now.getTime() - f.days * 86_400_000);
    // Sitzungen etwas vor dem Zeitraum mitnehmen, damit Schichten über die Grenze vollständig sind
    const sessions = await this.prisma.dutySession.findMany({
      where: { ...(f.userId ? { userId: f.userId } : {}), ...recordWhere(), OR: [{ endedAt: null }, { endedAt: { gt: new Date(since.getTime() - 86_400_000) } }] },
      include: { user: { select: { displayName: true, personnel: { ...onePersonnel(), select: { rank: true, callsign: true } } } } },
      orderBy: [{ userId: 'asc' }, { startedAt: 'asc' }],
    });
    type S = (typeof sessions)[number];
    const groups: S[][] = [];
    for (const s of sessions) {
      const g = groups[groups.length - 1];
      const prev = g?.[g.length - 1];
      // Statuswechsel beendet die alte Sitzung und startet die neue im selben Moment → gleiche Schicht
      if (prev && prev.userId === s.userId && prev.endedAt?.getTime() === s.startedAt.getTime()) g!.push(s);
      else groups.push([s]);
    }
    const cfg = await this.shifts.config();
    const typeName = (id: string | null) => (id ? cfg.types.find((t) => t.id === id)?.name ?? id : null);
    const shifts = groups.map((g) => {
      const first = g[0]!, last = g[g.length - 1]!;
      const end = last.endedAt;
      const ms = (s: S) => (s.endedAt ?? now).getTime() - s.startedAt.getTime();
      const types = [...new Set(g.map((s) => s.shiftType).filter((x): x is string => !!x))];
      return {
        id: first.id, shiftId: g.find((s) => s.shiftId)?.shiftId ?? null, userId: first.userId, name: first.user.displayName, rank: first.user.personnel[0]?.rank ?? null, callsign: last.callsign ?? first.user.personnel[0]?.callsign ?? null,
        shiftTypes: types, shiftType: typeName(types[0] ?? null), shiftTypeNames: types.map((t) => typeName(t)!),
        startedAt: first.startedAt, endedAt: end, active: !end, status: end ? 'OFF_DUTY' : last.status,
        minutes: Math.round(g.reduce((n, s) => n + ms(s), 0) / 60_000),
        breakMinutes: Math.round(g.filter((s) => s.status === 'BREAK').reduce((n, s) => n + ms(s), 0) / 60_000),
        breaks: g.filter((s) => s.status === 'BREAK').length,
        startedBy: null as string | null, endedBy: null as string | null,
      };
    }).filter((x) => (x.endedAt ?? now) > since && (!f.shiftType || x.shiftTypes.includes(f.shiftType)))
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, 500);
    // Wer hat gestartet/beendet? Audit-Eintrag zum Statuswechsel (selbst, per Discord oder durch die Schichtleitung)
    if (shifts.length) {
      const audits = await this.prisma.auditLog.findMany({
        where: { module: 'team', action: { in: ['duty.status', 'duty.status.set_by_supervisor'] }, entityType: 'User', entityId: { in: [...new Set(shifts.map((s) => s.userId))] }, createdAt: { gt: new Date(since.getTime() - 86_400_000) } },
        select: { actorUserId: true, entityId: true, createdAt: true },
      });
      const names = new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set(audits.map((a) => a.actorUserId).filter((x): x is string => !!x))] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
      const near = (userId: string, at: Date | null) => {
        if (!at) return null;
        const a = audits.filter((x) => x.entityId === userId && Math.abs(x.createdAt.getTime() - at.getTime()) < 10_000).sort((x, y) => Math.abs(x.createdAt.getTime() - at.getTime()) - Math.abs(y.createdAt.getTime() - at.getTime()))[0];
        return a?.actorUserId ? names.get(a.actorUserId) ?? null : null;
      };
      for (const s of shifts) { s.startedBy = near(s.userId, s.startedAt); s.endedBy = near(s.userId, s.endedAt); }
    }
    return { days: f.days, since, ...(member ? { member } : {}), items: shifts.map(({ shiftTypes: _, ...s }) => s) };
  }

  /** Team-Dashboard: pro aktivem Beamten Dienststatus, Einheit, aktueller Einsatz und letzte Statusänderung. */
  async overview() {
    const [people, open, units, assignments, cfg] = await Promise.all([
      this.prisma.personnel.findMany({ where: { employmentStatus: 'ACTIVE' }, include: { user: { select: { id: true, displayName: true, active: true } } }, orderBy: { callsign: 'asc' } }),
      this.prisma.dutySession.findMany({ where: { endedAt: null, ...recordWhere() } }),
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
        // Leitstelle: seit wann nichts mehr gemacht (Dashboard/MDT, Discord); `reminded` = Erinnerung ist raus, noch keine Reaktion
        lastActivityAt: session ? new Date(Math.max(session.startedAt.getTime(), session.lastActivityAt?.getTime() ?? 0)) : null,
        reminded: !!session?.remindedAt && session.remindedAt.getTime() >= Math.max(session.startedAt.getTime(), session.lastActivityAt?.getTime() ?? 0),
        shiftType: cfg.enabled ? cfg.types.find((t) => t.id === session?.shiftType)?.name ?? null : null,
        lastStatusChange: session?.startedAt ?? ended.get(p.userId) ?? null,
        unit: unit ? { id: unit.id, callsign: unit.callsign, status: unit.status } : null,
        currentIncident: inc,
      };
    });
  }
}
