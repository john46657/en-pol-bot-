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
     * IDs aller aktiven Rollen des Benutzers (direkt und über Gruppen), die im Server der Anfrage gelten:
     * serverübergreifende Rollen immer, Server-Rollen nur in ihrem Server. Deaktivierte Rollen verleihen nichts.
     */
    async roleIdsFor(userId, guildId = (0, guild_context_1.currentGuild)()) {
        const [direct, groups] = await Promise.all([
            this.prisma.userRole.findMany({ where: { userId }, select: { roleId: true } }),
            this.prisma.groupMember.findMany({ where: { userId }, select: { group: { select: { roles: { select: { roleId: true } } } } } }),
        ]);
        const ids = new Set(direct.map((r) => r.roleId));
        for (const g of groups)
            for (const r of g.group.roles)
                ids.add(r.roleId);
        if (!ids.size)
            return [];
        return (await this.prisma.role.findMany({ where: { id: { in: [...ids] }, active: true, OR: [{ guildId: null }, ...(guildId ? [{ guildId }] : [])] }, select: { id: true } })).map((r) => r.id);
    }
    async contextFor(userId) {
        const [overrides, roleIds] = await Promise.all([this.prisma.userPermissionOverride.findMany({ where: { userId } }), this.roleIdsFor(userId)]);
        const rolePerms = roleIds.length ? await this.prisma.rolePermission.findMany({ where: { roleId: { in: roleIds } } }) : [];
        const toGrant = (p, e) => ({ permission: p, effect: e === 'DENY' ? 'DENY' : 'ALLOW' });
        return {
            userOverrides: overrides.map((o) => toGrant(o.permissionKey, o.effect)),
            roleGrants: rolePerms.map((r) => toGrant(r.permissionKey, r.effect)),
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
            throw new errors_1.AppError('PERMISSION_DENIED', 'You do not have permission to perform this action.');
    }
    async effective(userId) {
        return (0, shared_1.effectivePermissions)(await this.contextFor(userId));
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
    /** Serverbesitzer = aktive Rolle „System Administrator“ (bei Discord-Login über ADMIN_DISCORD_IDS vergeben). */
    async isOwner(userId) {
        const ids = await this.roleIdsFor(userId);
        return ids.length > 0 && (await this.prisma.role.count({ where: { id: { in: ids }, name: 'System Administrator' } })) > 0;
    }
    /** Nur Rollen strikt unterhalb des eigenen Rangs dürfen verwaltet, vergeben oder entzogen werden (Besitzer: alle). */
    async assertOutranksRole(actorId, rolePriority, roleName) {
        if (await this.isOwner(actorId))
            return;
        if ((await this.rankOf(actorId)) >= rolePriority)
            throw new errors_1.AppError('PERMISSION_DENIED', `You can only manage roles ranked below your own${roleName ? ` ("${roleName}" is not)` : ''}.`);
    }
    /** Andere Benutzer nur verwalten, wenn man sie im Rang übertrifft (Benutzer ohne Rolle: jeder mit Rang). */
    async assertOutranksUser(actorId, targetId) {
        if (await this.isOwner(actorId))
            return;
        const [a, t] = await Promise.all([this.rankOf(actorId), this.rankOf(targetId)]);
        if (a === exports.NO_RANK || (t !== exports.NO_RANK && a >= t))
            throw new errors_1.AppError('PERMISSION_DENIED', 'You can only manage users ranked below you.');
    }
    /** Erlauben darf man nur, was man selbst besitzt (keine Rechteausweitung über den Editor). */
    async assertCanDelegate(actorId, permissions) {
        if (!permissions.length)
            return;
        const ctx = await this.contextFor(actorId);
        const bad = permissions.filter((p) => !(0, shared_1.canDelegate)(ctx, p));
        if (bad.length)
            throw new errors_1.AppError('PERMISSION_DENIED', `You cannot grant permissions you do not have yourself: ${bad.slice(0, 5).join(', ')}.`);
    }
};
exports.PermissionService = PermissionService;
exports.PermissionService = PermissionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PermissionService);
//# sourceMappingURL=permission.service.js.map