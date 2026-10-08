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
exports.WelcomeService = exports.welcomeConfigSchema = void 0;
const guild_context_1 = require("../common/guild-context");
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const applications_service_1 = require("../applications/applications.service");
const qualifications_service_1 = require("../qualifications/qualifications.service");
const tickets_service_1 = require("../support-tickets/tickets.service");
const media_service_1 = require("../media/media.service");
const errors_1 = require("../common/errors");
const KEY = 'welcome.config';
const sf = zod_1.z.string().regex(/^\d{15,25}$/, 'Discord-ID (15–25 Ziffern)');
const message = (d) => zod_1.z.object({
    enabled: zod_1.z.boolean().default(d.enabled),
    channelId: sf.nullish().transform((v) => v ?? null),
    title: zod_1.z.string().trim().max(256).default(d.title),
    message: zod_1.z.string().trim().max(4000).default(d.message),
    color: zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/).default(d.color),
    showAvatar: zod_1.z.boolean().default(d.showAvatar),
    pingUser: zod_1.z.boolean().default(d.pingUser),
    image: zod_1.z.union([zod_1.z.string().trim().max(500).regex(/^https:\/\/\S+$/, 'Bild-URL muss mit https:// beginnen'), zod_1.z.literal('')]).default(''),
    imageMediaId: zod_1.z.union([zod_1.z.string().uuid(), zod_1.z.literal('')]).default(''),
}).default({});
exports.welcomeConfigSchema = zod_1.z.object({
    welcome: message(shared_1.DEFAULT_WELCOME_CONFIG.welcome),
    dm: zod_1.z.object({ enabled: zod_1.z.boolean().default(false), message: zod_1.z.string().trim().max(2000).default(shared_1.DEFAULT_WELCOME_CONFIG.dm.message) }).default({}),
    autoRoleIds: zod_1.z.array(sf).max(10).default([]),
    goodbye: message(shared_1.DEFAULT_WELCOME_CONFIG.goodbye),
}).superRefine((c, ctx) => {
    if (c.welcome.enabled && !c.welcome.channelId)
        ctx.addIssue({ code: 'custom', path: ['welcome', 'channelId'], message: 'Wähle einen Kanal für die Willkommensnachricht.' });
    if (c.goodbye.enabled && !c.goodbye.channelId)
        ctx.addIssue({ code: 'custom', path: ['goodbye', 'channelId'], message: 'Wähle einen Kanal für die Abschiedsnachricht.' });
});
/** Willkommen & Abschied je Discord-Server (`welcome.config@<guildId>`, sonst die gemeinsame Grundeinstellung) und was beim Verlassen passiert. */
let WelcomeService = class WelcomeService {
    prisma;
    audit;
    applications;
    qualifications;
    tickets;
    media;
    log = new common_1.Logger('Welcome');
    constructor(prisma, audit, applications, qualifications, tickets, media) {
        this.prisma = prisma;
        this.audit = audit;
        this.applications = applications;
        this.qualifications = qualifications;
        this.tickets = tickets;
        this.media = media;
    }
    keyOf(guildId) { const g = (0, guild_context_1.settingsGuild)(guildId); return g ? `${KEY}@${g}` : KEY; } // Gruppe mit geteilten Einstellungen → Haupt-Server
    /** `own` = dieser Server hat eigene Einstellungen (sonst gilt die gemeinsame). */
    async config(guildId) {
        const own = guildId ? await this.prisma.systemSetting.findUnique({ where: { key: this.keyOf(guildId) } }) : null;
        const row = own ?? await this.prisma.systemSetting.findUnique({ where: { key: KEY } });
        const parsed = row ? exports.welcomeConfigSchema.safeParse(row.value) : null;
        return { ...(parsed?.success ? parsed.data : exports.welcomeConfigSchema.parse({})), own: !guildId || !!own };
    }
    async save(actor, input, guildId) {
        const key = this.keyOf(guildId);
        const value = input;
        await this.prisma.$transaction(async (tx) => {
            await tx.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
            await this.audit.record(actor, { action: 'welcome.config', module: 'settings', entityType: 'SystemSetting', entityId: key, after: value }, tx);
        });
        return this.config(guildId);
    }
    /** Eigene Einstellungen eines Servers löschen – danach gilt wieder die gemeinsame. */
    async reset(actor, guildId) {
        await this.prisma.systemSetting.deleteMany({ where: { key: this.keyOf(guildId) } });
        await this.audit.record(actor, { action: 'welcome.config.reset', module: 'settings', entityType: 'SystemSetting', entityId: this.keyOf(guildId) });
        return this.config(guildId);
    }
    /** Hochgeladener Banner für den Bot (nur Bilder, die als Willkommens-Banner hochgeladen wurden). */
    /**
     * Test-Nachricht: der Bot schickt die gespeicherte Willkommens-/Abschiedsnachricht bzw. DM so, als wärst du gerade
     * beigetreten/gegangen (mit deinem Discord-Profil) – ohne Rollen oder Aktionen beim Verlassen.
     */
    async test(actor, guildId, kind) {
        if (!guildId)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Wähle oben links zuerst einen Server.');
        const link = actor.userId ? await this.prisma.discordLink.findUnique({ where: { userId: actor.userId } }) : null;
        if (!link)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Verknüpfe zuerst dein Konto mit Discord – die Test-Nachricht nutzt dein Profil.');
        const cfg = await this.config(guildId);
        if (kind !== 'dm' && !cfg[kind].channelId)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Wähle zuerst einen Kanal für diese Nachricht.');
        if (kind === 'dm' && !cfg.dm.message.trim())
            throw new errors_1.AppError('VALIDATION_FAILED', 'Die Willkommens-DM ist leer.');
        await this.prisma.discordOutbox.create({ data: { type: 'bot.welcome-test', channelKey: 'announcements', payload: { guildId, discordId: link.discordId, kind } } });
        return { queued: true };
    }
    async banner(id) {
        const f = await this.media.welcomeBanner(id);
        return { mime: f.mime, name: f.name, data: f.data.toString('base64') };
    }
    /** Vom Bot: Mitglied hat den Server verlassen → offene Bewerbungen und Tickets nach Einstellung behandeln. Fehler eines Bereichs stoppen die anderen nicht. */
    async memberLeft(guildId, discordId) {
        const safe = (label, p, empty) => p.catch((e) => { this.log.warn(`Mitglied ausgetreten (${label}): ${e.message}`); return empty; });
        const [applications, qualifications, tickets] = await Promise.all([
            safe('applications', this.applications.memberLeft(guildId, discordId), { denied: 0, withdrawn: 0 }),
            safe('qualifications', this.qualifications.memberLeft(guildId, discordId), { denied: 0, withdrawn: 0 }),
            safe('tickets', this.tickets.memberLeft(guildId, discordId), { closed: 0 }),
        ]);
        return { applications, qualifications, tickets };
    }
};
exports.WelcomeService = WelcomeService;
exports.WelcomeService = WelcomeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, applications_service_1.ApplicationsService, qualifications_service_1.QualificationsService, tickets_service_1.SupportTicketsService, media_service_1.MediaService])
], WelcomeService);
//# sourceMappingURL=welcome.service.js.map