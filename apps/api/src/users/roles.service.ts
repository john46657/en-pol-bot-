import { Injectable } from '@nestjs/common';
import { ALL_PERMISSIONS, isPermissionKey } from '@enrp/shared';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { AppError } from '../common/errors';
import { RealtimeService } from '../realtime/realtime.service';
import { currentGuild } from '../common/guild-context';

export const ADMIN_ROLE = 'System Administrator';
type Effect = 'ALLOW' | 'DENY';
export interface RoleInput { guildId?: string | null; name?: string; description?: string | null; color?: string | null; icon?: string | null; active?: boolean; priority?: number; discordRoleIds?: string[] }

const include = { permissions: { select: { permissionKey: true, effect: true } }, _count: { select: { users: true } } } as const;

const validPermission = (p: string) => isPermissionKey(p) || p === '*' || (p.endsWith('.*') && ALL_PERMISSIONS.some((k) => k.startsWith(p.slice(0, -1))));

/**
 * Rollen & Rechte. Grundregeln (serverseitig, unabhängig von der Oberfläche):
 * - nur Rollen strikt unterhalb des eigenen Rangs bearbeiten, vergeben, löschen, verschieben
 * - nur Rechte erlauben, die man selbst besitzt
 * - der Systemadministrator (Serverbesitzer) ist nicht über das Dashboard änderbar
 * Jede Rechteänderung wird einzeln im Audit-Log festgehalten (Modul `permissions`).
 */
