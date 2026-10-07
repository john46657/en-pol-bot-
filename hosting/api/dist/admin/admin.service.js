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
exports.AdminService = exports.SETTING_SCHEMAS = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
const custom_fields_1 = require("../studio/custom-fields");
const studio_service_1 = require("../studio/studio.service");
const qualifications_config_1 = require("../qualifications/qualifications.config");
const guild_context_1 = require("../common/guild-context");
/** Eine oder mehrere Discord-IDs, mit Komma getrennt (z. B. Channels auf mehreren Servern). */
const singleId = () => zod_1.z.string().regex(/^\d{15,25}$/).optional();
const idList = () => zod_1.z.string().regex(/^\d{15,25}(\s*,\s*\d{15,25})*$/).optional();
/** Nur bekannte Settings-Keys mit striktem Schema werden akzeptiert. */
exports.SETTING_SCHEMAS = {
    'org.name': zod_1.z.string().min(1).max(100),
    'org.serverName': zod_1.z.string().min(1).max(100),
    'org.timezone': zod_1.z.string().min(3).max(64),
    'org.dateFormat': zod_1.z.enum(['DD.MM.YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY']),
    'retention.sessionDays': zod_1.z.number().int().min(1).max(365),
    'retention.loginHistoryDays': zod_1.z.number().int().min(30).max(3650),
    'retention.readNotificationDays': zod_1.z.number().int().min(7).max(3650),
    'dashboard.defaultLayout': zod_1.z.array(zod_1.z.object({ widget: zod_1.z.string().max(40), visible: zod_1.z.boolean(), order: zod_1.z.number().int() })).max(50),
    'studio.customFields': custom_fields_1.customFieldsConfig,
    'theme.accent': zod_1.z.union([zod_1.z.enum(studio_service_1.ACCENTS), zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Farbe als #rrggbb')]),
    /** Eigene Akzentfarben (Studio → Design → „Eigene Farbe hinzufügen“). */
    'theme.customAccents': zod_1.z.array(zod_1.z.object({ name: zod_1.z.string().trim().min(1).max(30), hex: zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Farbe als #rrggbb') })).max(24),
    'discord.channels': zod_1.z.object({ guildId: idList(), dispatch: idList(), wanted: idList(), announcements: idList(), applications: idList(), danger: idList(), sek: idList(), qualifications: idList(), duty: idList(), teamlist: singleId(), tickets: singleId(), staffRole: singleId(), radioRole: singleId(), sekRole: singleId(), dutyRole: idList(), breakRole: idList(), trainingRole: idList(), adminDutyRole: idList() }),
    'team.rankOrder': zod_1.z.array(zod_1.z.string().trim().min(1).max(64)).max(50),
    /** Teams und Büros (Dienstgrade: `team.rankOrder`) – Auswahl in Personalakten und Filter der Teamliste. */
    'team.structure': zod_1.z.object({ teams: zod_1.z.array(zod_1.z.string().trim().min(1).max(64)).max(50), offices: zod_1.z.array(zod_1.z.string().trim().min(1).max(64)).max(50) }),
    'application.form': qualifications_config_1.formSchema,
    /** „Mit Discord anmelden“: neue Konten erlauben, nur Mitglieder des Discord-Servers, Discord-Rolle → Systemrolle. */
    'auth.discord': zod_1.z.object({
        signup: zod_1.z.boolean(), requireGuild: zod_1.z.boolean(),
        roleMap: zod_1.z.array(zod_1.z.object({ discordRoleId: zod_1.z.string().regex(/^\d{15,25}$/), role: zod_1.z.string().trim().min(1).max(64) })).max(50),
        /** Team-Rolle(n): nur wer eine davon auf dem Discord-Server hat, kommt ins MDT/Dashboard (leer = alle Mitglieder). */
        teamRoleIds: zod_1.z.array(zod_1.z.string().regex(/^\d{15,25}$/, 'Discord-Rollen-ID (15–25 Ziffern)')).max(20).default([]),
    }),
};
let AdminService = class AdminService {
    prisma;
    audit;
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async getSettings() {
        const rows = await this.prisma.systemSetting.findMany();
        return { settings: Object.fromEntries(rows.map((r) => [r.key, r.value])), allowedKeys: Object.keys(exports.SETTING_SCHEMAS), serverScoped: guild_context_1.SERVER_SCOPED_SETTINGS };
    }
    /** `key@<guildId>`: Server-eigener Wert (nur für Einstellungen, die je Server getrennt sein dürfen). */
    async setSetting(actor, key, value) {
        const [base, guild] = key.split('@');
        if (guild !== undefined && (!/^\d{15,25}$/.test(guild) || !guild_context_1.SERVER_SCOPED_SETTINGS.includes(base)))
            throw new errors_1.AppError('VALIDATION_FAILED', `Die Einstellung „${base}“ kann nicht je Server gesetzt werden.`);
        const schema = exports.SETTING_SCHEMAS[base];
        if (!schema)
            throw new errors_1.AppError('VALIDATION_FAILED', `Unbekannte Einstellung „${key}“.`);
        const parsed = schema.safeParse(value);
        if (!parsed.success)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Ungültiger Wert für diese Einstellung.', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
        return this.prisma.$transaction(async (tx) => {
            const before = await tx.systemSetting.findUnique({ where: { key } });
            const row = await tx.systemSetting.upsert({ where: { key }, create: { key, value: parsed.data }, update: { value: parsed.data } });
            await this.audit.record(actor, { action: /^(application|dashboard|studio|theme|discord|team)\./.test(key) ? 'studio.config.changed' : 'settings.changed', module: 'settings', entityType: 'SystemSetting', entityId: key, before: before?.value, after: row.value }, tx);
            return { key, value: row.value };
        });
    }
    securityEvents(take = 100, type) {
        return this.prisma.securityEvent.findMany({ where: type ? { type } : {}, orderBy: { createdAt: 'desc' }, take, select: { id: true, type: true, userId: true, ip: true, detail: true, requestId: true, createdAt: true } });
    }
    async getLayout(userId) {
        const [mine, def] = await Promise.all([this.prisma.userSettings.findUnique({ where: { userId } }), this.prisma.systemSetting.findUnique({ where: { key: 'dashboard.defaultLayout' } })]);
        return { layout: mine?.dashboardLayout ?? def?.value ?? null, isDefault: !mine?.dashboardLayout };
    }
    async setLayout(actor, layout) {
        const userId = actor.userId;
        const parsed = layout === null ? null : exports.SETTING_SCHEMAS['dashboard.defaultLayout'].parse(layout);
        await this.prisma.userSettings.upsert({ where: { userId }, create: { userId, dashboardLayout: parsed ?? client_1.Prisma.DbNull }, update: { dashboardLayout: parsed ?? client_1.Prisma.DbNull } });
        return this.getLayout(userId); // null = Layout zurücksetzen
    }
    /** Aufbewahrung: löscht nur operative Hilfsdaten. AuditLog ist per DB-Trigger unlöschbar und wird hier bewusst NICHT angefasst. */
    async runRetention(actor) {
        const get = async (k, d) => ((await this.prisma.systemSetting.findUnique({ where: { key: k } }))?.value ?? d);
        const days = (n) => new Date(Date.now() - n * 86_400_000);
        const [sess, hist, notif] = await Promise.all([get('retention.sessionDays', 30), get('retention.loginHistoryDays', 365), get('retention.readNotificationDays', 90)]);
        return this.prisma.$transaction(async (tx) => {
            const sessions = await tx.session.deleteMany({ where: { OR: [{ expiresAt: { lt: days(sess) } }, { revokedAt: { lt: days(sess) } }] } });
            const logins = await tx.loginHistory.deleteMany({ where: { createdAt: { lt: days(hist) } } });
            await tx.discordOutbox.deleteMany({ where: { OR: [{ sentAt: { lt: days(7) } }, { attempts: { gte: 5 }, createdAt: { lt: days(7) } }] } });
            const notifications = await tx.notification.deleteMany({ where: { OR: [{ readAt: { lt: days(notif) } }, { archivedAt: { lt: days(notif) } }] } });
            const result = { sessions: sessions.count, loginHistory: logins.count, notifications: notifications.count };
            await this.audit.record(actor, { action: 'retention.run', module: 'settings', after: result }, tx);
            return result;
        });
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], AdminService);
//# sourceMappingURL=admin.service.js.map