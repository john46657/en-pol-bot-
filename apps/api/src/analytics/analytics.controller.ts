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
}
