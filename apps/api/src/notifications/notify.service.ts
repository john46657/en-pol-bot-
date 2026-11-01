import { currentGuild } from '../common/guild-context';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { can, deliveryFor, notificationEvent, type NotificationPrefs } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { webUrl } from '../common/web-url';

export interface NotifyInput { type: string; title: string; body?: string; entityType?: string; entityId?: string }
/** Ältere Benachrichtigungsarten → Ereignis im zentralen Katalog (für Filter, MDT/Leitstelle und Einstellungen). */
const LEGACY_EVENT: Record<string, string> = { APPLICATION: 'application.new', TICKET_CLAIMED: 'ticket.assigned' };

/** Benachrichtigung über den zentralen Ereigniskatalog (`NOTIFICATION_EVENTS`). */
export interface EmitInput {
  title: string;
  /** Text im Dashboard. Sensible Inhalte nur hier – nie in `dmText`, wenn sie nicht in eine DM gehören. */
  body?: string;
  /** Relativer Link zum Datensatz, z. B. `/shiftplan?id=…` */
  link?: string;
  entityType?: string; entityId?: string;
  /** Anlass – zusammen mit dem Ereignis und dem Empfänger eindeutig: dieselbe Benachrichtigung kommt nie doppelt. */
  dedupeKey?: string;
  /** Text der Discord-DM (nur bei Zustimmung des Empfängers). Standard: Titel + Link, ohne `body`. */
  dmText?: string;
}

/** Wie viele Empfänger höchstens je Ereignis (Schutz vor Massen-Benachrichtigungen). */
const MAX_RECIPIENTS = 500;

/**
 * Persönliche Benachrichtigungen: speichern + sofort an offene Dashboards melden (Popup).
 * Welche Arten jemand sehen will, stellt jeder selbst ein (ausgeblendete Arten filtert die Liste).
 * Fehler beim Benachrichtigen dürfen den Fachprozess nie stören.
 */
@Injectable()
export class NotifyService {
  private readonly log = new Logger('Notify');
  constructor(private readonly prisma: PrismaService, private readonly rt: RealtimeService) {}

  async notify(userIds: string[], n: NotifyInput) {
    const ids = [...new Set(userIds)].slice(0, MAX_RECIPIENTS);
    if (!ids.length) return;
    try {
      const event = LEGACY_EVENT[n.type] ?? null;
      await this.prisma.notification.createMany({ data: ids.map((userId) => ({ userId, type: n.type, event, important: !!(event && notificationEvent(event)?.important), title: n.title.slice(0, 200), body: n.body?.slice(0, 1000), entityType: n.entityType, entityId: n.entityId })) });
      for (const id of ids) this.rt.publishToUser(id, 'notification.new', { type: n.type, title: n.title.slice(0, 200) });
    } catch (e) { this.log.warn(`notification failed: ${e instanceof Error ? e.message : e}`); }
  }

  /** Aktive Benutzer mit einem Recht (im angegebenen Server bzw. serverübergreifend), ohne `exceptUserId`. Gebündelt: 5 Abfragen insgesamt. */
  async usersWith(permission: string, opts: { guildId?: string | null; exceptUserId?: string | null } = {}) {
    const users = await this.prisma.user.findMany({ where: { active: true, ...(opts.exceptUserId ? { id: { not: opts.exceptUserId } } : {}) }, select: { id: true }, take: 5000 });
    const ids = users.map((u) => u.id);
    // Server der Anfrage (Standard): dort gelten nur dessen Rollen und nur für bestätigte Mitglieder – wie im AuthorizationService
    const g = opts.guildId !== undefined ? opts.guildId : currentGuild();
    const [direct, groups, overrides, roles, server] = await Promise.all([
      this.prisma.userRole.findMany({ where: { userId: { in: ids } } }),
      this.prisma.groupMember.findMany({ where: { userId: { in: ids } }, select: { userId: true, group: { select: { roles: { select: { roleId: true } } } } } }),
      this.prisma.userPermissionOverride.findMany({ where: { userId: { in: ids }, guildId: g } }),
      this.prisma.role.findMany({ where: { active: true, ...(g ? { OR: [{ guildId: g }, { guildId: null, name: 'System Administrator' }] } : { guildId: null }) }, select: { id: true, guildId: true, name: true, priority: true } }),
      g ? this.prisma.discordServer.findUnique({ where: { guildId: g }, select: { id: true, memberships: { where: { status: 'MEMBER' }, select: { userId: true } } } }) : null,
    ]);
    const valid = new Set(roles.map((r) => r.id));
    const adminRole = roles.find((r) => r.guildId === null && r.name === 'System Administrator')?.id;
    const members = server ? new Set(server.memberships.map((m) => m.userId)) : null;
    const grants = await this.prisma.rolePermission.findMany({ where: { roleId: { in: [...valid] } } });
    const byRole = new Map<string, { permission: string; effect: 'ALLOW' | 'DENY'; rank?: number }[]>();
    const rankOf = new Map(roles.map((r) => [r.id, r.priority]));
    for (const x of grants) byRole.set(x.roleId, [...(byRole.get(x.roleId) ?? []), { permission: x.permissionKey, effect: x.effect === 'DENY' ? 'DENY' : 'ALLOW', rank: rankOf.get(x.roleId) }]);
    const rolesOf = new Map<string, Set<string>>();
    const add = (u: string, r: string) => { if (valid.has(r)) rolesOf.set(u, (rolesOf.get(u) ?? new Set()).add(r)); };
    for (const d of direct) {
      if (d.guildIds.length && !(g && d.guildIds.includes(g))) continue; // über Discord vergeben: nur auf diesen Servern
      if (g && d.roleId === adminRole && d.guildIds.length) continue; // globaler Admin nur manuell
      add(d.userId, d.roleId);
    }
    for (const m of groups) for (const r of m.group.roles) add(m.userId, r.roleId);
    const out: string[] = [];
    for (const id of ids) {
      if (members && !members.has(id) && !(adminRole && rolesOf.get(id)?.has(adminRole))) continue; // nur Mitglieder dieses Servers
      const ctx = { userOverrides: overrides.filter((o) => o.userId === id).map((o) => ({ permission: o.permissionKey, effect: (o.effect === 'DENY' ? 'DENY' : 'ALLOW') as 'ALLOW' | 'DENY' })), roleGrants: [...(rolesOf.get(id) ?? [])].flatMap((r) => byRole.get(r) ?? []) };
      if (can(ctx, permission)) out.push(id);
      if (out.length >= MAX_RECIPIENTS) break;
    }
    return out;
  }

