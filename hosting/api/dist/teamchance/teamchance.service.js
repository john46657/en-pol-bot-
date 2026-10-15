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
exports.TeamChanceService = exports.DEFAULT_TEAMCHANCE = exports.teamChanceSchema = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const discord_service_1 = require("../discord/discord.service");
const notify_service_1 = require("../notifications/notify.service");
const errors_1 = require("../common/errors");
const guild_context_1 = require("../common/guild-context");
const sf = zod_1.z.string().regex(/^\d{15,25}$/);
exports.teamChanceSchema = zod_1.z.object({
    open: zod_1.z.boolean(),
    title: zod_1.z.string().trim().min(1).max(100),
    description: zod_1.z.string().max(2000),
    opensAt: zod_1.z.string().datetime().nullable(),
    closesAt: zod_1.z.string().datetime().nullable(),
    /** Höchstzahl Bewerbungen in dieser Team-Chance (0 = unbegrenzt) */
    slots: zod_1.z.number().int().min(0).max(10_000),
    /** Ankündigung beim Öffnen/Schließen in diesen Channel (leer = keine) */
    channelId: sf.nullable(),
    pingRoleIds: zod_1.z.array(sf).max(10),
    /** Bewerbungen nur während einer offenen Team-Chance annehmen */
    restrictApplications: zod_1.z.boolean(),
}).refine((c) => !c.opensAt || !c.closesAt || c.opensAt < c.closesAt, 'Das Ende muss nach dem Start liegen.');
exports.DEFAULT_TEAMCHANCE = { open: false, title: 'Team-Chance', description: 'Wir suchen Verstärkung für unser Team! Bewirb dich jetzt.', opensAt: null, closesAt: null, slots: 0, channelId: null, pingRoleIds: [], restrictApplications: false, openedAt: null };
const KEY = 'teamchance';
/**
 * Team-Chance: Die Leitung öffnet/schließt eine Bewerbungsphase für das Team (je Server getrennt), optional mit
 * Zeitfenster und Platzzahl. Beim Öffnen/Schließen: Ankündigung in Discord und Benachrichtigung im Dashboard.
 */
let TeamChanceService = class TeamChanceService {
    prisma;
    audit;
    discord;
    notify;
    constructor(prisma, audit, discord, notify) {
        this.prisma = prisma;
        this.audit = audit;
        this.discord = discord;
        this.notify = notify;
    }
    async config(guildId = (0, guild_context_1.currentGuild)()) {
        const own = guildId ? await this.prisma.systemSetting.findUnique({ where: { key: (0, guild_context_1.scopedKey)(KEY, guildId) } }) : null;
        const row = own ?? (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }));
        return { ...exports.DEFAULT_TEAMCHANCE, ...(row?.value ?? {}) };
    }
    /** Ist die Team-Chance gerade offen? (Schalter + Zeitfenster + freie Plätze) */
    async status(guildId = (0, guild_context_1.currentGuild)()) {
        const c = await this.config(guildId);
        const now = new Date();
        const used = c.slots && c.openedAt ? await this.prisma.application.count({ where: { createdAt: { gte: new Date(c.openedAt) }, ...(guildId ? { guildId } : {}) } }) : 0;
        const reason = !c.open ? 'closed' : c.opensAt && now < new Date(c.opensAt) ? 'not_started' : c.closesAt && now >= new Date(c.closesAt) ? 'ended' : c.slots && used >= c.slots ? 'full' : null;
        return { ...c, isOpen: !reason, reason, used, remaining: c.slots ? Math.max(0, c.slots - used) : null };
    }
    /** Für Bewerbungen: wenn eingestellt, nur während einer offenen Team-Chance. */
    async assertApplicationsAllowed(guildId) {
        const s = await this.status(guildId);
        if (s.restrictApplications && !s.isOpen) {
            throw new errors_1.AppError('CONFLICT', s.reason === 'not_started' ? `Die Team-Chance startet am ${new Date(s.opensAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}.` : s.reason === 'full' ? 'Die Team-Chance ist voll – alle Plätze sind vergeben.' : 'Bewerbungen sind nur während einer Team-Chance möglich – derzeit ist keine offen.');
        }
    }
    async save(actor, input) {
        const guildId = (0, guild_context_1.currentGuild)();
        const before = await this.config(guildId);
        const openedNow = input.open && !before.open;
        const value = { ...input, openedAt: openedNow ? new Date().toISOString() : input.open ? before.openedAt ?? new Date().toISOString() : null };
        const key = guildId ? (0, guild_context_1.scopedKey)(KEY, guildId) : KEY;
        await this.prisma.systemSetting.upsert({ where: { key }, create: { key, value: value }, update: { value: value } });
        await this.audit.record(actor, { action: openedNow ? 'teamchance.opened' : before.open && !input.open ? 'teamchance.closed' : 'teamchance.updated', module: 'teamchance', entityType: 'SystemSetting', entityId: key, before, after: value });
        if (openedNow || (before.open && !input.open)) {
            if (value.channelId)
                await this.discord.enqueue('announcements', 'teamchance.changed', { open: input.open, title: value.title, description: value.description, closesAt: value.closesAt, slots: value.slots, channelId: value.channelId, pingRoleIds: value.pingRoleIds }, { always: true });
            if (openedNow)
                await this.notify.notifyPermission('teamchance.view', { type: 'TEAMCHANCE', title: `📣 Team-Chance geöffnet: ${value.title}`, body: value.description.slice(0, 300) }, { guildId, exceptUserId: actor.userId });
        }
        return this.status(guildId);
    }
};
exports.TeamChanceService = TeamChanceService;
exports.TeamChanceService = TeamChanceService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, discord_service_1.DiscordService, notify_service_1.NotifyService])
], TeamChanceService);
//# sourceMappingURL=teamchance.service.js.map