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
const permission_service_1 = require("../authz/permission.service");
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
        /** zusätzlich nur bei dieser Stufe pingen */
        pingRoleIds: zod_1.z.array(sf).max(10).optional(),
        /** nur diese Discord-Rollen dürfen auf diese Stufe schalten (leer = alle mit dispatch.manage) */
        allowRoleIds: zod_1.z.array(sf).max(10).optional(),
    })).min(2).max(10).refine((xs) => new Set(xs.map((x) => x.key)).size === xs.length, 'Schlüssel müssen eindeutig sein'),
});
/** Gefahrenstatus. Stufen/Texte/Farben/Pings kommen aus der Konfiguration (Dashboard); Änderungen sind auditiert und gehen live raus. */
let DangerService = class DangerService {
    prisma;
    audit;
    rt;
    discord;
    perms;
    constructor(prisma, audit, rt, discord, perms) {
        this.prisma = prisma;
        this.audit = audit;
        this.rt = rt;
        this.discord = discord;
        this.perms = perms;
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
    /**
     * Status setzen. Hat die Stufe freigegebene Rollen, gilt zusätzlich: aus Discord nur mit einer dieser Rollen
     * (`discordRoles` = Rollen des Klickenden), ohne Discord (Dashboard/API) nur mit settings.manage.
     */
    async set(actor, level, reason, discordRoles = null) {
        const cfg = await this.config();
        const want = level.trim().toUpperCase();
        const def = cfg.levels.find((l) => l.key === want || l.name.toUpperCase() === want);
        if (!def)
            throw new errors_1.AppError('VALIDATION_FAILED', `Unbekannte Stufe. Möglich: ${cfg.levels.map((l) => l.name).join(', ')}`);
        if (def.allowRoleIds?.length) {
            const ok = discordRoles ? discordRoles.some((r) => def.allowRoleIds.includes(r)) : await this.perms.has(actor.userId, 'settings.manage');
            if (!ok)
                throw new errors_1.AppError('PERMISSION_DENIED', `Auf „${def.name}“ dürfen nur bestimmte Rollen schalten.`);
        }
        const before = await this.get();
        const storedKey = (await this.state()).level;
        const user = actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
        const state = { level: def.key, reason: reason?.trim() || null, setByName: user?.displayName ?? null, at: new Date().toISOString() };
        await this.prisma.$transaction(async (tx) => {
            await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: state }, update: { value: state } });
            await this.audit.record(actor, { action: 'danger.set', module: 'dispatch', entityType: 'DangerLevel', entityId: KEY, before: { level: before.level }, after: state, reason }, tx);
        });
        this.rt.publish('dispatch', 'danger.changed', { level: def.key });
        if (storedKey !== def.key || !before.at) {
            await this.discord.enqueue('danger', 'danger.changed', {
                level: def.key, name: def.name, title: def.title, text: def.text, emoji: def.emoji, color: def.color,
                previous: before.at ? before.def.name : null, reason: state.reason, setBy: state.setByName, pingRoleIds: [...new Set([...cfg.pingRoleIds, ...(def.pingRoleIds ?? [])])],
            });
        }
        return this.get();
    }
    /** Wo das Button-Panel gerade steht (merkt sich der Bot). */
    async panel() {
        const v = await this.discord.getState('danger-panel');
        return { channelId: v?.channelId ?? null, posted: !!v?.messageId };
    }
    /** Panel vom Dashboard aus in einen Kanal schicken (der Bot postet es und löscht ein älteres Panel). */
    async sendPanel(actor, channelId) {
        await this.prisma.$transaction(async (tx) => {
            await tx.discordOutbox.create({ data: { type: 'danger.panel', channelKey: 'danger', payload: { channelId } } });
            await this.audit.record(actor, { action: 'danger.panel', module: 'dispatch', entityType: 'DangerLevel', entityId: KEY, after: { channelId } }, tx);
        });
        return { queued: true };
    }
};
exports.DangerService = DangerService;
exports.DangerService = DangerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, realtime_service_1.RealtimeService, discord_service_1.DiscordService, permission_service_1.PermissionService])
], DangerService);
//# sourceMappingURL=danger.service.js.map