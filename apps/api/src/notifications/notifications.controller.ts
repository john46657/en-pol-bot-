import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentActor, CurrentUser, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { AuditService } from '../audit/audit.service';
import { NotifyService } from './notify.service';
import { currentGuild } from '../common/guild-context';
import type { AuthUser } from '../common/request-context';
import { zodBody } from '../common/zod.pipe';
import { pageQuery, pageResult, skipTake } from '../common/pagination';

const systemBody = z.object({ title: z.string().trim().min(3).max(200), body: z.string().trim().max(1000).optional() });
const q = pageQuery.extend({ filter: z.enum(['unread', 'read', 'archived', 'all']).default('unread'), type: z.string().max(40).optional() });

/** Jeder Benutzer sieht ausschließlich eigene Benachrichtigungen (immer per userId gefiltert). */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService, private readonly notify: NotifyService, private readonly audit: AuditService) {}

  /** ⚠️ Systemhinweis an alle Dashboard-Benutzer (des gewählten Servers). */
  @Post('system') @HttpCode(200) @RequirePermission('settings.manage')
  async system(@CurrentActor() a: Actor, @Body(zodBody(systemBody)) b: z.infer<typeof systemBody>) {
    const ids = await this.notify.usersWith('dashboard.view', { guildId: currentGuild() });
    await this.notify.notify(ids, { type: 'SYSTEM', title: `⚠️ ${b.title}`, body: b.body });
    await this.audit.record(a, { action: 'notification.system', module: 'settings', after: { title: b.title, recipients: ids.length } });
    return { recipients: ids.length };
  }

  @Get()
  async list(@CurrentUser() u: AuthUser, @Query(zodBody(q)) f: z.infer<typeof q>) {
    const state = f.filter === 'unread' ? { readAt: null, archivedAt: null } : f.filter === 'read' ? { readAt: { not: null }, archivedAt: null } : f.filter === 'archived' ? { archivedAt: { not: null } } : {};
    // Persönlich ausgeblendete Arten (Einstellungen → Benachrichtigungen) erscheinen weder in der Liste noch im Zähler
    const prefs = (await this.prisma.userSettings.findUnique({ where: { userId: u.id }, select: { preferences: true } }))?.preferences as { notifications?: { muted?: string[] } } | null;
    const muted = prefs?.notifications?.muted ?? [];
    const type = f.type ? { type: f.type } : muted.length ? { type: { notIn: muted } } : {};
    const where = { userId: u.id, ...state, ...type };
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(f) }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId: u.id, readAt: null, archivedAt: null, ...(muted.length ? { type: { notIn: muted } } : {}) } }),
    ]);
    return { ...pageResult(items, total, f), unread };
  }

  @Post('read-all') @HttpCode(200)
  async readAll(@CurrentUser() u: AuthUser) { return { updated: (await this.prisma.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } })).count }; }

  @Post(':id/read') @HttpCode(200)
  async read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return { updated: (await this.prisma.notification.updateMany({ where: { id, userId: u.id }, data: { readAt: new Date() } })).count }; }

  @Post(':id/archive') @HttpCode(200)
  async archive(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return { updated: (await this.prisma.notification.updateMany({ where: { id, userId: u.id }, data: { archivedAt: new Date(), readAt: new Date() } })).count }; }
}
