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
exports.DangerService = exports.dangerConfigSchema = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const realtime_service_1 = require("../realtime/realtime.service");
const discord_service_1 = require("../discord/discord.service");
const errors_1 = require("../common/errors");
const KEY = 'danger.current';
const CFG = 'danger.config';
const sf = zod_1.z.string().regex(/^\d{15,25}$/);
exports.dangerConfigSchema = zod_1.z.object({
    panelTitle: zod_1.z.string().trim().min(1).max(200),
    panelText: zod_1.z.string().max(3000),
    buttonEmoji: zod_1.z.string().max(16),
    pingRoleIds: zod_1.z.array(sf).max(10),
    levels: zod_1.z.array(zod_1.z.object({
        key: zod_1.z.string().trim().regex(/^[A-Z0-9_]{1,24}$/), name: zod_1.z.string().trim().min(1).max(40), title: zod_1.z.string().trim().max(200), text: zod_1.z.string().max(3500),
        emoji: zod_1.z.string().max(16), color: zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/), buttonStyle: zod_1.z.enum(['primary', 'secondary', 'success', 'danger']),
    })).min(2).max(10).refine((xs) => new Set(xs.map((x) => x.key)).size === xs.length, 'Schlüssel müssen eindeutig sein'),
});
/** Gefahrenstatus. Stufen/Texte/Farben/Pings kommen aus der Konfiguration (Dashboard); Änderungen sind auditiert und gehen live raus. */
let DangerService = class DangerService {
    prisma;
    audit;
    rt;
    discord;
    constructor(prisma, audit, rt, discord) {
        this.prisma = prisma;
        this.audit = audit;
        this.rt = rt;
        this.discord = discord;
    }
    async config() {
        const v = (await this.prisma.systemSetting.findUnique({ where: { key: CFG } }))?.value;
        const r = exports.dangerConfigSchema.safeParse({ ...shared_1.DEFAULT_DANGER_CONFIG, ...(v ?? {}) });
        return r.success ? r.data : shared_1.DEFAULT_DANGER_CONFIG;
    }
    async saveConfig(actor, input) {
        const before = await this.config();
        const value = input;
        await this.prisma.$transaction(async (tx) => {
            await tx.systemSetting.upsert({ where: { key: CFG }, create: { key: CFG, value }, update: { value } });
            await this.audit.record(actor, { action: 'danger.config', module: 'dispatch', entityType: 'SystemSetting', entityId: CFG, before, after: input }, tx);
        });
        this.rt.publish('dispatch', 'danger.changed', {});
        return this.config();
    }
    async state() {
        const row = await this.prisma.systemSetting.findUnique({ where: { key: KEY } });
        return row?.value ?? { level: '', reason: null, setByName: null, at: null };
    }
    /** Aktueller Status inkl. Stufe aus der Konfiguration und der Liste aller Stufen (für Buttons/Anzeige). */
    async get() {
        const [s, cfg] = await Promise.all([this.state(), this.config()]);
        const def = (0, shared_1.dangerLevelOf)(cfg, s.level);
        return { ...s, level: def.key, def, levels: cfg.levels.map((l) => ({ key: l.key, name: l.name, title: l.title, emoji: l.emoji, color: l.color, buttonStyle: l.buttonStyle })), panel: { title: cfg.panelTitle, text: cfg.panelText, buttonEmoji: cfg.buttonEmoji } };
    }
    async set(actor, level, reason) {
        const cfg = await this.config();
        const want = level.trim().toUpperCase();
        const def = cfg.levels.find((l) => l.key === want || l.name.toUpperCase() === want);
        if (!def)
            throw new errors_1.AppError('VALIDATION_FAILED', `Unbekannte Stufe. Möglich: ${cfg.levels.map((l) => l.name).join(', ')}`);
        const before = await this.get();
        const user = actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
        const state = { level: def.key, reason: reason?.trim() || null, setByName: user?.displayName ?? null, at: new Date().toISOString() };
        await this.prisma.$transaction(async (tx) => {
            await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: state }, update: { value: state } });
            await this.audit.record(actor, { action: 'danger.set', module: 'dispatch', entityType: 'DangerLevel', entityId: KEY, before: { level: before.level }, after: state, reason }, tx);
        });
        this.rt.publish('dispatch', 'danger.changed', { level: def.key });
        if (before.level !== def.key || !before.at) {
            await this.discord.enqueue('danger', 'danger.changed', {
                level: def.key, name: def.name, title: def.title, text: def.text, emoji: def.emoji, color: def.color,
                previous: before.at ? before.def.name : null, reason: state.reason, setBy: state.setByName, pingRoleIds: cfg.pingRoleIds,
            });
        }
        return this.get();
    }
};
exports.DangerService = DangerService;
exports.DangerService = DangerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, realtime_service_1.RealtimeService, discord_service_1.DiscordService])
], DangerService);
//# sourceMappingURL=danger.service.js.map