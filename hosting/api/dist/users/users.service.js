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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const password_1 = require("../auth/password");
const auth_service_1 = require("../auth/auth.service");
const permission_service_1 = require("../authz/permission.service");
const errors_1 = require("../common/errors");
const realtime_service_1 = require("../realtime/realtime.service");
const guild_context_1 = require("../common/guild-context");
const pagination_1 = require("../common/pagination");
const publicSelect = {
    id: true, username: true, displayName: true, email: true, robloxUserId: true, robloxUsername: true, robloxStatus: true,
    robloxVerifiedAt: true, active: true, lastLogin: true, totpEnabledAt: true, createdAt: true, updatedAt: true,
    roles: { select: { role: { select: { id: true, name: true } } } },
    overrides: { select: { permissionKey: true, effect: true, reason: true } },
};
let UsersService = class UsersService {
    prisma;
    audit;
    auth;
    perms;
    rt;
    constructor(prisma, audit, auth, perms, rt) {
        this.prisma = prisma;
        this.audit = audit;
        this.auth = auth;
        this.perms = perms;
        this.rt = rt;
    }
    /** Rollen-/Rechteänderungen an sich selbst sind verboten (Vier-Augen-Prinzip, verhindert Selbst-Eskalation). */
    assertNotSelf(actor, id) {
        if (actor.userId === id)
            throw new errors_1.AppError('CONFLICT', 'Deine eigenen Rollen und Sonderrechte kannst du nicht ändern.');
    }
    /** Mindestens ein aktiver System Administrator muss bestehen bleiben. */
    async assertAdminRemains(tx, targetId) {
        const role = await tx.role.findUnique({ where: { name: 'System Administrator' } });
        if (!role)
            return;
        const others = await tx.userRole.count({ where: { roleId: role.id, userId: { not: targetId }, user: { active: true } } });
        const targetIsAdmin = await tx.userRole.count({ where: { roleId: role.id, userId: targetId } });
        if (targetIsAdmin && others === 0)
            throw new errors_1.AppError('CONFLICT', 'Mindestens ein aktiver System Administrator muss bleiben.');
    }
    async list(p) {
        const where = p.q ? { OR: [{ username: { contains: p.q, mode: 'insensitive' } }, { displayName: { contains: p.q, mode: 'insensitive' } }, { robloxUserId: p.q }] } : {};
        const [items, total] = await Promise.all([
            this.prisma.user.findMany({ where, select: publicSelect, orderBy: { username: 'asc' }, ...(0, pagination_1.skipTake)(p) }),
            this.prisma.user.count({ where }),
        ]);
        return (0, pagination_1.pageResult)(items, total, p);
    }
    async get(id) {
        const u = await this.prisma.user.findUnique({ where: { id }, select: publicSelect });
        if (!u)
            throw new errors_1.AppError('NOT_FOUND', 'Benutzer nicht gefunden.');
        const discord = await this.prisma.discordLink.findUnique({ where: { userId: id }, select: { discordId: true, linkedAt: true } });
        return { ...u, discord };
    }
    async create(actor, d) {
        if (d.roleIds?.length) {
            await this.perms.assert(actor.userId, 'roles.manage'); // users.manage allein darf keine Rollen vergeben
            for (const r of await this.prisma.role.findMany({ where: { id: { in: d.roleIds } } }))
                await this.perms.assertOutranksRole(actor.userId, r.priority, r.name);
        }
        const passwordHash = await (0, password_1.hashPassword)(d.password);
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
    async setRoblox(actor, id, d) {
        if (d.robloxUserId !== null && !(0, shared_1.isValidRobloxUserId)(d.robloxUserId))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Ungültige Roblox-Benutzer-ID.');
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
    /** Anzeigename ändern – den eigenen immer, fremde nur unterhalb des eigenen Rangs (users.manage). */
    async setName(actor, id, displayName) {
        const before = await this.get(id);
        if (id !== actor.userId)
            await this.perms.assertOutranksUser(actor.userId, id);
        return this.prisma.$transaction(async (tx) => {
            const r = await tx.user.update({ where: { id }, data: { displayName }, select: publicSelect });
            await this.audit.record(actor, { action: 'user.rename', module: 'users', entityType: 'User', entityId: id, before: { displayName: before.displayName }, after: { displayName } }, tx);
            return r;
        });
    }
    /**
     * Konto endgültig löschen (users.manage): nicht das eigene, nur unterhalb des eigenen Rangs, der letzte aktive
     * System Administrator bleibt. Sitzungen, Rollen, Personalakte usw. gehen mit; im Audit-Log bleibt festgehalten, wer gelöscht wurde.
     */
    async remove(actor, id) {
        if (id === actor.userId)
            throw new errors_1.AppError('CONFLICT', 'Du kannst dein eigenes Konto nicht löschen.');
        const before = await this.get(id);
        await this.perms.assertOutranksUser(actor.userId, id);
        await this.auth.revokeAllSessions(id);
        await this.prisma.$transaction(async (tx) => {
            await this.assertAdminRemains(tx, id);
            await tx.user.delete({ where: { id } });
            await this.audit.record(actor, { action: 'user.delete', module: 'users', entityType: 'User', entityId: id, before: { username: before.username, displayName: before.displayName, roles: before.roles.map((r) => r.role.name) } }, tx);
        });
    }
    async setActive(actor, id, active, reason) {
        if (!active && id === actor.userId)
            throw new errors_1.AppError('CONFLICT', 'Du kannst dein eigenes Konto nicht deaktivieren.');
        await this.get(id);
        await this.perms.assertOutranksUser(actor.userId, id); // Sperren/Entsperren nur unterhalb des eigenen Rangs
        const u = await this.prisma.$transaction(async (tx) => {
            if (!active)
                await this.assertAdminRemains(tx, id);
            const r = await tx.user.update({ where: { id }, data: { active }, select: publicSelect });
            await this.audit.record(actor, { action: active ? 'user.enable' : 'user.disable', module: 'users', entityType: 'User', entityId: id, reason }, tx);
            return r;
        });
        if (!active)
            await this.auth.revokeAllSessions(id);
        return u;
    }
    async setRoles(actor, id, roleIds) {
        this.assertNotSelf(actor, id);
        const before = await this.get(id);
        await this.perms.assertOutranksUser(actor.userId, id);
        // Nur Rollen unterhalb des eigenen Rangs dürfen hinzukommen oder wegfallen
        const old = before.roles.map((r) => r.role.id);
        const touched = [...roleIds.filter((r) => !old.includes(r)), ...old.filter((r) => !roleIds.includes(r))];
        const roles = await this.prisma.role.findMany({ where: { id: { in: touched } } });
        if (roles.length !== new Set(touched).size)
            throw new errors_1.AppError('NOT_FOUND', 'Rolle nicht gefunden.');
        const g = (0, guild_context_1.currentGuild)();
        for (const r of roles) {
            if (g && r.guildId && r.guildId !== g)
                throw new errors_1.AppError('NOT_FOUND', 'Rolle nicht gefunden.'); // Server getrennt
            await this.perms.assertOutranksRole(actor.userId, r.priority, r.name);
        }
        return this.prisma.$transaction(async (tx) => {
            const adminRole = await tx.role.findUnique({ where: { name: 'System Administrator' } });
            if (adminRole && !roleIds.includes(adminRole.id))
                await this.assertAdminRemains(tx, id);
            await tx.userRole.deleteMany({ where: { userId: id } });
            await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: id, roleId })) });
            const after = await tx.user.findUniqueOrThrow({ where: { id }, select: publicSelect });
            this.rt.publishToUser(id, 'permissions.changed', {});
            await this.audit.record(actor, { action: 'user.roles.set', module: 'permissions', entityType: 'User', entityId: id, before: before.roles, after: after.roles }, tx);
            return after;
        });
    }
    async setOverride(actor, id, d) {
        this.assertNotSelf(actor, id);
        if (!(0, shared_1.isPermissionKey)(d.permission))
            throw new errors_1.AppError('VALIDATION_FAILED', `Unbekannte Berechtigung „${d.permission}“.`);
        await this.get(id);
        await this.perms.assertOutranksUser(actor.userId, id);
        if (d.effect === 'ALLOW')
            await this.perms.assertCanDelegate(actor.userId, [d.permission]);
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
    async removeOverride(actor, id, permission) {
        this.assertNotSelf(actor, id);
        await this.perms.assertOutranksUser(actor.userId, id); // auch das Aufheben einer Sperre (DENY) nur von oben
        await this.prisma.$transaction(async (tx) => {
            const prev = await tx.userPermissionOverride.findUnique({ where: { userId_permissionKey: { userId: id, permissionKey: permission } } });
            if (!prev)
                throw new errors_1.AppError('NOT_FOUND', 'Sonderrecht nicht gefunden.');
            await tx.userPermissionOverride.delete({ where: { id: prev.id } });
            this.rt.publishToUser(id, 'permissions.changed', {});
            await this.audit.record(actor, { action: 'user.override.remove', module: 'permissions', entityType: 'User', entityId: id, before: prev }, tx);
        });
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, auth_service_1.AuthService, permission_service_1.PermissionService, realtime_service_1.RealtimeService])
], UsersService);
//# sourceMappingURL=users.service.js.map