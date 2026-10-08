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
exports.NotifyService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const realtime_service_1 = require("../realtime/realtime.service");
/** Wie viele Empfänger höchstens je Ereignis (Schutz vor Massen-Benachrichtigungen). */
const MAX_RECIPIENTS = 500;
/**
 * Persönliche Benachrichtigungen: speichern + sofort an offene Dashboards melden (Popup).
 * Welche Arten jemand sehen will, stellt jeder selbst ein (ausgeblendete Arten filtert die Liste).
 * Fehler beim Benachrichtigen dürfen den Fachprozess nie stören.
 */
let NotifyService = class NotifyService {
    prisma;
    rt;
    log = new common_1.Logger('Notify');
    constructor(prisma, rt) {
        this.prisma = prisma;
        this.rt = rt;
    }
    async notify(userIds, n) {
        const ids = [...new Set(userIds)].slice(0, MAX_RECIPIENTS);
        if (!ids.length)
            return;
        try {
            await this.prisma.notification.createMany({ data: ids.map((userId) => ({ userId, type: n.type, title: n.title.slice(0, 200), body: n.body?.slice(0, 1000), entityType: n.entityType, entityId: n.entityId })) });
            for (const id of ids)
                this.rt.publishToUser(id, 'notification.new', { type: n.type, title: n.title.slice(0, 200) });
        }
        catch (e) {
            this.log.warn(`Benachrichtigung fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
        }
    }
    /** Aktive Benutzer mit einem Recht (im angegebenen Server bzw. serverübergreifend), ohne `exceptUserId`. Gebündelt: 5 Abfragen insgesamt. */
    async usersWith(permission, opts = {}) {
        const users = await this.prisma.user.findMany({ where: { active: true, ...(opts.exceptUserId ? { id: { not: opts.exceptUserId } } : {}) }, select: { id: true }, take: 5000 });
        const ids = users.map((u) => u.id);
        const g = opts.guildId ?? null;
        const [direct, groups, overrides, roles] = await Promise.all([
            this.prisma.userRole.findMany({ where: { userId: { in: ids } } }),
            this.prisma.groupMember.findMany({ where: { userId: { in: ids } }, select: { userId: true, group: { select: { roles: { select: { roleId: true } } } } } }),
            this.prisma.userPermissionOverride.findMany({ where: { userId: { in: ids } } }),
            this.prisma.role.findMany({ where: { active: true, OR: [{ guildId: null }, ...(g ? [{ guildId: g }] : [])] }, select: { id: true } }),
        ]);
        const valid = new Set(roles.map((r) => r.id));
        const grants = await this.prisma.rolePermission.findMany({ where: { roleId: { in: [...valid] } } });
        const byRole = new Map();
        for (const x of grants)
            byRole.set(x.roleId, [...(byRole.get(x.roleId) ?? []), { permission: x.permissionKey, effect: x.effect === 'DENY' ? 'DENY' : 'ALLOW' }]);
        const rolesOf = new Map();
        const add = (u, r) => { if (valid.has(r))
            rolesOf.set(u, (rolesOf.get(u) ?? new Set()).add(r)); };
        for (const d of direct)
            add(d.userId, d.roleId);
        for (const m of groups)
            for (const r of m.group.roles)
                add(m.userId, r.roleId);
        const out = [];
        for (const id of ids) {
            const ctx = { userOverrides: overrides.filter((o) => o.userId === id).map((o) => ({ permission: o.permissionKey, effect: (o.effect === 'DENY' ? 'DENY' : 'ALLOW') })), roleGrants: [...(rolesOf.get(id) ?? [])].flatMap((r) => byRole.get(r) ?? []) };
            if ((0, shared_1.can)(ctx, permission))
                out.push(id);
            if (out.length >= MAX_RECIPIENTS)
                break;
        }
        return out;
    }
    async notifyPermission(permission, n, opts = {}) {
        try {
            await this.notify(await this.usersWith(permission, opts), n);
        }
        catch (e) {
            this.log.warn(`Benachrichtigung fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
        }
    }
};
exports.NotifyService = NotifyService;
exports.NotifyService = NotifyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, realtime_service_1.RealtimeService])
], NotifyService);
//# sourceMappingURL=notify.service.js.map