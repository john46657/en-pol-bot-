import { Injectable } from '@nestjs/common';
import { PermissionContext, PermissionGrant, resolvePermission, effectivePermissions, canDelegate } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors';
import { currentGuild } from '../common/guild-context';

/** Kein Rang (keine aktive Rolle) – darf keine Rollen verwalten. */
export const NO_RANK = Number.MAX_SAFE_INTEGER;

/** Lädt Rechte-Kontext aus DB; die Entscheidungslogik liegt zentral in @enrp/shared. */
@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * IDs aller aktiven Rollen des Benutzers (direkt und über Gruppen), die im Server der Anfrage gelten:
   * serverübergreifende Rollen immer, Server-Rollen nur in ihrem Server. Deaktivierte Rollen verleihen nichts.
   */
  async roleIdsFor(userId: string, guildId: string | null = currentGuild()): Promise<string[]> {
    const [direct, groups] = await Promise.all([
      this.prisma.userRole.findMany({ where: { userId }, select: { roleId: true } }),
      this.prisma.groupMember.findMany({ where: { userId }, select: { group: { select: { roles: { select: { roleId: true } } } } } }),
    ]);
    const ids = new Set<string>(direct.map((r) => r.roleId));
    for (const g of groups) for (const r of g.group.roles) ids.add(r.roleId);
    if (!ids.size) return [];
    return (await this.prisma.role.findMany({ where: { id: { in: [...ids] }, active: true, OR: [{ guildId: null }, ...(guildId ? [{ guildId }] : [])] }, select: { id: true } })).map((r) => r.id);
  }

  async contextFor(userId: string): Promise<PermissionContext> {
    const [overrides, roleIds] = await Promise.all([this.prisma.userPermissionOverride.findMany({ where: { userId } }), this.roleIdsFor(userId)]);
    const rolePerms = roleIds.length ? await this.prisma.rolePermission.findMany({ where: { roleId: { in: roleIds } } }) : [];
    const toGrant = (p: string, e: string): PermissionGrant => ({ permission: p, effect: e === 'DENY' ? 'DENY' : 'ALLOW' });
    return {
      userOverrides: overrides.map((o) => toGrant(o.permissionKey, o.effect)),
      roleGrants: rolePerms.map((r) => toGrant(r.permissionKey, r.effect)),
    };
  }

  async check(userId: string, permission: string) {
    return resolvePermission(await this.contextFor(userId), permission);
  }

  async has(userId: string, permission: string): Promise<boolean> {
    return (await this.check(userId, permission)).allowed;
  }

  async assert(userId: string, permission: string): Promise<void> {
    if (!(await this.has(userId, permission))) throw new AppError('PERMISSION_DENIED', 'Dafür fehlt dir die Berechtigung.');
  }

  async effective(userId: string) {
    return effectivePermissions(await this.contextFor(userId));
  }

  // ---- Rollen-Hierarchie (kleinere Priorität = höherer Rang) ----

  /** Höchster Rang des Benutzers = kleinste Priorität seiner aktiven Rollen. */
  async rankOf(userId: string): Promise<number> {
    const ids = await this.roleIdsFor(userId);
    if (!ids.length) return NO_RANK;
    const r = await this.prisma.role.aggregate({ where: { id: { in: ids } }, _min: { priority: true } });
    return r._min.priority ?? NO_RANK;
  }

  /** Serverbesitzer = aktive Rolle „System Administrator“ (bei Discord-Login über ADMIN_DISCORD_IDS vergeben). */
  async isOwner(userId: string): Promise<boolean> {
    const ids = await this.roleIdsFor(userId);
    return ids.length > 0 && (await this.prisma.role.count({ where: { id: { in: ids }, name: 'System Administrator' } })) > 0;
  }

  /** Nur Rollen strikt unterhalb des eigenen Rangs dürfen verwaltet, vergeben oder entzogen werden (Besitzer: alle). */
  async assertOutranksRole(actorId: string, rolePriority: number, roleName?: string) {
    if (await this.isOwner(actorId)) return;
    if ((await this.rankOf(actorId)) >= rolePriority) throw new AppError('PERMISSION_DENIED', `Du kannst nur Rollen verwalten, die unter deinem eigenen Rang stehen${roleName ? ` („${roleName}“ tut das nicht)` : ''}.`);
  }

  /** Andere Benutzer nur verwalten, wenn man sie im Rang übertrifft (Benutzer ohne Rolle: jeder mit Rang). */
  async assertOutranksUser(actorId: string, targetId: string) {
    if (await this.isOwner(actorId)) return;
    const [a, t] = await Promise.all([this.rankOf(actorId), this.rankOf(targetId)]);
    if (a === NO_RANK || (t !== NO_RANK && a >= t)) throw new AppError('PERMISSION_DENIED', 'Du kannst nur Benutzer verwalten, die unter deinem Rang stehen.');
  }

  /** Erlauben darf man nur, was man selbst besitzt (keine Rechteausweitung über den Editor). */
  async assertCanDelegate(actorId: string, permissions: string[]) {
    if (!permissions.length) return;
    const ctx = await this.contextFor(actorId);
    const bad = permissions.filter((p) => !canDelegate(ctx, p));
    if (bad.length) throw new AppError('PERMISSION_DENIED', `Du kannst keine Berechtigungen vergeben, die du selbst nicht hast: ${bad.slice(0, 5).join(', ')}.`);
  }
}
