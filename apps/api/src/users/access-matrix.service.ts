import { Injectable } from '@nestjs/common';
import { ACCESS_AREAS, accessDiff, accessLevelOf, applyAccessLevel, LOCKOUT_CRITICAL, moduleDef, moduleOfPermission, PERMISSION_CATALOG, resolvePermission, type AccessArea, type AccessLevel, type PermissionGrant } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { NotifyService } from '../notifications/notify.service';
import { AppError } from '../common/errors';
import { RolesService } from './roles.service';

/**
 * Zentraler Berechtigungseditor (Matrix Rolle × Bereich × Zugriffsstufe). Übersetzt Stufen in die bestehenden Einzelrechte und
 * nutzt dafür den RolesService (Rang-Regeln, „nur weitergeben, was man selbst hat“, Protokoll je Recht, Live-Aktualisierung).
 * Zusätzlich: Aussperrschutz – eine Änderung, nach der man selbst den Berechtigungseditor nicht mehr nutzen könnte, wird abgelehnt.
 */
@Injectable()
export class AccessMatrixService {
  constructor(private readonly prisma: PrismaService, private readonly roles: RolesService, private readonly perms: PermissionService, private readonly audit: AuditService, private readonly notify: NotifyService) {}

  areas() {
    return ACCESS_AREAS.map((a) => ({ key: a, actions: PERMISSION_CATALOG[a], module: moduleOfPermission(`${a}.x`), moduleName: moduleDef(moduleOfPermission(`${a}.x`))?.name ?? 'Grundsystem' }));
  }

  async matrix() {
    const roles = await this.roles.list();
    return {
      areas: this.areas(),
      roles: roles.map((r) => ({
        id: r.id, name: r.name, priority: r.priority, color: r.color, active: r.active, guildId: r.guildId, system: r.name === 'System Administrator', members: r._count.users,
        levels: Object.fromEntries(ACCESS_AREAS.map((a) => [a, accessLevelOf(a, r.permissions.map((p) => ({ permission: p.permissionKey, effect: p.effect })))])),
      })),
      priority: 'Benutzer-Sperre > Benutzer-Sonderrecht > höchste Rolle mit Angabe (Sperre vor Erlaubnis) > kein Zugriff',
    };
  }

  /** Vorschau: welche Einzelrechte ändern sich? (ohne zu speichern) */
  async preview(roleId: string, area: AccessArea, level: AccessLevel) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId }, include: { permissions: true } });
    if (!role) throw new AppError('NOT_FOUND', 'Rolle nicht gefunden.');
    const before = role.permissions.map((p) => ({ permission: p.permissionKey, effect: p.effect as 'ALLOW' | 'DENY' }));
    return accessDiff(before, applyAccessLevel(before, area, level));
  }

  async setLevel(actor: Actor, roleId: string, area: AccessArea, level: AccessLevel) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId }, include: { permissions: true } });
    if (!role) throw new AppError('NOT_FOUND', 'Rolle nicht gefunden.');
    const before = role.permissions.map((p) => ({ permission: p.permissionKey, effect: p.effect as 'ALLOW' | 'DENY' }));
    const after = applyAccessLevel(before, area, level);
    await this.assertNoLockout(actor.userId!, roleId, after);
    const updated = await this.roles.setPermissions(actor, roleId, after);
    const diff = accessDiff(before, after);
    if (diff.added.length || diff.removed.length) {
      await this.audit.record(actor, { action: 'role.access_level', module: 'permissions', entityType: 'Role', entityId: roleId, before: { role: role.name, area, level: accessLevelOf(area, before) }, after: { role: role.name, area, level, ...diff } });
      // Betroffene informieren (nur Hinweis, keine Details zu anderen Personen)
      const members = (await this.prisma.userRole.findMany({ where: { roleId }, select: { userId: true }, take: 500 })).map((m) => m.userId).filter((u) => u !== actor.userId);
      await this.notify.notify(members, { type: 'PERMISSIONS', title: `🔐 Berechtigungen der Rolle „${role.name}“ wurden geändert`, entityType: 'Role', entityId: roleId });
    }
    return updated;
  }

  /**
   * Aussperrschutz: Würde der Handelnde nach der Änderung den Berechtigungseditor (roles.view/roles.manage) verlieren, wird abgelehnt.
   * Globale Systemadministratoren sind ausgenommen (Rolle „System Administrator“ ist im Dashboard ohnehin nicht änderbar).
   */
  async assertNoLockout(userId: string, roleId: string, newGrants: { permission: string; effect: 'ALLOW' | 'DENY' }[]) {
    if (await this.perms.isOwner(userId)) return;
    const roleIds = await this.perms.roleIdsFor(userId);
    if (!roleIds.includes(roleId)) return;
    const ctx = await this.perms.contextFor(userId);
    const role = await this.prisma.role.findUniqueOrThrow({ where: { id: roleId }, select: { priority: true } });
    // Rechte aller übrigen Rollen aus der DB, die geänderte Rolle mit ihren neuen Rechten
    const otherRoles = roleIds.filter((r) => r !== roleId);
    const otherGrants: PermissionGrant[] = otherRoles.length ? (await this.prisma.rolePermission.findMany({ where: { roleId: { in: otherRoles } }, include: { role: { select: { priority: true } } } })).map((p) => ({ permission: p.permissionKey, effect: p.effect === 'DENY' ? 'DENY' : 'ALLOW', rank: p.role.priority })) : [];
    const simulated = { userOverrides: ctx.userOverrides, roleGrants: [...otherGrants, ...newGrants.map((g) => ({ ...g, rank: role.priority }))] };
    const lost = LOCKOUT_CRITICAL.filter((p) => resolvePermission(ctx, p).allowed && !resolvePermission(simulated, p).allowed);
    if (lost.length) throw new AppError('CONFLICT', `Diese Änderung würde dich selbst aus dem Berechtigungseditor aussperren (${lost.join(', ')}). Lass sie von einer anderen berechtigten Person durchführen.`, { reason: 'SELF_LOCKOUT' });
  }

  /** Effektive Rechte eines Benutzers je Bereich (mit Herkunft), für die Prüfung „wer darf was“. */
  async userLevels(userId: string) {
    const ctx = await this.perms.contextFor(userId);
    return ACCESS_AREAS.map((a) => {
      const actions = PERMISSION_CATALOG[a].map((x) => ({ action: x, ...resolvePermission(ctx, `${a}.${x}`) }));
      return { area: a, allowed: actions.filter((x) => x.allowed).map((x) => x.action), actions };
    });
  }
}
