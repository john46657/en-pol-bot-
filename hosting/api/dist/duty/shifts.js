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
exports.BotShiftsController = exports.ShiftsController = exports.ShiftsService = exports.shiftsConfigSchema = exports.shiftTypeSchema = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const errors_1 = require("../common/errors");
const KEY = 'shifts.config';
const sf = zod_1.z.string().regex(/^\d{15,25}$/);
const roles = zod_1.z.array(sf).max(25).default([]);
/** Schicht-Art (wie bei Melonly/ERM): Rolle im Dienst, Rolle in der Pause, Log-Channel. */
exports.shiftTypeSchema = zod_1.z.object({
    id: zod_1.z.string().regex(/^[a-z0-9-]{1,40}$/),
    name: zod_1.z.string().trim().min(1).max(60),
    isDefault: zod_1.z.boolean().default(false),
    onShiftRoleIds: roles,
    onBreakRoleIds: roles,
    logChannelId: sf.nullish(),
});
exports.shiftsConfigSchema = zod_1.z.object({ enabled: zod_1.z.boolean().default(false), types: zod_1.z.array(exports.shiftTypeSchema).max(25).default([]) })
    .superRefine((c, ctx) => {
    if (new Set(c.types.map((t) => t.id)).size !== c.types.length)
        ctx.addIssue({ code: 'custom', path: ['types'], message: 'Die IDs der Schichtarten müssen eindeutig sein.' });
    if (new Set(c.types.map((t) => t.name.toLowerCase())).size !== c.types.length)
        ctx.addIssue({ code: 'custom', path: ['types'], message: 'Die Namen der Schichtarten müssen eindeutig sein.' });
    if (c.types.filter((t) => t.isDefault).length > 1)
        ctx.addIssue({ code: 'custom', path: ['types'], message: 'Nur eine Schichtart kann der Standard sein.' });
});
let ShiftsService = class ShiftsService {
    prisma;
    audit;
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async config() {
        const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
        const r = exports.shiftsConfigSchema.safeParse(v ?? {});
        return r.success ? r.data : { enabled: false, types: [] };
    }
    async save(actor, input) {
        // ohne ausdrückliche Vorgabe wird die erste Art zur Standard-Schicht
        const types = input.types.length && !input.types.some((t) => t.isDefault) ? input.types.map((t, i) => ({ ...t, isDefault: i === 0 })) : input.types;
        const value = { ...input, types };
        const before = await this.config();
        await this.prisma.$transaction(async (tx) => {
            await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
            await this.audit.record(actor, { action: 'shifts.config', module: 'team', entityType: 'SystemSetting', entityId: KEY, before: before, after: value }, tx);
        });
        return this.config();
    }
    /** Welche Schicht-Art gilt? Gewählte → bei Pause die laufende → Standard. `null`, wenn das Modul aus ist. */
    async resolve(cfg, requested, current) {
        if (!cfg.enabled || !cfg.types.length) {
            if (requested)
                throw new errors_1.AppError('VALIDATION_FAILED', 'Schichtarten sind nicht aktiviert.');
            return null;
        }
        if (requested) {
            const t = cfg.types.find((x) => x.id === requested);
            if (!t)
                throw new errors_1.AppError('NOT_FOUND', 'Unbekannte Schichtart.');
            return t;
        }
        return cfg.types.find((x) => x.id === current) ?? cfg.types.find((x) => x.isDefault) ?? cfg.types[0];
    }
    /** Discord-Rollen je Status: Schicht-Rolle im Dienst, Pausen-Rolle in der Pause; alle anderen Schicht-Rollen weg. */
    static roleChanges(cfg, type, status) {
        const all = [...new Set(cfg.types.flatMap((t) => [...t.onShiftRoleIds, ...t.onBreakRoleIds]))];
        const add = !type || status === 'OFF_DUTY' ? [] : status === 'BREAK' ? type.onBreakRoleIds : type.onShiftRoleIds;
        return { add: [...new Set(add)], remove: all.filter((r) => !add.includes(r)) };
    }
};
exports.ShiftsService = ShiftsService;
exports.ShiftsService = ShiftsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], ShiftsService);
let ShiftsController = class ShiftsController {
    s;
    constructor(s) {
        this.s = s;
    }
    /** Schicht-Arten (Auswahl beim Dienstbeginn). */
    config() { return this.s.config(); }
    save(a, b) { return this.s.save(a, b); }
};
exports.ShiftsController = ShiftsController;
__decorate([
    (0, common_1.Get)('config'),
    (0, decorators_1.RequirePermission)('team.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ShiftsController.prototype, "config", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(exports.shiftsConfigSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ShiftsController.prototype, "save", null);
exports.ShiftsController = ShiftsController = __decorate([
    (0, swagger_1.ApiTags)('team'),
    (0, common_1.Controller)('shifts'),
    __metadata("design:paramtypes", [ShiftsService])
], ShiftsController);
let BotShiftsController = class BotShiftsController {
    s;
    constructor(s) {
        this.s = s;
    }
    config() { return this.s.config(); }
};
exports.BotShiftsController = BotShiftsController;
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], BotShiftsController.prototype, "config", null);
exports.BotShiftsController = BotShiftsController = __decorate([
    (0, swagger_1.ApiTags)('bot'),
    (0, common_1.Controller)('bot/shifts'),
    __metadata("design:paramtypes", [ShiftsService])
], BotShiftsController);
//# sourceMappingURL=shifts.js.map