@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly perms: PermissionService, private readonly rt: RealtimeService) {}

  /** Nach jeder Änderung: alle Dashboards laden ihre Rechte neu (die API prüft ohnehin bei jeder Anfrage). */
  private changed<T>(v: T): T { this.rt.broadcast('permissions.changed'); return v; }

  /** Im Server-Kontext: Rollen dieses Servers und serverübergreifende; unter „Alle Server“: alle. */
  list() {
    const g = currentGuild();
    return this.prisma.role.findMany({ where: g ? { OR: [{ guildId: null }, { guildId: g }] } : {}, orderBy: [{ priority: 'asc' }, { name: 'asc' }], include });
  }

  catalog() { return ALL_PERMISSIONS; }

  /** Eigener Rang (für die Oberfläche: welche Rollen sind bearbeitbar). */
  async myRank(userId: string) { return { rank: await this.perms.rankOf(userId) }; }

  private async load(id: string, tx: Tx | PrismaService = this.prisma) {
    const role = await tx.role.findUnique({ where: { id }, include: { permissions: true } });
    if (!role) throw new AppError('NOT_FOUND', 'Role not found.');
    return role;
  }

  private async guard(actor: Actor, role: { name: string; priority: number; guildId?: string | null }) {
    const g = currentGuild();
    if (g && role.guildId && role.guildId !== g) throw new AppError('NOT_FOUND', 'Role not found.'); // Rollen anderer Server sind hier unsichtbar
    if (role.name === ADMIN_ROLE) throw new AppError('PERMISSION_DENIED', 'The system administrator role cannot be changed in the dashboard.');
    await this.perms.assertOutranksRole(actor.userId!, role.priority, role.name);
  }

  private async assertPriority(actor: Actor, priority: number) {
    if ((await this.perms.rankOf(actor.userId!)) >= priority) throw new AppError('PERMISSION_DENIED', 'A role must stay below your own rank.');
  }

  private async uniqueName(tx: Tx, name: string, exceptId?: string) {
    const other = await tx.role.findUnique({ where: { name } });
    if (other && other.id !== exceptId) throw new AppError('CONFLICT', `A role named "${name}" already exists.`);
  }

  async create(actor: Actor, d: RoleInput & { name: string }) {
    const rank = await this.perms.rankOf(actor.userId!);
    const priority = d.priority ?? Math.max(100, rank + 1);
    await this.assertPriority(actor, priority);
    return this.changed(await this.prisma.$transaction(async (tx) => {
      await this.uniqueName(tx, d.name);
      // Server-Rolle: gilt nur auf ihrem Server (Standard: der gerade gewählte Server)
      const guildId = d.guildId === undefined ? currentGuild() : d.guildId;
      // Rollen für andere Server oder alle Server: nur der Serverbesitzer bzw. aus „Alle Server“ heraus
      if (currentGuild() && guildId !== currentGuild() && !(await this.perms.isOwner(actor.userId!))) throw new AppError('PERMISSION_DENIED', 'In a server view you can only create roles for this server.');
      const r = await tx.role.create({ data: { guildId, name: d.name, description: d.description ?? null, color: d.color ?? null, icon: d.icon ?? null, active: d.active ?? true, priority, discordRoleIds: d.discordRoleIds ?? [] }, include });
      await this.audit.record(actor, { action: 'role.create', module: 'permissions', entityType: 'Role', entityId: r.id, after: { name: r.name, guildId: r.guildId, priority: r.priority, discordRoleIds: r.discordRoleIds } }, tx);
      return r;
    }));
  }

  async update(actor: Actor, id: string, d: RoleInput) {
    const before = await this.load(id);
    await this.guard(actor, before);
    if (d.priority !== undefined) await this.assertPriority(actor, d.priority);
    return this.changed(await this.prisma.$transaction(async (tx) => {
      if (d.name && d.name !== before.name) await this.uniqueName(tx, d.name, id);
      const r = await tx.role.update({ where: { id }, data: d, include });
      const changed = (Object.keys(d) as (keyof RoleInput)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(r[k]));
      if (changed.length) {
        await this.audit.record(actor, {
          action: changed.includes('active') && changed.length === 1 ? (r.active ? 'role.enable' : 'role.disable') : changed.includes('discordRoleIds') ? 'role.discord_roles' : 'role.update',
          module: 'permissions', entityType: 'Role', entityId: id,
          before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: { role: r.name, ...Object.fromEntries(changed.map((k) => [k, r[k]])) },
        }, tx);
      }
      return r;
    }));
  }

  async remove(actor: Actor, id: string) {
    const role = await this.load(id);
    await this.guard(actor, role);
    await this.prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id } });
      this.rt.broadcast('permissions.changed');
      await this.audit.record(actor, { action: 'role.delete', module: 'permissions', entityType: 'Role', entityId: id, before: { name: role.name, priority: role.priority, permissions: role.permissions.map((p) => `${p.effect} ${p.permissionKey}`) } }, tx);
    });
  }

  /** Kopie einer Rolle (ohne Mitglieder und ohne Discord-Verknüpfung), direkt unterhalb des Originals. */
  async duplicate(actor: Actor, id: string, name?: string) {
    const src = await this.load(id);
    if (src.name === ADMIN_ROLE) throw new AppError('PERMISSION_DENIED', 'The system administrator role cannot be duplicated.');
    await this.perms.assertCanDelegate(actor.userId!, src.permissions.filter((p) => p.effect === 'ALLOW').map((p) => p.permissionKey));
    const rank = await this.perms.rankOf(actor.userId!);
    const priority = Math.max(src.priority, rank + 1);
    return this.changed(await this.prisma.$transaction(async (tx) => {
      let n = (name ?? `${src.name} (Kopie)`).slice(0, 64);
      for (let i = 2; !name && (await tx.role.findUnique({ where: { name: n } })); i++) n = `${src.name} (Kopie ${i})`.slice(0, 64);
      await this.uniqueName(tx, n);
      const r = await tx.role.create({ data: { name: n, guildId: src.guildId, description: src.description, color: src.color, icon: src.icon, priority, permissions: { create: src.permissions.map((p) => ({ permissionKey: p.permissionKey, effect: p.effect })) } }, include });
      await this.audit.record(actor, { action: 'role.duplicate', module: 'permissions', entityType: 'Role', entityId: r.id, after: { name: r.name, from: src.name } }, tx);
      return r;
    }));
  }

  /** Reihenfolge der eigenen, verwaltbaren Rollen setzen (oberste zuerst). Nicht genannte Rollen bleiben, wie sie sind. */
  async reorder(actor: Actor, ids: string[]) {
    const rank = await this.perms.rankOf(actor.userId!);
    const roles = await this.prisma.role.findMany({ where: { id: { in: ids } } });
    if (roles.length !== new Set(ids).size) throw new AppError('NOT_FOUND', 'Role not found.');
    for (const r of roles) await this.guard(actor, r);
    // Neue Plätze: die bisherigen Prioritäten der Rollen in neuer Reihenfolge (bleiben so unter dem eigenen Rang)
    const slots = roles.map((r) => r.priority).sort((a, b) => a - b);
    for (let i = 1; i < slots.length; i++) if (slots[i]! <= slots[i - 1]!) slots[i] = slots[i - 1]! + 1;
    if (slots[0]! <= rank) throw new AppError('PERMISSION_DENIED', 'A role must stay below your own rank.');
    return this.changed(await this.prisma.$transaction(async (tx) => {
      const before = roles.map((r) => ({ name: r.name, priority: r.priority }));
      for (const [i, id] of ids.entries()) await tx.role.update({ where: { id }, data: { priority: slots[i]! } });
      await this.audit.record(actor, { action: 'role.reorder', module: 'permissions', entityType: 'Role', before, after: ids.map((id, i) => ({ name: roles.find((r) => r.id === id)!.name, priority: slots[i] })) }, tx);
      return tx.role.findMany({ orderBy: [{ priority: 'asc' }, { name: 'asc' }], include });
    }));
  }

  /** Alle Rechte einer Rolle auf einmal (Rollen-Editor). Geändert wird nur der Unterschied; jede Änderung einzeln protokolliert. */
  async setPermissions(actor: Actor, id: string, grants: { permission: string; effect: Effect }[]) {
    for (const g of grants) if (!validPermission(g.permission)) throw new AppError('VALIDATION_FAILED', `Unknown permission "${g.permission}".`);
    const role = await this.load(id);
    await this.guard(actor, role);
    const want = new Map(grants.map((g) => [g.permission, g.effect]));
    const have = new Map(role.permissions.map((p) => [p.permissionKey, p.effect as Effect]));
    const changes = [...new Set([...want.keys(), ...have.keys()])].filter((k) => want.get(k) !== have.get(k)).map((k) => ({ permission: k, from: have.get(k) ?? null, to: want.get(k) ?? null }));
    await this.perms.assertCanDelegate(actor.userId!, changes.filter((c) => c.to === 'ALLOW').map((c) => c.permission));
    if (!changes.length) return this.prisma.role.findUniqueOrThrow({ where: { id }, include });
    // gebündelt (wenige Abfragen statt einer pro Recht) – auch bei langsamer Datenbank schnell
    return this.changed(await this.prisma.$transaction(async (tx) => {
      const set = changes.filter((c) => c.to);
      await tx.permission.createMany({ data: set.map((c) => ({ key: c.permission, module: c.permission.split('.')[0] ?? c.permission })), skipDuplicates: true });
      await tx.rolePermission.deleteMany({ where: { roleId: id, permissionKey: { in: changes.map((c) => c.permission) } } });
      await tx.rolePermission.createMany({ data: set.map((c) => ({ roleId: id, permissionKey: c.permission, effect: c.to! })) });
      await tx.auditLog.createMany({ data: changes.map((c) => ({
        actorUserId: actor.userId, actorRobloxUserId: actor.robloxUserId ?? null, requestId: actor.requestId, module: 'permissions', entityType: 'Role', entityId: id,
        action: c.to === 'ALLOW' ? 'role.permission.allow' : c.to === 'DENY' ? 'role.permission.deny' : 'role.permission.remove',
        before: { role: role.name, permission: c.permission, effect: c.from }, after: { role: role.name, permission: c.permission, effect: c.to },
      })) });
      return tx.role.findUniqueOrThrow({ where: { id }, include });
    }));
  }

  /** Ein einzelnes Recht setzen (Matrix, automatisches Speichern). `NONE` = nicht gesetzt. */
  async setPermission(actor: Actor, id: string, permission: string, effect: Effect | 'NONE') {
    if (!validPermission(permission)) throw new AppError('VALIDATION_FAILED', `Unknown permission "${permission}".`);
    const role = await this.load(id);
    await this.guard(actor, role);
    if (effect === 'ALLOW') await this.perms.assertCanDelegate(actor.userId!, [permission]);
    const from = (role.permissions.find((p) => p.permissionKey === permission)?.effect as Effect | undefined) ?? null;
    const to = effect === 'NONE' ? null : effect;
    return this.changed(await this.prisma.$transaction(async (tx) => {
      if (from !== to) await this.apply(tx, actor, role, { permission, from, to });
      return tx.role.findUniqueOrThrow({ where: { id }, include });
    }));
  }

  private async apply(tx: Tx, actor: Actor, role: { id: string; name: string }, c: { permission: string; from: Effect | null; to: Effect | null }) {
    if (c.to) {
      await tx.permission.upsert({ where: { key: c.permission }, create: { key: c.permission, module: c.permission.split('.')[0] ?? c.permission }, update: {} });
      await tx.rolePermission.upsert({ where: { roleId_permissionKey: { roleId: role.id, permissionKey: c.permission } }, create: { roleId: role.id, permissionKey: c.permission, effect: c.to }, update: { effect: c.to } });
    } else {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id, permissionKey: c.permission } });
    }
    const action = c.to === 'ALLOW' ? 'role.permission.allow' : c.to === 'DENY' ? 'role.permission.deny' : 'role.permission.remove';
    await this.audit.record(actor, { action, module: 'permissions', entityType: 'Role', entityId: role.id, before: { role: role.name, permission: c.permission, effect: c.from }, after: { role: role.name, permission: c.permission, effect: c.to } }, tx);
  }
}
