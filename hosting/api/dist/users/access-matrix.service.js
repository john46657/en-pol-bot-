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
exports.AccessMatrixService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const permission_service_1 = require("../authz/permission.service");
const notify_service_1 = require("../notifications/notify.service");
const errors_1 = require("../common/errors");
const roles_service_1 = require("./roles.service");
/**
 * Zentraler Berechtigungseditor (Matrix Rolle × Bereich × Zugriffsstufe). Übersetzt Stufen in die bestehenden Einzelrechte und
 * nutzt dafür den RolesService (Rang-Regeln, „nur weitergeben, was man selbst hat“, Protokoll je Recht, Live-Aktualisierung).
 * Zusätzlich: Aussperrschutz – eine Änderung, nach der man selbst den Berechtigungseditor nicht mehr nutzen könnte, wird abgelehnt.
 */
let AccessMatrixService = class AccessMatrixService {
    prisma;
    roles;
    perms;
    audit;
    notify;
    constructor(prisma, roles, perms, audit, notify) {
        this.prisma = prisma;
        this.roles = roles;
        this.perms = perms;
        this.audit = audit;
        this.notify = notify;
    }
    areas() {
        return shared_1.ACCESS_AREAS.map((a) => ({ key: a, actions: shared_1.PERMISSION_CATALOG[a], module: (0, shared_1.moduleOfPermission)(`${a}.x`), moduleName: (0, shared_1.moduleDef)((0, shared_1.moduleOfPermission)(`${a}.x`))?.name ?? 'Grundsystem' }));
    }
    async matrix() {
        const roles = await this.roles.list();
        return {
            areas: this.areas(),
            roles: roles.map((r) => ({
                id: r.id, name: r.name, priority: r.priority, color: r.color, active: r.active, guildId: r.guildId, system: r.name === 'System Administrator', members: r._count.users,
                levels: Object.fromEntries(shared_1.ACCESS_AREAS.map((a) => [a, (0, shared_1.accessLevelOf)(a, r.permissions.map((p) => ({ permission: p.permissionKey, effect: p.effect })))])),
            })),
            priority: 'Benutzer-Sperre > Benutzer-Sonderrecht > höchste Rolle mit Angabe (Sperre vor Erlaubnis) > kein Zugriff',
        };
    }
    /** Vorschau: welche Einzelrechte ändern sich? (ohne zu speichern) */
    async preview(roleId, area, level) {
        const role = await this.prisma.role.findUnique({ where: { id: roleId }, include: { permissions: true } });
        if (!role)
            throw new errors_1.AppError('NOT_FOUND', 'Rolle nicht gefunden.');
        const before = role.permissions.map((p) => ({ permission: p.permissionKey, effect: p.effect }));
        return (0, shared_1.accessDiff)(before, (0, shared_1.applyAccessLevel)(before, area, level));
    }
    async setLevel(actor, roleId, area, level) {
        const role = await this.prisma.role.findUnique({ where: { id: roleId }, include: { permissions: true } });
        if (!role)
            throw new errors_1.AppError('NOT_FOUND', 'Rolle nicht gefunden.');
        const before = role.permissions.map((p) => ({ permission: p.permissionKey, effect: p.effect }));
        const after = (0, shared_1.applyAccessLevel)(before, area, level);
        await this.assertNoLockout(actor.userId, roleId, after);
        const updated = await this.roles.setPermissions(actor, roleId, after);
        const diff = (0, shared_1.accessDiff)(before, after);
        if (diff.added.length || diff.removed.length) {
            await this.audit.record(actor, { action: 'role.access_level', module: 'permissions', entityType: 'Role', entityId: roleId, before: { role: role.name, area, level: (0, shared_1.accessLevelOf)(area, before) }, after: { role: role.name, area, level, ...diff } });
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
    async assertNoLockout(userId, roleId, newGrants) {
        if (await this.perms.isOwner(userId))
            return;
        const roleIds = await this.perms.roleIdsFor(userId);
        if (!roleIds.includes(roleId))
            return;
        const ctx = await this.perms.contextFor(userId);
        const role = await this.prisma.role.findUniqueOrThrow({ where: { id: roleId }, select: { priority: true } });
        // Rechte aller übrigen Rollen aus der DB, die geänderte Rolle mit ihren neuen Rechten
        const otherRoles = roleIds.filter((r) => r !== roleId);
        const otherGrants = otherRoles.length ? (await this.prisma.rolePermission.findMany({ where: { roleId: { in: otherRoles } }, include: { role: { select: { priority: true } } } })).map((p) => ({ permission: p.permissionKey, effect: p.effect === 'DENY' ? 'DENY' : 'ALLOW', rank: p.role.priority })) : [];
        const simulated = { userOverrides: ctx.userOverrides, roleGrants: [...otherGrants, ...newGrants.map((g) => ({ ...g, rank: role.priority }))] };
        const lost = shared_1.LOCKOUT_CRITICAL.filter((p) => (0, shared_1.resolvePermission)(ctx, p).allowed && !(0, shared_1.resolvePermission)(simulated, p).allowed);
        if (lost.length)
            throw new errors_1.AppError('CONFLICT', `Diese Änderung würde dich selbst aus dem Berechtigungseditor aussperren (${lost.join(', ')}). Lass sie von einer anderen berechtigten Person durchführen.`, { reason: 'SELF_LOCKOUT' });
    }
    /** Effektive Rechte eines Benutzers je Bereich (mit Herkunft), für die Prüfung „wer darf was“. */
    async userLevels(userId) {
        const ctx = await this.perms.contextFor(userId);
        return shared_1.ACCESS_AREAS.map((a) => {
            const actions = shared_1.PERMISSION_CATALOG[a].map((x) => ({ action: x, ...(0, shared_1.resolvePermission)(ctx, `${a}.${x}`) }));
            return { area: a, allowed: actions.filter((x) => x.allowed).map((x) => x.action), actions };
        });
    }
};
exports.AccessMatrixService = AccessMatrixService;
exports.AccessMatrixService = AccessMatrixService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, roles_service_1.RolesService, permission_service_1.PermissionService, audit_service_1.AuditService, notify_service_1.NotifyService])
], AccessMatrixService);
//# sourceMappingURL=access-matrix.service.js.map