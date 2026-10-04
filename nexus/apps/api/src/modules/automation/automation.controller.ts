import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { prisma } from '@nexus/database';
import { JOBS } from '@nexus/jobs';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';

/** Automatisierung: Plan und letzte Läufe der Hintergrund-Jobs, Zustand der Benachrichtigungs-Warteschlange dieses Servers. */
@ApiTags('Automation')
@ApiBearerAuth()
@Controller('guilds/:guildId/automation')
export class AutomationController {
  @Get()
  @RequirePermissions('config.view')
  async status(@GuildId() guildId: string) {
    const runs = await prisma.jobRun.findMany({ where: { name: { in: JOBS.map((j) => j.name) } }, orderBy: { startedAt: 'desc' }, take: 300 });
    const [byStatus, failed] = await Promise.all([
      prisma.notification.groupBy({ by: ['status'], where: { guildId }, _count: { _all: true } }),
      prisma.notification.findMany({ where: { guildId, status: 'FAILED' }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, kind: true, targetKind: true, targetId: true, lastError: true, attempts: true, createdAt: true } }),
    ]);
    return {
      jobs: JOBS.map((j) => {
        const mine = runs.filter((r) => r.name === j.name);
        const last = mine[0];
        return { ...j, lastRun: last ? { at: last.startedAt, ok: last.ok, error: last.error, summary: last.summary } : null, failedRecently: mine.slice(0, 5).filter((r) => !r.ok).length };
      }),
      notifications: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
      failedNotifications: failed,
    };
  }
}
