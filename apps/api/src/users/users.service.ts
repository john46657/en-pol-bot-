import { Injectable } from '@nestjs/common';
import { isPermissionKey, isValidRobloxUserId } from '@enrp/shared';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { hashPassword } from '../auth/password';
import { AuthService } from '../auth/auth.service';
import { PermissionService } from '../authz/permission.service';
import { AppError } from '../common/errors';
import { RealtimeService } from '../realtime/realtime.service';
import { currentGuild } from '../common/guild-context';
import { PageQuery, pageResult, skipTake } from '../common/pagination';

const publicSelect = {
  id: true, username: true, displayName: true, email: true, robloxUserId: true, robloxUsername: true, robloxStatus: true,
  robloxVerifiedAt: true, active: true, lastLogin: true, createdAt: true, updatedAt: true,
  roles: { select: { role: { select: { id: true, name: true } } } },
  overrides: { select: { permissionKey: true, effect: true, reason: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly auth: AuthService, private readonly perms: PermissionService, private readonly rt: RealtimeService) {}

  /** Rollen-/Rechteänderungen an sich selbst sind verboten (Vier-Augen-Prinzip, verhindert Selbst-Eskalation). */
  private assertNotSelf(actor: Actor, id: string) {
    if (actor.userId === id) throw new AppError('CONFLICT', 'You cannot change your own roles or permission overrides.');
  }

  /** Mindestens ein aktiver System Administrator muss bestehen bleiben. */
  private async assertAdminRemains(tx: Tx, targetId: string) {
    const role = await tx.role.findUnique({ where: { name: 'System Administrator' } });
    if (!role) return;
    const others = await tx.userRole.count({ where: { roleId: role.id, userId: { not: targetId }, user: { active: true } } });
    const targetIsAdmin = await tx.userRole.count({ where: { roleId: role.id, userId: targetId } });
    if (targetIsAdmin && others === 0) throw new AppError('CONFLICT', 'At least one active System Administrator must remain.');
  }

  async list(p: PageQuery) {
    const where = p.q ? { OR: [{ username: { contains: p.q, mode: 'insensitive' as const } }, { displayName: { contains: p.q, mode: 'insensitive' as const } }, { robloxUserId: p.q }] } : {};
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, select: publicSelect, orderBy: { username: 'asc' }, ...skipTake(p) }),
      this.prisma.user.count({ where }),
    ]);
    return pageResult(items, total, p);
  }

  async get(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: publicSelect });
    if (!u) throw new AppError('NOT_FOUND', 'User not found.');
    return u;
  }

  async create(actor: Actor, d: { username: string; displayName: string; password: string; email?: string; roleIds?: string[] }) {
    if (d.roleIds?.length) {
      await this.perms.assert(actor.userId!, 'roles.manage'); // users.manage allein darf keine Rollen vergeben
      for (const r of await this.prisma.role.findMany({ where: { id: { in: d.roleIds } } })) await this.perms.assertOutranksRole(actor.userId!, r.priority, r.name);
    }
    const passwordHash = await hashPassword(d.password);
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { username: d.username.toLowerCase(), displayName: d.displayName, email: d.email, passwordHash, roles: { create: (d.roleIds ?? []).map((roleId) => ({ roleId })) }, settings: { create: {} } },
        select: publicSelect,
      });
      await this.audit.record(actor, { action: 'user.create', module: 'users', entityType: 'User', entityId: u.id, after: u }, tx);
      return u;
    });
  }

  /** Manuelle Roblox-ID-Hinterlegung durch Administratoren. Keine Identität wird geraten. */
  async setRoblox(actor: Actor, id: string, d: { robloxUserId: string | null; robloxUsername?: string }) {
    if (d.robloxUserId !== null && !isValidRobloxUserId(d.robloxUserId)) throw new AppError('VALIDATION_FAILED', 'Invalid Roblox user id.');
    const before = await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: d.robloxUserId === null
          ? { robloxUserId: null, robloxUsername: null, robloxStatus: 'UNVERIFIED', robloxVerifiedAt: null, robloxVerifiedById: null }
          : { robloxUserId: d.robloxUserId, robloxUsername: d.robloxUsername, robloxStatus: 'MANUAL', robloxVerifiedAt: new Date(), robloxVerifiedById: actor.userId },
        select: publicSelect,
      });
      await this.audit.record(actor, { action: 'user.roblox.set', module: 'users', entityType: 'User', entityId: id, before: { robloxUserId: before.robloxUserId }, after: { robloxUserId: u.robloxUserId, status: u.robloxStatus } }, tx);
      return u;
    });
  }

  async setActive(actor: Actor, id: string, active: boolean, reason?: string) {
    if (!active && id === actor.userId) throw new AppError('CONFLICT', 'You cannot disable your own account.');
    await this.get(id);
    await this.perms.assertOutranksUser(actor.userId!, id); // Sperren/Entsperren nur unterhalb des eigenen Rangs
    const u = await this.prisma.$transaction(async (tx) => {
      if (!active) await this.assertAdminRemains(tx, id);
      const r = await tx.user.update({ where: { id }, data: { active }, select: publicSelect });
      await this.audit.record(actor, { action: active ? 'user.enable' : 'user.disable', module: 'users', entityType: 'User', entityId: id, reason }, tx);
      return r;
    });
    if (!active) await this.auth.revokeAllSessions(id);
    return u;
  }

  async setRoles(actor: Actor, id: string, roleIds: string[]) {
    this.assertNotSelf(actor, id);
    const before = await this.get(id);
    await this.perms.assertOutranksUser(actor.userId!, id);
    // Nur Rollen unterhalb des eigenen Rangs dürfen hinzukommen oder wegfallen
    const old = before.roles.map((r) => r.role.id);
    const touched = [...roleIds.filter((r) => !old.includes(r)), ...old.filter((r) => !roleIds.includes(r))];
    const roles = await this.prisma.role.findMany({ where: { id: { in: touched } } });
    if (roles.length !== new Set(touched).size) throw new AppError('NOT_FOUND', 'Role not found.');
    const g = currentGuild();
    for (const r of roles) {
      if (g && r.guildId && r.guildId !== g) throw new AppError('NOT_FOUND', 'Role not found.'); // Server getrennt
      await this.perms.assertOutranksRole(actor.userId!, r.priority, r.name);
    }
    return this.prisma.$transaction(async (tx) => {
      const adminRole = await tx.role.findUnique({ where: { name: 'System Administrator' } });
      if (adminRole && !roleIds.includes(adminRole.id)) await this.assertAdminRemains(tx, id);
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: id, roleId })) });
      const after = await tx.user.findUniqueOrThrow({ where: { id }, select: publicSelect });
      this.rt.publishToUser(id, 'permissions.changed', {});
      await this.audit.record(actor, { action: 'user.roles.set', module: 'permissions', entityType: 'User', entityId: id, before: before.roles, after: after.roles }, tx);
      return after;
    });
  }

  async setOverride(actor: Actor, id: string, d: { permission: string; effect: 'ALLOW' | 'DENY'; reason?: string }) {
    this.assertNotSelf(actor, id);
    if (!isPermissionKey(d.permission)) throw new AppError('VALIDATION_FAILED', `Unknown permission "${d.permission}".`);
    await this.get(id);
    await this.perms.assertOutranksUser(actor.userId!, id);
    if (d.effect === 'ALLOW') await this.perms.assertCanDelegate(actor.userId!, [d.permission]);
    return this.prisma.$transaction(async (tx) => {
      const prev = await tx.userPermissionOverride.findUnique({ where: { userId_permissionKey: { userId: id, permissionKey: d.permission } } });
      const o = await tx.userPermissionOverride.upsert({
        where: { userId_permissionKey: { userId: id, permissionKey: d.permission } },
        create: { userId: id, permissionKey: d.permission, effect: d.effect, reason: d.reason, createdById: actor.userId },
        update: { effect: d.effect, reason: d.reason, createdById: actor.userId },
      });
      this.rt.publishToUser(id, 'permissions.changed', {});
      await this.audit.record(actor, { action: 'user.override.add', module: 'permissions', entityType: 'User', entityId: id, before: prev, after: o, reason: d.reason }, tx);
      return o;
    });
  }

  async removeOverride(actor: Actor, id: string, permission: string) {
    this.assertNotSelf(actor, id);
    await this.perms.assertOutranksUser(actor.userId!, id); // auch das Aufheben einer Sperre (DENY) nur von oben
    await this.prisma.$transaction(async (tx) => {
      const prev = await tx.userPermissionOverride.findUnique({ where: { userId_permissionKey: { userId: id, permissionKey: permission } } });
      if (!prev) throw new AppError('NOT_FOUND', 'Override not found.');
      await tx.userPermissionOverride.delete({ where: { id: prev.id } });
      this.rt.publishToUser(id, 'permissions.changed', {});
      await this.audit.record(actor, { action: 'user.override.remove', module: 'permissions', entityType: 'User', entityId: id, before: prev }, tx);
    });
  }
}
