import { currentGuild } from '../common/guild-context';
import { Injectable, Logger } from '@nestjs/common';
import { can } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

export interface NotifyInput { type: string; title: string; body?: string; entityType?: string; entityId?: string }

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
      await this.prisma.notification.createMany({ data: ids.map((userId) => ({ userId, type: n.type, title: n.title.slice(0, 200), body: n.body?.slice(0, 1000), entityType: n.entityType, entityId: n.entityId })) });
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
}