  async notifyPermission(permission: string, n: NotifyInput, opts: { guildId?: string | null; exceptUserId?: string | null } = {}) {
    try { await this.notify(await this.usersWith(permission, opts), n); } catch (e) { this.log.warn(`notification failed: ${e instanceof Error ? e.message : e}`); }
  }

  /** Persönliche Benachrichtigungs-Einstellungen (UserSettings.preferences.notifications). */
  async prefsOf(userIds: string[]): Promise<Map<string, NotificationPrefs>> {
    const rows = await this.prisma.userSettings.findMany({ where: { userId: { in: userIds } }, select: { userId: true, preferences: true } });
    return new Map(rows.map((r) => [r.userId, ((r.preferences as { notifications?: NotificationPrefs } | null)?.notifications ?? {})]));
  }

  /** Vom Administrator abgeschaltete Ereignisse (notifications.manage). */
  async disabledEvents(): Promise<string[]> {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: 'notifications.rules' } }))?.value as { disabled?: unknown } | null;
    return Array.isArray(v?.disabled) ? v.disabled.filter((x): x is string => typeof x === 'string') : [];
  }

  /**
   * Zentrale Zustellung für Dashboard, MDT, Leitstelle und Discord: speichert je Empfänger (außer stummgeschaltet),
   * meldet offene Dashboards sofort, schickt eine DM nur mit Zustimmung des Empfängers. Mit `dedupeKey` kommt dieselbe
   * Benachrichtigung nie doppelt (auch nicht als DM) – z. B. wenn Dashboard und Discord gleichzeitig dieselbe Aktion auslösen.
   * Fehler stören den Fachprozess nie. Liefert die Anzahl neu gespeicherter Benachrichtigungen.
   */
  async emit(event: string, userIds: string[], n: EmitInput): Promise<number> {
    try {
      const def = notificationEvent(event);
      if (!def) { this.log.warn(`unknown notification event ${event}`); return 0; }
      if ((await this.disabledEvents()).includes(event)) return 0;
      const ids = [...new Set(userIds.filter(Boolean))].slice(0, MAX_RECIPIENTS);
      if (!ids.length) return 0;
      const prefs = await this.prefsOf(ids);
      const users = await this.prisma.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } });
      const active = new Set(users.map((u) => u.id));
      const created: string[] = [], dms: string[] = [];
      for (const userId of ids) {
        if (!active.has(userId)) continue;
        const d = deliveryFor(event, prefs.get(userId));
        if (!d.store && !d.dm) continue;
        let fresh = true;
        if (d.store) {
          try {
            await this.prisma.notification.create({ data: { userId, type: def.group.toUpperCase().slice(0, 40), event, important: d.important, title: n.title.slice(0, 200), body: n.body?.slice(0, 1000), link: n.link?.slice(0, 300), entityType: n.entityType, entityId: n.entityId, dedupeKey: n.dedupeKey ? `${event}:${n.dedupeKey}`.slice(0, 200) : null } });
            created.push(userId);
          } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') fresh = false; // schon benachrichtigt
            else throw e;
          }
        }
        if (d.dm && fresh) dms.push(userId);
      }
      for (const id of created) this.rt.publishToUser(id, 'notification.new', { type: event, title: n.title.slice(0, 200), important: !!def.important });
      if (dms.length) {
        const links = await this.prisma.discordLink.findMany({ where: { userId: { in: dms } }, select: { discordId: true } });
        const text = (n.dmText ?? n.title).slice(0, 3500);
        const url = n.link ? webUrl(n.link) : null;
        if (links.length) await this.prisma.discordOutbox.createMany({ data: links.map((l) => ({ type: 'bot.dm', channelKey: 'duty', payload: { discordId: l.discordId, message: { embeds: [{ title: def.label.slice(0, 256), description: `${text}${url ? `\n\n[Im Dashboard öffnen](${url})` : ''}`, color: def.important ? 0xf59e0b : 0x3b82f6, footer: 'Benachrichtigung · Einstellungen im Dashboard unter Persönlich' }] } } as unknown as Prisma.InputJsonValue })) });
      }
      return created.length;
    } catch (e) { this.log.warn(`notification ${event} failed: ${e instanceof Error ? e.message : e}`); return 0; }
  }

  /** Wie `emit`, an alle mit einem Recht (im Server der Anfrage). */
  async emitPermission(event: string, permission: string, n: EmitInput, opts: { guildId?: string | null; exceptUserId?: string | null } = {}) {
    try { return await this.emit(event, await this.usersWith(permission, opts), n); } catch (e) { this.log.warn(`notification failed: ${e instanceof Error ? e.message : e}`); return 0; }
  }
}
