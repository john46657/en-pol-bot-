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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditController = void 0;
exports.auditSummary = auditSummary;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const prisma_service_1 = require("../prisma/prisma.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const pagination_1 = require("../common/pagination");
const q = pagination_1.pageQuery.extend({ module: zod_1.z.string().optional(), entityType: zod_1.z.string().optional(), entityId: zod_1.z.string().optional(), action: zod_1.z.string().max(60).optional() });
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const EFFECT = { ALLOW: 'erlaubt', DENY: 'verweigert' };
/** Lesbarer Satz für Rechteänderungen („Max hat der Rolle Moderator die Berechtigung ticket.delete entzogen.“). */
function auditSummary(e, actor, target) {
    const b = obj(e.before), a = obj(e.after);
    const role = String(a?.role ?? b?.role ?? b?.name ?? a?.name ?? '');
    const perm = String(a?.permission ?? b?.permission ?? '');
    switch (e.action) {
        case 'role.permission.allow': return `${actor} hat der Rolle „${role}“ die Berechtigung ${perm} erteilt${b?.effect ? ` (vorher ${EFFECT[String(b.effect)] ?? b.effect})` : ''}.`;
        case 'role.permission.deny': return `${actor} hat der Rolle „${role}“ die Berechtigung ${perm} ausdrücklich verweigert.`;
        case 'role.permission.remove': return `${actor} hat der Rolle „${role}“ die Berechtigung ${perm} entzogen (vorher ${EFFECT[String(b?.effect)] ?? '—'}).`;
        case 'role.create': return `${actor} hat die Rolle „${role}“ erstellt.`;
        case 'role.delete': return `${actor} hat die Rolle „${role}“ gelöscht.`;
        case 'role.duplicate': return `${actor} hat die Rolle „${String(a?.from ?? '')}“ als „${role}“ dupliziert.`;
        case 'role.enable': return `${actor} hat die Rolle „${role}“ aktiviert.`;
        case 'role.disable': return `${actor} hat die Rolle „${role}“ deaktiviert.`;
        case 'role.discord_roles': return `${actor} hat die Discord-Verknüpfung der Rolle „${role}“ geändert.`;
        case 'role.update': return `${actor} hat die Rolle „${role}“ bearbeitet.`;
        case 'role.reorder': return `${actor} hat die Reihenfolge der Rollen geändert.`;
        case 'user.roles.set': return `${actor} hat die Rollen von ${target ?? 'einem Benutzer'} geändert.`;
        case 'user.override.add': return `${actor} hat ${target ?? 'einem Benutzer'} die Berechtigung ${String(a?.permissionKey ?? '')} ${a?.effect === 'DENY' ? 'ausdrücklich verweigert' : 'zusätzlich erteilt'}.`;
        case 'user.override.remove': return `${actor} hat die individuelle Berechtigung ${String(b?.permissionKey ?? '')} von ${target ?? 'einem Benutzer'} entfernt.`;
        case 'auth.discord.roles_synced': return `Discord-Abgleich: Rollen von ${target ?? 'einem Benutzer'} angepasst.`;
        case 'auth.discord.access_revoked': return `Discord-Abgleich: Zugriff von ${target ?? 'einem Benutzer'} entzogen (keine freigeschaltete Discord-Rolle mehr).`;
        default: return null;
    }
}
/** Nur lesend. Es gibt bewusst keine Schreib-/Lösch-Endpunkte für Audit-Logs. */
let AuditController = class AuditController {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list(f) {
        const where = { ...(f.module ? { module: f.module } : {}), ...(f.entityType ? { entityType: f.entityType } : {}), ...(f.entityId ? { entityId: f.entityId } : {}), ...(f.action ? { action: { startsWith: f.action } } : {}) };
        const [items, total] = await Promise.all([this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...(0, pagination_1.skipTake)(f) }), this.prisma.auditLog.count({ where })]);
        // Handelnde Person und betroffener Benutzer mit Name und Discord-ID
        const ids = [...new Set(items.flatMap((i) => [i.actorUserId, i.entityType === 'User' ? i.entityId : null]).filter((x) => !!x && /^[0-9a-f-]{36}$/i.test(x)))];
        const [users, links] = ids.length ? await Promise.all([this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }), this.prisma.discordLink.findMany({ where: { userId: { in: ids } } })]) : [[], []];
        const who = (id) => (id ? { id, name: users.find((u) => u.id === id)?.displayName ?? null, discordId: links.find((l) => l.userId === id)?.discordId ?? null } : null);
        return (0, pagination_1.pageResult)(items.map((i) => {
            const actor = who(i.actorUserId), target = i.entityType === 'User' ? who(i.entityId) : null;
            return { ...i, actor, target, summary: auditSummary(i, actor?.name ?? 'System', target?.name) };
        }), total, f);
    }
};
exports.AuditController = AuditController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('audit.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(q))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", Promise)
], AuditController.prototype, "list", null);
exports.AuditController = AuditController = __decorate([
    (0, swagger_1.ApiTags)('audit'),
    (0, common_1.Controller)('audit'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AuditController);
//# sourceMappingURL=audit.controller.js.map