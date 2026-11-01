import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NOTIFICATION_EVENTS, type NotificationPrefs } from '@enrp/shared';
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
const q = pageQuery.extend({ filter: z.enum(['unread', 'read', 'archived', 'all']).default('unread'), type: z.string().max(40).optional(), event: z.string().max(40).optional(), group: z.string().max(40).optional(), important: z.enum(['true', 'false']).optional() });
const eventKey = z.string().refine((k) => NOTIFICATION_EVENTS.some((e) => e.key === k), 'Unbekanntes Ereignis');
const prefsBody = z.object({ muted: z.array(eventKey).max(60).default([]), important: z.array(eventKey).max(60).default([]), dm: z.boolean().default(false), dmEvents: z.array(eventKey).max(60).default([]), reminders: z.boolean().default(true) });
const rulesBody = z.object({ disabled: z.array(eventKey).max(60) });
const feedQ = z.object({ scope: z.enum(['mdt', 'cad']), limit: z.coerce.number().int().min(1).max(50).default(10) });

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

  /** Ereigniskatalog (für Einstellungen und Filter). */
  @Get('events')
  events() { return NOTIFICATION_EVENTS; }

  /** Eigene Einstellungen: stumm, wichtig, Discord-DMs (nur mit Zustimmung), Erinnerungen. */
  @Get('preferences')
  async preferences(@CurrentUser() u: AuthUser) {
    const p = ((await this.prisma.userSettings.findUnique({ where: { userId: u.id }, select: { preferences: true } }))?.preferences as { notifications?: NotificationPrefs } | null)?.notifications ?? {};
    const linked = !!(await this.prisma.discordLink.findUnique({ where: { userId: u.id } }));
    return { muted: p.muted ?? [], important: p.important ?? [], dm: p.dm === true, dmEvents: p.dmEvents ?? [], reminders: p.reminders !== false, discordLinked: linked };
  }
  @Put('preferences')
  async savePreferences(@CurrentActor() a: Actor, @Body(zodBody(prefsBody)) b: z.infer<typeof prefsBody>) {
    // nur den Teil `notifications` ersetzen – Design, Favoriten usw. bleiben unverändert
    await this.prisma.$transaction(async (tx) => {
      const cur = ((await tx.userSettings.findUnique({ where: { userId: a.userId! }, select: { preferences: true } }))?.preferences ?? {}) as Record<string, unknown>;
      const old = (cur.notifications ?? {}) as Record<string, unknown>;
      const value = { ...cur, notifications: { ...old, ...b } } as Prisma.InputJsonValue;
      await tx.userSettings.upsert({ where: { userId: a.userId! }, create: { userId: a.userId!, preferences: value }, update: { preferences: value } });
      await this.audit.record(a, { action: 'notification.preferences', module: 'notifications', entityType: 'User', entityId: a.userId!, after: { dm: b.dm, muted: b.muted.length, reminders: b.reminders } }, tx);
    });
    return b;
  }

  /** Zustellregeln: Ereignisse systemweit abschalten (z. B. bei Störungen). */
  @Get('rules') @RequirePermission('notifications.manage')
  async rules() { return { disabled: await this.notify.disabledEvents() }; }
  @Put('rules') @RequirePermission('notifications.manage')
  async saveRules(@CurrentActor() a: Actor, @Body(zodBody(rulesBody)) b: z.infer<typeof rulesBody>) {
    const before = await this.notify.disabledEvents();
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: 'notifications.rules' }, create: { key: 'notifications.rules', value: b }, update: { value: b } });
      await this.audit.record(a, { action: 'notification.rules', module: 'notifications', entityType: 'SystemSetting', entityId: 'notifications.rules', before: { disabled: before }, after: b }, tx);
    });
    return b;
  }

  /** Dienstliche Benachrichtigungen für MDT bzw. Leitstelle (nur eigene, ungelesene, Ereignisse mit diesem Kanal). */
  @Get('feed')
  async feed(@CurrentUser() u: AuthUser, @Query(zodBody(feedQ)) f: z.infer<typeof feedQ>) {
    const events = NOTIFICATION_EVENTS.filter((e) => e.channels.includes(f.scope)).map((e) => e.key);
    const where = { userId: u.id, archivedAt: null, readAt: null, OR: [{ event: { in: events } }, ...(f.scope === 'cad' ? [] : [{ important: true }])] };
    const [items, unread] = await Promise.all([this.prisma.notification.findMany({ where, orderBy: [{ important: 'desc' }, { createdAt: 'desc' }], take: f.limit }), this.prisma.notification.count({ where })]);
    return { items, unread };
  }

  @Get()
  async list(@CurrentUser() u: AuthUser, @Query(zodBody(q)) f: z.infer<typeof q>) {
    const state = f.filter === 'unread' ? { readAt: null, archivedAt: null } : f.filter === 'read' ? { readAt: { not: null }, archivedAt: null } : f.filter === 'archived' ? { archivedAt: { not: null } } : {};
    // Persönlich ausgeblendete Arten (Einstellungen → Benachrichtigungen) erscheinen weder in der Liste noch im Zähler
    const prefs = (await this.prisma.userSettings.findUnique({ where: { userId: u.id }, select: { preferences: true } }))?.preferences as { notifications?: { muted?: string[] } } | null;
    const muted = prefs?.notifications?.muted ?? [];
    const groupEvents = f.group ? NOTIFICATION_EVENTS.filter((e) => e.group === f.group).map((e) => e.key) : null;
    const type = f.type ? { type: f.type } : muted.length ? { type: { notIn: muted } } : {};
    const where = { userId: u.id, ...state, ...type, ...(f.event ? { event: f.event } : groupEvents ? { event: { in: groupEvents } } : {}), ...(f.important ? { important: f.important === 'true' } : {}) };
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
