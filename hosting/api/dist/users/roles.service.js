"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RolesService = exports.ADMIN_ROLE = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const permission_service_1 = require("../authz/permission.service");
const errors_1 = require("../common/errors");
const realtime_service_1 = require("../realtime/realtime.service");
const guild_context_1 = require("../common/guild-context");
exports.ADMIN_ROLE = 'System Administrator';
const include = { permissions: { select: { permissionKey: true, effect: true } }, _count: { select: { users: true } } };
const validPermission = (p) => (0, shared_1.isPermissionKey)(p) || p === '*' || (p.endsWith('.*') && shared_1.ALL_PERMISSIONS.some((k) => k.startsWith(p.slice(0, -1))));
/**
 * Rollen & Rechte. Grundregeln (serverseitig, unabhängig von der Oberfläche):
 * - nur Rollen strikt unterhalb des eigenen Rangs bearbeiten, vergeben, löschen, verschieben
 * - nur Rechte erlauben, die man selbst besitzt
 * - der Systemadministrator (Serverbesitzer) ist nicht über das Dashboard änderbar
 * Jede Rechteänderung wird einzeln im Audit-Log festgehalten (Modul `permissions`).
 */
let RolesService = class RolesService {
    prisma;
    audit;
    perms;
    rt;
    constructor(prisma, audit, perms, rt) {
        this.prisma = prisma;
        this.audit = audit;
        this.perms = perms;
        this.rt = rt;
    }
    /** Nach jeder Änderung: alle Dashboards laden ihre Rechte neu (die API prüft ohnehin bei jeder Anfrage). */
    changed(v) { this.rt.broadcast('permissions.changed'); return v; }
    /** Im Server-Kontext: Rollen dieses Servers und serverübergreifende; unter „Alle Server“: alle. */
    list() {
        const g = (0, guild_context_1.currentGuild)();
        return this.prisma.role.findMany({ where: g ? { OR: [{ guildId: null }, { guildId: g }] } : {}, orderBy: [{ priority: 'asc' }, { name: 'asc' }], include });
    }
    catalog() { return shared_1.ALL_PERMISSIONS; }
    /** Eigener Rang (für die Oberfläche: welche Rollen sind bearbeitbar). */
    async myRank(userId) { return { rank: await this.perms.rankOf(userId) }; }
    async load(id, tx = this.prisma) {
        const role = await tx.role.findUnique({ where: { id }, include: { permissions: true } });
        if (!role)
            throw new errors_1.AppError('NOT_FOUND', 'Rolle nicht gefunden.');
        return role;
    }
    async guard(actor, role) {
        const g = (0, guild_context_1.currentGuild)();
        if (g && role.guildId && role.guildId !== g)
            throw new errors_1.AppError('NOT_FOUND', 'Rolle nicht gefunden.'); // Rollen anderer Server sind hier unsichtbar
        if (role.name === exports.ADMIN_ROLE)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Die Rolle „System Administrator“ kann im Dashboard nicht geändert werden.');
        await this.perms.assertOutranksRole(actor.userId, role.priority, role.name);
    }
    async assertPriority(actor, priority) {
        if ((await this.perms.rankOf(actor.userId)) >= priority)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Eine Rolle muss unter deinem eigenen Rang bleiben.');
    }
    async uniqueName(tx, name, exceptId) {
        const other = await tx.role.findUnique({ where: { name } });
        if (other && other.id !== exceptId)
            throw new errors_1.AppError('CONFLICT', `Es gibt schon eine Rolle namens „${name}“.`);
    }
    async create(actor, d) {
        const rank = await this.perms.rankOf(actor.userId);
        const priority = d.priority ?? Math.max(100, rank + 1);
        await this.assertPriority(actor, priority);
        return this.changed(await this.prisma.$transaction(async (tx) => {
            await this.uniqueName(tx, d.name);
            // Server-Rolle: gilt nur auf ihrem Server (Standard: der gerade gewählte Server)
            const guildId = d.guildId === undefined ? (0, guild_context_1.currentGuild)() : d.guildId;
            // Rollen für andere Server oder alle Server: nur der Serverbesitzer bzw. aus „Alle Server“ heraus
            if ((0, guild_context_1.currentGuild)() && guildId !== (0, guild_context_1.currentGuild)() && !(await this.perms.isOwner(actor.userId)))
                throw new errors_1.AppError('PERMISSION_DENIED', 'In der Server-Ansicht kannst du nur Rollen für diesen Server anlegen.');
            const r = await tx.role.create({ data: { guildId, name: d.name, description: d.description ?? null, color: d.color ?? null, icon: d.icon ?? null, active: d.active ?? true, priority, discordRoleIds: d.discordRoleIds ?? [] }, include });
            await this.audit.record(actor, { action: 'role.create', module: 'permissions', entityType: 'Role', entityId: r.id, after: { name: r.name, guildId: r.guildId, priority: r.priority, discordRoleIds: r.discordRoleIds } }, tx);
            return r;
        }));
    }
    async update(actor, id, d) {
        const before = await this.load(id);
        await this.guard(actor, before);
        if (d.priority !== undefined)
            await this.assertPriority(actor, d.priority);
        return this.changed(await this.prisma.$transaction(async (tx) => {
            if (d.name && d.name !== before.name)
                await this.uniqueName(tx, d.name, id);
            const r = await tx.role.update({ where: { id }, data: d, include });
            const changed = Object.keys(d).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(r[k]));
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
    async remove(actor, id) {
        const role = await this.load(id);
        await this.guard(actor, role);
        await this.prisma.$transaction(async (tx) => {
            await tx.role.delete({ where: { id } });
            this.rt.broadcast('permissions.changed');
            await this.audit.record(actor, { action: 'role.delete', module: 'permissions', entityType: 'Role', entityId: id, before: { name: role.name, priority: role.priority, permissions: role.permissions.map((p) => `${p.effect} ${p.permissionKey}`) } }, tx);
        });
    }
    /** Kopie einer Rolle (ohne Mitglieder und ohne Discord-Verknüpfung), direkt unterhalb des Originals. */
    async duplicate(actor, id, name) {
        const src = await this.load(id);
        if (src.name === exports.ADMIN_ROLE)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Die Rolle „System Administrator“ kann nicht dupliziert werden.');
        await this.perms.assertCanDelegate(actor.userId, src.permissions.filter((p) => p.effect === 'ALLOW').map((p) => p.permissionKey));
        const rank = await this.perms.rankOf(actor.userId);
        const priority = Math.max(src.priority, rank + 1);
        return this.changed(await this.prisma.$transaction(async (tx) => {
            let n = (name ?? `${src.name} (Kopie)`).slice(0, 64);
            for (let i = 2; !name && (await tx.role.findUnique({ where: { name: n } })); i++)
                n = `${src.name} (Kopie ${i})`.slice(0, 64);
            await this.uniqueName(tx, n);
            const r = await tx.role.create({ data: { name: n, guildId: src.guildId, description: src.description, color: src.color, icon: src.icon, priority, permissions: { create: src.permissions.map((p) => ({ permissionKey: p.permissionKey, effect: p.effect })) } }, include });
            await this.audit.record(actor, { action: 'role.duplicate', module: 'permissions', entityType: 'Role', entityId: r.id, after: { name: r.name, from: src.name } }, tx);
            return r;
        }));
    }
    /** Reihenfolge der eigenen, verwaltbaren Rollen setzen (oberste zuerst). Nicht genannte Rollen bleiben, wie sie sind. */
    async reorder(actor, ids) {
        const rank = await this.perms.rankOf(actor.userId);
        const roles = await this.prisma.role.findMany({ where: { id: { in: ids } } });
        if (roles.length !== new Set(ids).size)
            throw new errors_1.AppError('NOT_FOUND', 'Rolle nicht gefunden.');
        for (const r of roles)
            await this.guard(actor, r);
        // Neue Plätze: die bisherigen Prioritäten der Rollen in neuer Reihenfolge (bleiben so unter dem eigenen Rang)
        const slots = roles.map((r) => r.priority).sort((a, b) => a - b);
        for (let i = 1; i < slots.length; i++)
            if (slots[i] <= slots[i - 1])
                slots[i] = slots[i - 1] + 1;
        if (slots[0] <= rank)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Eine Rolle muss unter deinem eigenen Rang bleiben.');
        return this.changed(await this.prisma.$transaction(async (tx) => {
            const before = roles.map((r) => ({ name: r.name, priority: r.priority }));
            for (const [i, id] of ids.entries())
                await tx.role.update({ where: { id }, data: { priority: slots[i] } });
            await this.audit.record(actor, { action: 'role.reorder', module: 'permissions', entityType: 'Role', before, after: ids.map((id, i) => ({ name: roles.find((r) => r.id === id).name, priority: slots[i] })) }, tx);
            return tx.role.findMany({ orderBy: [{ priority: 'asc' }, { name: 'asc' }], include });
        }));
    }
    /** Alle Rechte einer Rolle auf einmal (Rollen-Editor). Geändert wird nur der Unterschied; jede Änderung einzeln protokolliert. */
    async setPermissions(actor, id, grants) {
        for (const g of grants)
            if (!validPermission(g.permission))
                throw new errors_1.AppError('VALIDATION_FAILED', `Unbekannte Berechtigung „${g.permission}“.`);
        const role = await this.load(id);
        await this.guard(actor, role);
        const want = new Map(grants.map((g) => [g.permission, g.effect]));
        const have = new Map(role.permissions.map((p) => [p.permissionKey, p.effect]));
        const changes = [...new Set([...want.keys(), ...have.keys()])].filter((k) => want.get(k) !== have.get(k)).map((k) => ({ permission: k, from: have.get(k) ?? null, to: want.get(k) ?? null }));
        await this.perms.assertCanDelegate(actor.userId, changes.filter((c) => c.to === 'ALLOW').map((c) => c.permission));
        if (!changes.length)
            return this.prisma.role.findUniqueOrThrow({ where: { id }, include });
        // gebündelt (wenige Abfragen statt einer pro Recht) – auch bei langsamer Datenbank schnell
        return this.changed(await this.prisma.$transaction(async (tx) => {
            const set = changes.filter((c) => c.to);
            await tx.permission.createMany({ data: set.map((c) => ({ key: c.permission, module: c.permission.split('.')[0] ?? c.permission })), skipDuplicates: true });
            await tx.rolePermission.deleteMany({ where: { roleId: id, permissionKey: { in: changes.map((c) => c.permission) } } });
            await tx.rolePermission.createMany({ data: set.map((c) => ({ roleId: id, permissionKey: c.permission, effect: c.to })) });
            await tx.auditLog.createMany({ data: changes.map((c) => ({
                    actorUserId: actor.userId, actorRobloxUserId: actor.robloxUserId ?? null, requestId: actor.requestId, module: 'permissions', entityType: 'Role', entityId: id,
                    action: c.to === 'ALLOW' ? 'role.permission.allow' : c.to === 'DENY' ? 'role.permission.deny' : 'role.permission.remove',
                    before: { role: role.name, permission: c.permission, effect: c.from }, after: { role: role.name, permission: c.permission, effect: c.to },
                })) });
            return tx.role.findUniqueOrThrow({ where: { id }, include });
        }));
    }
    /** Ein einzelnes Recht setzen (Matrix, automatisches Speichern). `NONE` = nicht gesetzt. */
    async setPermission(actor, id, permission, effect) {
        if (!validPermission(permission))
            throw new errors_1.AppError('VALIDATION_FAILED', `Unbekannte Berechtigung „${permission}“.`);
        const role = await this.load(id);
        await this.guard(actor, role);
        if (effect === 'ALLOW')
            await this.perms.assertCanDelegate(actor.userId, [permission]);
        const from = role.permissions.find((p) => p.permissionKey === permission)?.effect ?? null;
        const to = effect === 'NONE' ? null : effect;
        return this.changed(await this.prisma.$transaction(async (tx) => {
            if (from !== to)
                await this.apply(tx, actor, role, { permission, from, to });
            return tx.role.findUniqueOrThrow({ where: { id }, include });
        }));
    }
    async apply(tx, actor, role, c) {
        if (c.to) {
            await tx.permission.upsert({ where: { key: c.permission }, create: { key: c.permission, module: c.permission.split('.')[0] ?? c.permission }, update: {} });
            await tx.rolePermission.upsert({ where: { roleId_permissionKey: { roleId: role.id, permissionKey: c.permission } }, create: { roleId: role.id, permissionKey: c.permission, effect: c.to }, update: { effect: c.to } });
        }
        else {
            await tx.rolePermission.deleteMany({ where: { roleId: role.id, permissionKey: c.permission } });
        }
        const action = c.to === 'ALLOW' ? 'role.permission.allow' : c.to === 'DENY' ? 'role.permission.deny' : 'role.permission.remove';
        await this.audit.record(actor, { action, module: 'permissions', entityType: 'Role', entityId: role.id, before: { role: role.name, permission: c.permission, effect: c.from }, after: { role: role.name, permission: c.permission, effect: c.to } }, tx);
    }
};
exports.RolesService = RolesService;
exports.RolesService = RolesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, permission_service_1.PermissionService, realtime_service_1.RealtimeService])
], RolesService);
//# sourceMappingURL=roles.service.js.map