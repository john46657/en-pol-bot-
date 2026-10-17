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
exports.PermissionService = exports.NO_RANK = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const errors_1 = require("../common/errors");
const guild_context_1 = require("../common/guild-context");
/** Kein Rang (keine aktive Rolle) – darf keine Rollen verwalten. */
exports.NO_RANK = Number.MAX_SAFE_INTEGER;
/** Lädt Rechte-Kontext aus DB; die Entscheidungslogik liegt zentral in @enrp/shared. */
let PermissionService = class PermissionService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    /**
     * IDs aller aktiven Rollen des Benutzers (direkt und über Gruppen), die im Server der Anfrage gelten.
     * Server sind von Grund auf getrennt: auf einem Server zählen NUR die Rollen dieses Servers (`guildId`) – plus der globale
     * Systemadministrator. Serverübergreifende Rollen (Vorlagen) gelten nur unter „Alle Server“ (ohne Server).
     * Über Discord vergebene Zuweisungen (`UserRole.guildIds`) gelten nur auf den Servern, auf denen die Discord-Rolle besteht.
     * Deaktivierte Rollen verleihen nichts.
     */
    async roleIdsFor(userId, guildId = (0, guild_context_1.currentGuild)()) {
        const [direct, groups] = await Promise.all([
            this.prisma.userRole.findMany({ where: { userId }, select: { roleId: true, guildIds: true } }),
            this.prisma.groupMember.findMany({ where: { userId }, select: { group: { select: { roles: { select: { roleId: true } } } } } }),
        ]);
        const ids = new Set(direct.filter((r) => !r.guildIds.length || (guildId !== null && r.guildIds.includes(guildId))).map((r) => r.roleId));
        for (const g of groups)
            for (const r of g.group.roles)
                ids.add(r.roleId);
        if (!ids.size)
            return [];
        const where = guildId
            ? { OR: [{ guildId }, { guildId: null, name: 'System Administrator', users: { some: { userId, guildIds: { isEmpty: true } } } }] }
            : { guildId: null };
        return (await this.prisma.role.findMany({ where: { id: { in: [...ids] }, active: true, ...where }, select: { id: true } })).map((r) => r.id);
    }
    async contextFor(userId, guildId = (0, guild_context_1.currentGuild)()) {
        const [overrides, roleIds] = await Promise.all([this.prisma.userPermissionOverride.findMany({ where: { userId, guildId } }), this.roleIdsFor(userId, guildId)]);
        // mit Rang der Rolle: bei Widersprüchen zwischen Rollen entscheidet die höchste (resolvePermission)
        const rolePerms = roleIds.length ? await this.prisma.rolePermission.findMany({ where: { roleId: { in: roleIds } }, include: { role: { select: { priority: true } } } }) : [];
        const toGrant = (p, e, rank) => ({ permission: p, effect: e === 'DENY' ? 'DENY' : 'ALLOW', rank });
        return {
            userOverrides: overrides.map((o) => toGrant(o.permissionKey, o.effect)),
            roleGrants: rolePerms.map((r) => toGrant(r.permissionKey, r.effect, r.role.priority)),
        };
    }
    async check(userId, permission) {
        return (0, shared_1.resolvePermission)(await this.contextFor(userId), permission);
    }
    async has(userId, permission) {
        return (await this.check(userId, permission)).allowed;
    }
    async assert(userId, permission) {
        if (!(await this.has(userId, permission)))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Dafür fehlt dir die Berechtigung.');
    }
    async effective(userId, guildId = (0, guild_context_1.currentGuild)()) {
        return (0, shared_1.effectivePermissions)(await this.contextFor(userId, guildId));
    }
    // ---- Rollen-Hierarchie (kleinere Priorität = höherer Rang) ----
    /** Höchster Rang des Benutzers = kleinste Priorität seiner aktiven Rollen. */
    async rankOf(userId) {
        const ids = await this.roleIdsFor(userId);
        if (!ids.length)
            return exports.NO_RANK;
        const r = await this.prisma.role.aggregate({ where: { id: { in: ids } }, _min: { priority: true } });
        return r._min.priority ?? exports.NO_RANK;
    }
    /**
     * Globaler Systemadministrator (Serverbesitzer) = serverübergreifende, aktive Rolle „System Administrator“, MANUELL vergeben
     * (bzw. beim Discord-Login über ADMIN_DISCORD_IDS). Server-Administratoren (Rechte nur auf einem Server) sind das ausdrücklich nicht.
     */
    async isOwner(userId) {
        const rows = await this.prisma.userRole.findMany({ where: { userId, guildIds: { isEmpty: true }, role: { name: 'System Administrator', guildId: null, active: true } }, select: { roleId: true } });
        return rows.length > 0;
    }
    /** Nur Rollen strikt unterhalb des eigenen Rangs dürfen verwaltet, vergeben oder entzogen werden (Besitzer: alle). */
    async assertOutranksRole(actorId, rolePriority, roleName) {
        if (await this.isOwner(actorId))
            return;
        if ((await this.rankOf(actorId)) >= rolePriority)
            throw new errors_1.AppError('PERMISSION_DENIED', `Du kannst nur Rollen verwalten, die unter deinem eigenen Rang stehen${roleName ? ` („${roleName}“ tut das nicht)` : ''}.`);
    }
    /** Andere Benutzer nur verwalten, wenn man sie im Rang übertrifft (Benutzer ohne Rolle: jeder mit Rang). */
    async assertOutranksUser(actorId, targetId) {
        if (await this.isOwner(actorId))
            return;
        const [a, t] = await Promise.all([this.rankOf(actorId), this.rankOf(targetId)]);
        if (a === exports.NO_RANK || (t !== exports.NO_RANK && a >= t))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Du kannst nur Benutzer verwalten, die unter deinem Rang stehen.');
    }
    /** Erlauben darf man nur, was man selbst besitzt (keine Rechteausweitung über den Editor). */
    async assertCanDelegate(actorId, permissions) {
        if (!permissions.length)
            return;
        const ctx = await this.contextFor(actorId);
        const bad = permissions.filter((p) => !(0, shared_1.canDelegate)(ctx, p));
        if (bad.length)
            throw new errors_1.AppError('PERMISSION_DENIED', `Du kannst keine Berechtigungen vergeben, die du selbst nicht hast: ${bad.slice(0, 5).join(', ')}.`);
    }
};
exports.PermissionService = PermissionService;
exports.PermissionService = PermissionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PermissionService);
//# sourceMappingURL=permission.service.js.map