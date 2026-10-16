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
    roles: { select: { guildIds: true, role: { select: { id: true, name: true, guildId: true, color: true, icon: true, priority: true, active: true } } } },
    overrides: { select: { permissionKey: true, effect: true, reason: true, guildId: true } },
};
const ADMIN_ROLE = 'System Administrator';
/**
 * Gehört eine Rollen-Zuweisung zum Bereich der Anfrage? Mit Server: dessen Rollen (+ manuell vergebener globaler
 * Systemadministrator, der überall gilt). Unter „Alle Server“: alle Rollen – die Oberfläche zeigt den Server dazu an.
 */
const roleVisible = (g, r) => !g || r.role.guildId === g || (r.role.guildId === null && r.role.name === ADMIN_ROLE && !r.guildIds.length);
/** Rollen und Sonderrechte nur so, wie sie im gewählten Server gelten (Server sind getrennt). */
function scoped(u) {
    const g = (0, guild_context_1.currentGuild)();
    return { ...u, roles: u.roles.filter((r) => roleVisible(g, r)).sort((a, b) => a.role.priority - b.role.priority), overrides: u.overrides.filter((o) => o.guildId === g) };
}
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
        const role = await tx.role.findFirst({ where: { guildId: null, name: 'System Administrator' } });
        if (!role)
            return;
        const others = await tx.userRole.count({ where: { roleId: role.id, userId: { not: targetId }, user: { active: true } } });
        const targetIsAdmin = await tx.userRole.count({ where: { roleId: role.id, userId: targetId } });
        if (targetIsAdmin && others === 0)
            throw new errors_1.AppError('CONFLICT', 'Mindestens ein aktiver System Administrator muss bleiben.');
    }
    /** Benutzerliste mit Suche (Name, Benutzername, Roblox-ID, Discord-ID) und Filtern (Status, Rolle, Discord-Verknüpfung). */
    async list(p) {
        const and = [];
        if (p.q) {
            const viaDiscord = /^\d{15,25}$/.test(p.q) ? (await this.prisma.discordLink.findMany({ where: { discordId: p.q }, select: { userId: true } })).map((l) => l.userId) : [];
            and.push({ OR: [{ username: { contains: p.q, mode: 'insensitive' } }, { displayName: { contains: p.q, mode: 'insensitive' } }, { robloxUserId: p.q }, { id: { in: viaDiscord } }] });
        }
        if (p.status)
            and.push({ active: p.status === 'active' });
        if (p.roleId)
            and.push({ roles: { some: { roleId: p.roleId } } });
        if (p.linked) {
            const linked = (await this.prisma.discordLink.findMany({ select: { userId: true } })).map((l) => l.userId);
            and.push(p.linked === 'yes' ? { id: { in: linked } } : { id: { notIn: linked } });
        }
        const where = and.length ? { AND: and } : {};
        const [items, total] = await Promise.all([
            this.prisma.user.findMany({ where, select: publicSelect, orderBy: [{ active: 'desc' }, { displayName: 'asc' }], ...(0, pagination_1.skipTake)(p) }),
            this.prisma.user.count({ where }),
        ]);
        const links = new Map((await this.prisma.discordLink.findMany({ where: { userId: { in: items.map((u) => u.id) } }, select: { userId: true, discordId: true, linkedAt: true } })).map((l) => [l.userId, { discordId: l.discordId, linkedAt: l.linkedAt }]));
        return (0, pagination_1.pageResult)(items.map((u) => ({ ...scoped(u), discord: links.get(u.id) ?? null })), total, p);
    }
    /** Rohdaten ohne Server-Filter (für Prüfungen und Audit). */
    async load(id) {
        const u = await this.prisma.user.findUnique({ where: { id }, select: publicSelect });
        if (!u)
            throw new errors_1.AppError('NOT_FOUND', 'Benutzer nicht gefunden.');
        return u;
    }
    async get(id) {
        const u = await this.load(id);
        const [discord, rank] = await Promise.all([
            this.prisma.discordLink.findUnique({ where: { userId: id }, select: { discordId: true, linkedAt: true } }),
            this.perms.rankOf(id),
        ]);
        return { ...scoped(u), discord, rank: rank === permission_service_1.NO_RANK ? null : rank };
    }
    /**
     * Effektive Rechte eines Benutzers im gewählten Server – mit Herkunft je Recht (Sonderrecht, Rolle, Standard).
     * Dieselbe Auflösung wie bei jeder API-Anfrage (@enrp/shared), damit die Anzeige nie von der Prüfung abweicht.
     */
    async permissions(id) {
        await this.load(id);
        const g = (0, guild_context_1.currentGuild)();
        const roleIds = await this.perms.roleIdsFor(id, g);
        const [roles, ctx] = await Promise.all([
            this.prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true, color: true, icon: true, priority: true, permissions: { select: { permissionKey: true, effect: true } } }, orderBy: { priority: 'asc' } }),
            this.perms.contextFor(id, g),
        ]);
        const entries = shared_1.ALL_PERMISSIONS.map((key) => {
            const r = (0, shared_1.resolvePermission)(ctx, key);
            const want = r.source === 'ROLE_DENY' ? 'DENY' : 'ALLOW';
            const via = r.source.startsWith('ROLE_') ? roles.filter((x) => x.permissions.some((p) => p.effect === want && (0, shared_1.grantMatches)(p.permissionKey, key))).map((x) => x.name) : [];
            return { key, allowed: r.allowed, source: r.source, via };
        });
        return { roles: roles.map(({ permissions: _p, ...r }) => r), entries };
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
        const before = await this.load(id);
        await this.perms.assertOutranksUser(actor.userId, id);
        await this.auth.revokeAllSessions(id);
        await this.prisma.$transaction(async (tx) => {
            await this.assertAdminRemains(tx, id);
            await tx.user.delete({ where: { id } });
            await this.audit.record(actor, { action: 'user.delete', module: 'users', entityType: 'User', entityId: id, before: { username: before.username, displayName: before.displayName, roles: before.roles.map((r) => r.role.name) } }, tx);
        });
    }
    /** Passwort eines anderen Kontos neu setzen (nur unterhalb des eigenen Rangs); alle Sitzungen des Kontos enden, Sperre wird aufgehoben. */
    async setPassword(actor, id, password) {
        if (id === actor.userId)
            throw new errors_1.AppError('CONFLICT', 'Dein eigenes Passwort änderst du unter Persönlich → Sicherheit.');
        await this.get(id);
        await this.perms.assertOutranksUser(actor.userId, id);
        const passwordHash = await (0, password_1.hashPassword)(password);
        await this.prisma.$transaction(async (tx) => {
            await tx.user.update({ where: { id }, data: { passwordHash, failedLogins: 0, lockedUntil: null } });
            await this.audit.record(actor, { action: 'user.password.reset', module: 'users', entityType: 'User', entityId: id }, tx);
        });
        await this.auth.revokeAllSessions(id);
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
    /**
     * Rollen eines Benutzers setzen – NUR im Bereich der Anfrage: mit gewähltem Server die Rollen dieses Servers, unter
     * „Alle Server“ die serverübergreifenden. Rollen anderer Server bleiben unberührt (Server sind getrennt).
     */
    async setRoles(actor, id, roleIds) {
        this.assertNotSelf(actor, id);
        const before = await this.load(id);
        await this.perms.assertOutranksUser(actor.userId, id);
        const g = (0, guild_context_1.currentGuild)();
        const inScope = (r) => (g ? r.guildId === g : r.guildId === null);
        // Nur manuelle Zuweisungen dieses Bereichs werden gesetzt. Über Discord vergebene Rollen pflegt der Discord-Abgleich
        // (sonst würde jede Änderung sie zu dauerhaften manuellen Rollen machen); Rollen anderer Server bleiben unberührt.
        const held = (pred) => before.roles.filter(pred).map((r) => r.role.id);
        const manual = held((r) => inScope(r.role) && !r.guildIds.length);
        const untouchable = new Set(held((r) => !inScope(r.role) || r.guildIds.length > 0));
        const want = [...new Set(roleIds.filter((r) => !untouchable.has(r)))];
        const added = want.filter((r) => !manual.includes(r)), removed = manual.filter((r) => !want.includes(r));
        const touched = [...added, ...removed];
        // Nur Rollen unterhalb des eigenen Rangs dürfen hinzukommen oder wegfallen
        const roles = await this.prisma.role.findMany({ where: { id: { in: touched } } });
        if (roles.length !== touched.length)
            throw new errors_1.AppError('NOT_FOUND', 'Rolle nicht gefunden.');
        for (const r of roles) {
            if (!inScope(r))
                throw new errors_1.AppError('NOT_FOUND', 'Rolle nicht gefunden.'); // Rollen anderer Server sind hier nicht vorhanden
            await this.perms.assertOutranksRole(actor.userId, r.priority, r.name);
        }
        return this.prisma.$transaction(async (tx) => {
            const adminRole = await tx.role.findFirst({ where: { guildId: null, name: ADMIN_ROLE } });
            if (adminRole && removed.includes(adminRole.id))
                await this.assertAdminRemains(tx, id);
            if (removed.length)
                await tx.userRole.deleteMany({ where: { userId: id, roleId: { in: removed } } });
            if (added.length)
                await tx.userRole.createMany({ data: added.map((roleId) => ({ userId: id, roleId })), skipDuplicates: true });
            const after = await tx.user.findUniqueOrThrow({ where: { id }, select: publicSelect });
            this.rt.publishToUser(id, 'permissions.changed', {});
            if (touched.length) {
                const name = (rid) => roles.find((r) => r.id === rid)?.name ?? rid;
                await this.audit.record(actor, { action: 'user.roles.set', module: 'permissions', entityType: 'User', entityId: id, before: before.roles, after: { roles: after.roles, added: added.map(name), removed: removed.map(name) } }, tx);
            }
            return scoped(after);
        });
    }
    async setOverride(actor, id, d) {
        this.assertNotSelf(actor, id);
        if (!(0, shared_1.isPermissionKey)(d.permission))
            throw new errors_1.AppError('VALIDATION_FAILED', `Unbekannte Berechtigung „${d.permission}“.`);
        await this.load(id);
        await this.perms.assertOutranksUser(actor.userId, id);
        if (d.effect === 'ALLOW')
            await this.perms.assertCanDelegate(actor.userId, [d.permission]);
        return this.prisma.$transaction(async (tx) => {
            // Ausnahme gilt nur auf dem Server der Anfrage (ohne Server: nur unter „Alle Server“)
            const guildId = (0, guild_context_1.currentGuild)();
            const prev = await tx.userPermissionOverride.findFirst({ where: { userId: id, guildId, permissionKey: d.permission } });
            const o = prev
                ? await tx.userPermissionOverride.update({ where: { id: prev.id }, data: { effect: d.effect, reason: d.reason, createdById: actor.userId } })
                : await tx.userPermissionOverride.create({ data: { userId: id, guildId, permissionKey: d.permission, effect: d.effect, reason: d.reason, createdById: actor.userId } });
            this.rt.publishToUser(id, 'permissions.changed', {});
            await this.audit.record(actor, { action: 'user.override.add', module: 'permissions', entityType: 'User', entityId: id, before: prev, after: o, reason: d.reason }, tx);
            return o;
        });
    }
    async removeOverride(actor, id, permission) {
        this.assertNotSelf(actor, id);
        await this.perms.assertOutranksUser(actor.userId, id); // auch das Aufheben einer Sperre (DENY) nur von oben
        await this.prisma.$transaction(async (tx) => {
            const prev = await tx.userPermissionOverride.findFirst({ where: { userId: id, guildId: (0, guild_context_1.currentGuild)(), permissionKey: permission } });
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