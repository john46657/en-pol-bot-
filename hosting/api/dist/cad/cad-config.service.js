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
exports.CadConfigService = exports.cadConfigSchema = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
const KEY = 'cad.config';
const sf = zod_1.z.string().regex(/^\d{15,25}$/);
const color = zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/);
const keyStr = zod_1.z.string().trim().regex(/^[A-Za-z0-9_-]{1,32}$/, 'Schlüssel: nur Buchstaben, Ziffern, _ und - (max. 32)');
const option = zod_1.z.object({ key: keyStr, label: zod_1.z.string().trim().min(1).max(60), emoji: zod_1.z.string().max(16).optional(), color: color.optional(), order: zod_1.z.number().int().optional() });
const uniqueKeys = (xs) => new Set(xs.map((x) => x.key.toUpperCase())).size === xs.length;
const list = (item, min = 0, max = 50) => zod_1.z.array(item).min(min).max(max).refine((xs) => uniqueKeys(xs), 'Schlüssel müssen eindeutig sein');
exports.cadConfigSchema = zod_1.z.object({
    homeGuildId: sf.nullish(),
    incidentNumberPrefix: zod_1.z.string().trim().regex(/^[A-Z0-9]{1,6}$/).default('E'),
    incidentTypes: list(option, 0, 60),
    priorities: list(option, 1, 12),
    incidentStatuses: list(option.extend({ closed: zod_1.z.boolean().optional() }), 2, 20).refine((xs) => xs.some((x) => x.closed) && xs.some((x) => !x.closed), 'Mindestens ein offener und ein abschließender Status'),
    unitStatuses: list(option, 2, 20),
    unitTypes: list(option.extend({ layer: zod_1.z.string().max(32).optional() }), 0, 30),
    layers: list(zod_1.z.object({ key: keyStr, label: zod_1.z.string().trim().min(1).max(60), builtin: zod_1.z.boolean().optional(), enabledByDefault: zod_1.z.boolean().optional() }), 1, 40),
    markers: list(zod_1.z.object({ key: keyStr, label: zod_1.z.string().trim().min(1).max(60), emoji: zod_1.z.string().min(1).max(16), color }), 1, 30),
    map: zod_1.z.object({
        imageUrl: zod_1.z.string().max(500).refine((v) => /^(https:\/\/|\/api\/v1\/media\/)/.test(v), 'Bild-Adresse muss mit https:// beginnen oder eine hochgeladene Datei sein').nullish(),
        width: zod_1.z.number().int().min(100).max(20000), height: zod_1.z.number().int().min(100).max(20000),
        originX: zod_1.z.number().finite(), originY: zod_1.z.number().finite(), scale: zod_1.z.number().positive().max(100),
    }),
    routes: zod_1.z.array(zod_1.z.object({ id: zod_1.z.string().min(1).max(40), guildId: sf, event: zod_1.z.enum(shared_1.CAD_EVENTS), channelIds: zod_1.z.array(sf).max(10), pingRoleIds: zod_1.z.array(sf).max(10).default([]), enabled: zod_1.z.boolean().default(true) })).max(100),
    memberFields: list(zod_1.z.object({ key: keyStr, label: zod_1.z.string().trim().min(1).max(60), type: zod_1.z.enum(['text', 'number', 'select']), options: zod_1.z.array(zod_1.z.string().max(60)).max(30).optional() }), 0, 20),
    widgets: zod_1.z.array(zod_1.z.enum(shared_1.CAD_WIDGETS)).max(20),
});
/** Zentrale CAD-Konfiguration (eine Quelle für Backend, Dashboard und Bot). Fehlt etwas, gelten die Standardwerte. */
let CadConfigService = class CadConfigService {
    prisma;
    audit;
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async get() {
        const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
        const merged = { ...shared_1.DEFAULT_CAD_CONFIG, ...(v ?? {}), map: { ...shared_1.DEFAULT_CAD_CONFIG.map, ...(v?.map ?? {}) } };
        const r = exports.cadConfigSchema.safeParse(merged);
        return (r.success ? r.data : shared_1.DEFAULT_CAD_CONFIG);
    }
    /** Teil-Update (Autosave schickt einzelne Bereiche). */
    async save(actor, patch) {
        const before = await this.get();
        const r = exports.cadConfigSchema.safeParse({ ...before, ...patch, ...(patch.map ? { map: { ...before.map, ...patch.map } } : {}) });
        if (!r.success)
            throw new errors_1.AppError('VALIDATION_FAILED', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
        const value = r.data;
        await this.prisma.$transaction(async (tx) => {
            await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
            await this.audit.record(actor, { action: patch.map ? 'cad.map.config' : 'cad.config', module: 'cad', entityType: 'SystemSetting', entityId: KEY, before: Object.fromEntries(Object.keys(patch).map((k) => [k, before[k]])), after: patch }, tx);
        });
        return this.get();
    }
};
exports.CadConfigService = CadConfigService;
exports.CadConfigService = CadConfigService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], CadConfigService);
//# sourceMappingURL=cad-config.service.js.map