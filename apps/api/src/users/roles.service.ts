import { Injectable } from '@nestjs/common';
import { ALL_PERMISSIONS, isPermissionKey } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  list() {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' }, include: { permissions: { select: { permissionKey: true, effect: true } } } });
  }

  catalog() { return ALL_PERMISSIONS; }

  async create(actor: Actor, d: { name: string; description?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.role.create({ data: d });
      await this.audit.record(actor, { action: 'role.create', module: 'roles', entityType: 'Role', entityId: r.id, after: r }, tx);
      return r;
    });
  }

  async setPermissions(actor: Actor, id: string, grants: { permission: string; effect: 'ALLOW' | 'DENY' }[]) {
    for (const g of grants) {
      const valid = isPermissionKey(g.permission) || g.permission === '*' || (g.permission.endsWith('.*') && ALL_PERMISSIONS.some((p) => p.startsWith(g.permission.slice(0, -1))));
      if (!valid) throw new AppError('VALIDATION_FAILED', `Unknown permission "${g.permission}".`);
    }
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { id }, include: { permissions: true } });
      if (!role) throw new AppError('NOT_FOUND', 'Role not found.');
      const keys = [...new Set(grants.map((g) => g.permission))];
      for (const k of keys) await tx.permission.upsert({ where: { key: k }, create: { key: k, module: k.split('.')[0] ?? k }, update: {} });
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({ data: grants.map((g) => ({ roleId: id, permissionKey: g.permission, effect: g.effect })), skipDuplicates: true });
      const after = await tx.role.findUniqueOrThrow({ where: { id }, include: { permissions: true } });
      await this.audit.record(actor, { action: 'role.permissions.set', module: 'roles', entityType: 'Role', entityId: id, before: role.permissions, after: after.permissions }, tx);
      return after;
    });
  }
}
