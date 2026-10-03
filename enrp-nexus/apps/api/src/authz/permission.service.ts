import { Injectable } from '@nestjs/common';
import { PermissionContext, PermissionGrant, resolvePermission, effectivePermissions } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors';

/** Lädt Rechte-Kontext aus DB; die Entscheidungslogik liegt zentral in @enrp/shared. */
@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async contextFor(userId: string): Promise<PermissionContext> {
    const [overrides, direct, groups] = await Promise.all([
      this.prisma.userPermissionOverride.findMany({ where: { userId } }),
      this.prisma.userRole.findMany({ where: { userId }, select: { roleId: true } }),
      this.prisma.groupMember.findMany({ where: { userId }, select: { group: { select: { roles: { select: { roleId: true } } } } } }),
    ]);
    const roleIds = new Set<string>(direct.map((r) => r.roleId));
    for (const g of groups) for (const r of g.group.roles) roleIds.add(r.roleId);
    const rolePerms = roleIds.size
      ? await this.prisma.rolePermission.findMany({ where: { roleId: { in: [...roleIds] } } })
      : [];
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
    if (!(await this.has(userId, permission))) throw new AppError('PERMISSION_DENIED', 'You do not have permission to perform this action.');
  }

  async effective(userId: string) {
    return effectivePermissions(await this.contextFor(userId));
  }
}
