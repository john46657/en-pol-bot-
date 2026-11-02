import { Controller, Get, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NOTIFICATION_EVENTS } from '@enrp/shared';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import { ShiftPlanService } from '../shiftplan/shiftplan.service';
import { ShiftPlanModule } from '../shiftplan/shiftplan.module';
import { CalendarService } from '../calendar/calendar.service';
import { CalendarModule } from '../calendar/calendar.module';
import { DocumentsService } from '../documents/documents.service';
import { DocumentsModule } from '../documents/documents.module';

/**
 * Gemeinsame Sicht für MDT und Leitstelle auf die Verwaltungsdaten (keine eigenen Daten, nur Zusammenführung).
 * Jeder Teil erscheint nur mit dem passenden Recht; Abwesenheitsgründe erscheinen nie in der Leitstelle.
 */
@ApiTags('workspace')
@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly prisma: PrismaService, private readonly perms: PermissionService, private readonly shifts: ShiftPlanService, private readonly cal: CalendarService, private readonly docs: DocumentsService) {}

  private feed(userId: string, scope: 'mdt' | 'cad', take = 8) {
    const events = NOTIFICATION_EVENTS.filter((e) => e.channels.includes(scope)).map((e) => e.key);
    return this.prisma.notification.findMany({ where: { userId, readAt: null, archivedAt: null, OR: [{ event: { in: events } }, ...(scope === 'mdt' ? [{ important: true }] : [])] }, orderBy: [{ important: 'desc' }, { createdAt: 'desc' }], take, select: { id: true, title: true, link: true, event: true, important: true, createdAt: true } });
  }

  /** MDT „Mein Dienst“: Schicht, Abteilung/Rang/Einheit, eigene Abwesenheit, Termine, Benachrichtigungen, Dokumente. */
  @Get('mdt') @RequirePermission('dashboard.view')
  async mdt(@CurrentActor() a: Actor) {
    const me = a.userId!;
    const has = (p: string) => this.perms.has(me, p);
    const now = new Date();
    const [personnel, duty, leave] = await Promise.all([
      this.prisma.personnel.findFirst({ where: { userId: me }, select: { rank: true, team: true, callsign: true, serviceNumber: true, office: true } }),
      this.prisma.dutySession.findFirst({ where: { userId: me, endedAt: null }, select: { status: true, callsign: true, unitId: true, startedAt: true } }),
      this.prisma.leaveRequest.findFirst({ where: { userId: me, status: 'APPROVED', endsAt: { gt: now } }, orderBy: { startsAt: 'asc' }, select: { number: true, startsAt: true, endsAt: true } }),
    ]);
    const unit = duty?.unitId ? await this.prisma.unit.findUnique({ where: { id: duty.unitId }, select: { callsign: true } }).catch(() => null) : null;
    return {
      profile: { rank: personnel?.rank ?? null, department: personnel?.team ?? null, callsign: personnel?.callsign ?? null, serviceNumber: personnel?.serviceNumber ?? null, office: personnel?.office ?? null },
      duty: duty ? { status: duty.status, since: duty.startedAt, unit: unit?.callsign ?? duty.callsign ?? null } : null,
      shift: (await has('shiftplan.view')) ? await this.shifts.current(a) : null,
      leave: leave ? { ...leave, active: leave.startsAt <= now } : null,
      events: (await has('calendar.view')) ? (await this.cal.upcoming(a, 7, 'mine')).slice(0, 6) : null,
      notifications: await this.feed(me, 'mdt'),
      documents: (await has('documents.view')) ? (await this.docs.list(a, {})).items.slice(0, 8).map((d) => ({ id: d.id, title: d.title, categoryLabel: d.categoryLabel, currentVersion: d.currentVersion })) : null,
    };
  }

  /** Leitstelle: Schichtbesetzung (geplant vs. im Dienst), Abwesende jetzt (nur Namen), dienstliche Termine heute, Systemmeldungen. */
  @Get('dispatch') @RequirePermission('cad.view')
  async dispatch(@CurrentActor() a: Actor) {
    const me = a.userId!;
    const now = new Date(), end = new Date(now.getTime() + 24 * 3_600_000);
    const canShifts = await this.perms.has(me, 'shiftplan.view');
    const staffing = canShifts ? await this.shifts.staffing(a, now) : null;
    let events: unknown[] | null = null;
    if (await this.perms.has(me, 'calendar.view')) events = (await this.cal.list(a, { from: now, to: end })).items.filter((e) => (e as { source: string; status: string }).source === 'calendar' && (e as { status: string }).status === 'SCHEDULED').slice(0, 10);
    return {
      staffing,
      absentNow: staffing ? staffing.shifts.flatMap((s) => s.plannedAbsent) : null,
      events,
      notifications: await this.feed(me, 'cad'),
    };
  }
}

@Module({ imports: [ShiftPlanModule, CalendarModule, DocumentsModule], controllers: [WorkspaceController] })
export class WorkspaceModule {}
