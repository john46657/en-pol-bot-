import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { can } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import { CurrentUser, RequirePermission } from '../authz/decorators';
import type { AuthUser } from '../common/request-context';
import { zodBody } from '../common/zod.pipe';

const q = z.object({ days: z.coerce.number().int().min(1).max(366).default(30) });

/** Jede Kennzahl wird nur ausgeliefert, wenn der Benutzer die zugehörige Fachpermission besitzt. */
@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly prisma: PrismaService, private readonly perms: PermissionService) {}

  @Get('overview') @RequirePermission('analytics.view')
  async overview(@CurrentUser() u: AuthUser, @Query(zodBody(q)) f: z.infer<typeof q>) {
    const ctx = await this.perms.contextFor(u.id);
    const since = new Date(Date.now() - f.days * 86_400_000);
    const out: Record<string, unknown> = { days: f.days };
    if (can(ctx, 'incidents.view')) {
      const closed = await this.prisma.incident.findMany({ where: { closedAt: { gte: since }, status: 'CLOSED' }, select: { createdAt: true, closedAt: true } });
      const avg = closed.length ? closed.reduce((s, i) => s + (i.closedAt!.getTime() - i.createdAt.getTime()), 0) / closed.length / 60000 : null;
      out.incidents = { created: await this.prisma.incident.count({ where: { createdAt: { gte: since } } }), open: await this.prisma.incident.count({ where: { status: { notIn: ['CLOSED', 'CANCELLED'] } } }), closed: closed.length, avgHandlingMinutes: avg === null ? null : Math.round(avg) };
    }
    if (can(ctx, 'reports.review')) out.reports = { created: await this.prisma.report.count({ where: { createdAt: { gte: since } } }), open: await this.prisma.report.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }) };
    if (can(ctx, 'tickets.view')) out.tickets = { issued: await this.prisma.ticket.count({ where: { issuedAt: { gte: since }, status: { not: 'VOID' } } }), voided: await this.prisma.ticket.count({ where: { issuedAt: { gte: since }, status: 'VOID' } }) };
    if (can(ctx, 'complaints.view')) out.complaints = { received: await this.prisma.complaint.count({ where: { createdAt: { gte: since } } }), open: await this.prisma.complaint.count({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } }) };
    if (can(ctx, 'applications.view')) out.applications = { submitted: await this.prisma.application.count({ where: { createdAt: { gte: since } } }), pending: await this.prisma.application.count({ where: { status: { in: ['SUBMITTED', 'SCREENING', 'INTERVIEW', 'PENDING_DECISION'] } } }) };
    if (can(ctx, 'wanted.view')) out.wanted = { active: await this.prisma.wantedRecord.count({ where: { status: 'ACTIVE' } }) };
    // Sensible Personalstatistiken nur mit personnel.view
    if (can(ctx, 'personnel.view')) {
      const sessions = await this.prisma.dutySession.findMany({ where: { startedAt: { gte: since }, status: 'ON_DUTY' }, select: { startedAt: true, endedAt: true } });
      out.personnel = { totalDutyHours: Math.round(sessions.reduce((s, d) => s + ((d.endedAt ?? new Date()).getTime() - d.startedAt.getTime()), 0) / 3_600_000), academyResults: await this.prisma.academyResult.count({ where: { createdAt: { gte: since } } }) };
    }
    return out;
  }

  /**
   * Tagesverlauf für Diagramme (Tage in Europe/Berlin). Gleiche Rechte wie die Übersicht – je Reihe die Fachpermission.
   * Über Prisma-Abfragen (nicht SQL), damit die Server-Trennung automatisch greift.
   */
  @Get('trend') @RequirePermission('analytics.view')
  async trend(@CurrentUser() u: AuthUser, @Query(zodBody(q)) f: z.infer<typeof q>) {
    const ctx = await this.perms.contextFor(u.id);
    const key = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    const days = Array.from({ length: f.days }, (_, i) => key(new Date(Date.now() - (f.days - 1 - i) * 86_400_000)));
    const since = new Date(`${days[0]}T00:00:00Z`); since.setTime(since.getTime() - 2 * 3_600_000); // Berlin ist UTC+1/+2
    const count = (dates: Date[]) => { const m = new Map(days.map((d) => [d, 0])); for (const d of dates) { const k = key(d); if (m.has(k)) m.set(k, m.get(k)! + 1); } return [...m.values()]; };
    const series: { key: string; label: string; unit: string; values: number[] }[] = [];
    if (can(ctx, 'incidents.view')) series.push({ key: 'incidents', label: 'Einsätze erstellt', unit: 'Einsätze', values: count((await this.prisma.incident.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } })).map((x) => x.createdAt)) });
    if (can(ctx, 'reports.review')) series.push({ key: 'reports', label: 'Berichte erstellt', unit: 'Berichte', values: count((await this.prisma.report.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } })).map((x) => x.createdAt)) });
    if (can(ctx, 'applications.view')) series.push({ key: 'applications', label: 'Bewerbungen eingegangen', unit: 'Bewerbungen', values: count((await this.prisma.application.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } })).map((x) => x.createdAt)) });
    if (can(ctx, 'wanted.view')) series.push({ key: 'wanted', label: 'Fahndungen angelegt', unit: 'Fahndungen', values: count((await this.prisma.wantedRecord.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } })).map((x) => x.createdAt)) });
    if (can(ctx, 'personnel.view')) {
      // Dienststunden je Tag nach Dienstbeginn (Schichten über Mitternacht zählen zum Starttag)
      const sessions = await this.prisma.dutySession.findMany({ where: { startedAt: { gte: since }, status: 'ON_DUTY' }, select: { startedAt: true, endedAt: true } });
      const m = new Map(days.map((d) => [d, 0]));
      for (const x of sessions) { const k = key(x.startedAt); if (m.has(k)) m.set(k, m.get(k)! + ((x.endedAt ?? new Date()).getTime() - x.startedAt.getTime()) / 3_600_000); }
      series.push({ key: 'duty', label: 'Dienststunden', unit: 'Stunden', values: [...m.values()].map((h) => Math.round(h * 10) / 10) });
    }
    return { days, series };
  }
}
