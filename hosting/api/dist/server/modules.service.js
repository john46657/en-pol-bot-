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
exports.ModulesService = exports.MODULES_KEY = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
exports.MODULES_KEY = 'modules.config';
const TTL = 5_000;
/**
 * Module zentral an- und ausschalten (Administration → Module). Ohne Eintrag ist ein Modul an. Abgeschaltete Module sperrt der
 * AuthorizationService im Dashboard, in der API und bei Discord-Befehlen; der Bot registriert ihre Befehle nicht.
 */
let ModulesService = class ModulesService {
    prisma;
    audit;
    cache = null;
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async read(db = this.prisma) {
        const v = (await db.systemSetting.findUnique({ where: { key: exports.MODULES_KEY } }))?.value;
        const known = new Set(shared_1.MODULES.filter((m) => !m.system).map((m) => m.key));
        return { disabled: (Array.isArray(v?.disabled) ? v.disabled : []).filter((k) => typeof k === 'string' && known.has(k)), version: typeof v?.version === 'number' ? v.version : 0 };
    }
    /** Abgeschaltete Module (5 s zwischengespeichert; diese Instanz nach Änderungen sofort). */
    async disabled() {
        if (this.cache && Date.now() - this.cache.at < TTL)
            return this.cache.disabled;
        const disabled = new Set((await this.read()).disabled);
        this.cache = { at: Date.now(), disabled };
        return disabled;
    }
    async list() {
        const c = await this.read();
        return {
            version: c.version,
            modules: shared_1.MODULES.map((m) => ({ key: m.key, name: m.name, description: m.description, system: !!m.system, dependsOn: m.dependsOn ?? [], enabled: m.system ? true : !c.disabled.includes(m.key) })),
        };
    }
    /** Modul an/aus. `version` = gelesener Stand; ein veralteter Stand wird mit 409 abgelehnt. Abhängigkeiten werden geprüft. */
    async set(actor, key, enabled, version) {
        const def = (0, shared_1.moduleDef)(key);
        if (!def)
            throw new errors_1.AppError('NOT_FOUND', 'Unbekanntes Modul.');
        await this.prisma.$transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${exports.MODULES_KEY}))`;
            const c = await this.read(tx);
            if (c.version !== version)
                throw new errors_1.AppError('CONFLICT', 'Die Module wurden inzwischen von jemand anderem geändert. Bitte neu laden – deine Änderung wurde NICHT gespeichert.', { reason: 'VERSION_CONFLICT' });
            const state = Object.fromEntries(shared_1.MODULES.map((m) => [m.key, m.system ? true : !c.disabled.includes(m.key)]));
            if (state[key] === enabled)
                return;
            const err = (0, shared_1.moduleDependencyError)(key, enabled, state);
            if (err)
                throw new errors_1.AppError('VALIDATION_FAILED', err);
            const value = { disabled: enabled ? c.disabled.filter((k) => k !== key) : [...c.disabled, key], version: c.version + 1 };
            await tx.systemSetting.upsert({ where: { key: exports.MODULES_KEY }, create: { key: exports.MODULES_KEY, value }, update: { value } });
            await this.audit.record(actor, { action: enabled ? 'module.enable' : 'module.disable', module: 'modules', entityType: 'Module', entityId: key, before: { enabled: !enabled }, after: { enabled } }, tx);
        });
        this.cache = null;
        return this.list();
    }
};
exports.ModulesService = ModulesService;
exports.ModulesService = ModulesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], ModulesService);
//# sourceMappingURL=modules.service.js.map