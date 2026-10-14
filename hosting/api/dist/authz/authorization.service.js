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
exports.AuthorizationService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const permission_service_1 = require("./permission.service");
const modules_service_1 = require("../server/modules.service");
const errors_1 = require("../common/errors");
const MESSAGES = {
    MODULE_DISABLED: 'Dieses Modul ist deaktiviert.',
    PERMISSION: 'Dafür fehlt dir die Berechtigung.',
};
const deny = (reason) => ({ allowed: false, reason, message: MESSAGES[reason] });
/**
 * Zentrale Zugriffsentscheidung für ALLE geschützten Aktionen (PermissionGuard, Bot-Aufrufe):
 * authentifizierter Benutzer (AuthGuard, inkl. laufender Discord-Mitgliedschaftsprüfung) → Modul an → Berechtigung
 * (DENY vor ALLOW). Standard ist „verweigert“. Abgeschaltete Module gelten auch für Systemadministratoren.
 */
let AuthorizationService = class AuthorizationService {
    prisma;
    perms;
    audit;
    modules;
    deniedLog = new Map();
    constructor(prisma, perms, audit, modules) {
        this.prisma = prisma;
        this.perms = perms;
        this.audit = audit;
        this.modules = modules;
    }
    async authorize(userId, permission) {
        const module = (0, shared_1.moduleOfPermission)(permission);
        if (module !== 'core' && (await this.modules.disabled()).has(module))
            return deny('MODULE_DISABLED');
        if (!(0, shared_1.resolvePermission)(await this.perms.contextFor(userId), permission).allowed)
            return deny('PERMISSION');
        return { allowed: true };
    }
    /** Wie `authorize`, wirft aber `PERMISSION_DENIED` und protokolliert die Verweigerung (gedrosselt). */
    async assert(userId, permission, meta = {}) {
        const d = await this.authorize(userId, permission);
        if (d.allowed)
            return;
        await this.recordDenied(userId, permission, d.reason, meta);
        throw new errors_1.AppError('PERMISSION_DENIED', d.message, { reason: d.reason });
    }
    /** Verweigerte Zugriffe: SecurityEvent + Audit (DENIED), je Benutzer/Recht höchstens einmal pro Minute. */
    async recordDenied(userId, permission, reason, meta = {}) {
        const key = `${userId}|${permission}|${reason}`;
        const now = Date.now();
        if (now - (this.deniedLog.get(key) ?? 0) < 60_000)
            return;
        this.deniedLog.set(key, now);
        if (this.deniedLog.size > 10_000)
            this.deniedLog.clear();
        await this.prisma.securityEvent.create({ data: { type: 'PERMISSION_DENIED', userId, detail: `${permission} (${reason})`.slice(0, 200), requestId: meta.requestId, ip: meta.ip } }).catch(() => undefined);
        await this.audit.record({ userId, requestId: meta.requestId }, { action: 'access.denied', module: 'permissions', entityType: 'Permission', entityId: permission, after: { reason }, result: 'DENIED' }).catch(() => undefined);
    }
    /** Effektive Rechte – serverseitig berechnet (Rollen, persönliche Ausnahmen, abgeschaltete Module). */
    async effective(userId) {
        const [all, disabled] = await Promise.all([this.perms.effective(userId), this.modules.disabled()]);
        return disabled.size ? all.filter((p) => !disabled.has((0, shared_1.moduleOfPermission)(p))) : all;
    }
};
exports.AuthorizationService = AuthorizationService;
exports.AuthorizationService = AuthorizationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, permission_service_1.PermissionService, audit_service_1.AuditService, modules_service_1.ModulesService])
], AuthorizationService);
//# sourceMappingURL=authorization.service.js.map