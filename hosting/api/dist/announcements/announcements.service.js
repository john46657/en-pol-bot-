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
exports.AnnouncementsService = exports.ANNOUNCEMENT_TEMPLATES = exports.announceConfigSchema = exports.announcementBody = exports.contentSchema = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const permission_service_1 = require("../authz/permission.service");
const notify_service_1 = require("../notifications/notify.service");
const discord_service_1 = require("../discord/discord.service");
const errors_1 = require("../common/errors");
const guild_context_1 = require("../common/guild-context");
const sf = zod_1.z.string().regex(/^\d{15,25}$/);
const https = zod_1.z.string().url().max(500).refine((u) => u.startsWith('https://'), 'Nur https-Links');
exports.contentSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(2).max(240), description: zod_1.z.string().trim().min(1).max(4000),
    color: zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(), imageUrl: https.nullish(), thumbnailUrl: https.nullish(), footer: zod_1.z.string().trim().max(200).nullish(), timestamp: zod_1.z.boolean().default(true),
    fields: zod_1.z.array(zod_1.z.object({ name: zod_1.z.string().trim().min(1).max(256), value: zod_1.z.string().trim().min(1).max(1024), inline: zod_1.z.boolean().default(false) })).max(25).default([]),
    links: zod_1.z.array(zod_1.z.object({ label: zod_1.z.string().trim().min(1).max(80), url: https })).max(5).default([]),
});
exports.announcementBody = zod_1.z.object({
    type: zod_1.z.enum(shared_1.ANNOUNCEMENT_TYPES), content: exports.contentSchema, channelId: sf,
    audience: zod_1.z.enum(['SERVER', 'ROLES', 'DEPARTMENTS']).default('SERVER'), audienceRoleIds: zod_1.z.array(sf).max(10).default([]), audienceDepartments: zod_1.z.array(zod_1.z.string().max(64)).max(10).default([]),
    mentionRoleIds: zod_1.z.array(sf).max(shared_1.MAX_MENTION_ROLES).default([]),
    scheduledAt: zod_1.z.coerce.date().nullish(), recurrence: zod_1.z.enum(shared_1.ANNOUNCEMENT_RECURRENCE).default('NONE'), templateName: zod_1.z.string().trim().max(80).nullish(),
});
exports.announceConfigSchema = zod_1.z.object({ channelIds: zod_1.z.array(sf).max(50).default([]) });
const CONFIG = 'announce.config';
/** Vorlagen je Art (Startwerte im Editor) – keine Lesebestätigung, keine Abstimmung. */
exports.ANNOUNCEMENT_TEMPLATES = shared_1.ANNOUNCEMENT_TYPES.map((t) => ({
    type: t, name: shared_1.ANNOUNCEMENT_TYPE_INFO[t].label,
    content: { title: shared_1.ANNOUNCEMENT_TYPE_INFO[t].label, description: { GENERAL: 'Liebe Kolleginnen und Kollegen,\n\n…', DIRECTIVE: '**Gültig ab:** …\n**Betrifft:** …\n\n…', TRAINING: '**Ausbildung:** …\n**Termin:** …\n**Anmeldung:** über den Kalender bzw. `/termine`', MEETING: '**Besprechung:** …\n**Zeit:** …\n**Ort:** …', MAINTENANCE: '**Zeitraum:** …\n**Betroffen:** …\n**Auswirkung:** …', SYSTEM: '**Was ist passiert:** …\n**Was ist zu tun:** …' }[t], color: shared_1.ANNOUNCEMENT_TYPE_INFO[t].color, fields: [], links: [], timestamp: true },
}));
/**
 * Ankündigungsmanager: Discord-Ankündigungen über den vorhandenen Bot (gleiche Strecke wie der Embed Builder: `message.post`).
 * Erwähnungen nur ausgewählter Rollen (Recht announce.mention, max. 3), nie @everyone/@here. Zurückgezogene bleiben erhalten
 * (Nachricht wird in Discord als zurückgezogen markiert). Planen und Wiederholen genau einmal je Termin (Versandhistorie mit Zeitpunkt).
 */
let AnnouncementsService = class AnnouncementsService {
    prisma;
    audit;
    perms;
    notify;
    discord;
    constructor(prisma, audit, perms, notify, discord) {
        this.prisma = prisma;
        this.audit = audit;
        this.perms = perms;
        this.notify = notify;
        this.discord = discord;
    }
    async config() { const r = exports.announceConfigSchema.safeParse((await this.prisma.systemSetting.findUnique({ where: { key: CONFIG } }))?.value ?? {}); return r.success ? r.data : { channelIds: [] }; }
    async saveConfig(actor, c) {
        await this.prisma.$transaction(async (tx) => {
            await tx.systemSetting.upsert({ where: { key: CONFIG }, create: { key: CONFIG, value: c }, update: { value: c } });
            await this.audit.record(actor, { action: 'announce.config', module: 'announce', entityType: 'SystemSetting', entityId: CONFIG, after: c }, tx);
        });
        return this.config();
    }
    async check(actor, d) {
        const cfg = await this.config();
        if (cfg.channelIds.length && !cfg.channelIds.includes(d.channelId))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Dieser Kanal ist für Ankündigungen nicht freigegeben (Einstellungen der Ankündigungen).');
        if (d.mentionRoleIds.length && !(await this.perms.has(actor.userId, 'announce.mention')))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Rollen erwähnen darf nur, wer „announce.mention“ hat.');
        if (d.scheduledAt && d.scheduledAt.getTime() <= Date.now() - 60_000)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Der geplante Zeitpunkt liegt in der Vergangenheit.');
        if (d.recurrence !== 'NONE' && !d.scheduledAt)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Wiederkehrende Ankündigungen brauchen einen ersten Zeitpunkt.');
    }
    preview(d) { return (0, shared_1.announcementMessage)(d.type, d.content, d.mentionRoleIds); }
    view(a) {
        return { ...a, typeLabel: shared_1.ANNOUNCEMENT_TYPE_INFO[a.type]?.label ?? a.type, deliveries: a.deliveries ?? undefined };
    }
    async list(f) {
        const rows = await this.prisma.announcement.findMany({ where: f.status ? { status: f.status } : {}, orderBy: { updatedAt: 'desc' }, take: 300 });
        return rows.map((r) => this.view(r));
    }
    async load(id) {
        const a = await this.prisma.announcement.findUnique({ where: { id }, include: { deliveries: { orderBy: { createdAt: 'desc' }, take: 100 } } });
        if (!a)
            throw new errors_1.AppError('NOT_FOUND', 'Ankündigung nicht gefunden.');
        return a;
    }
    async get(id) {
        const a = await this.load(id);
        const names = new Map((await this.prisma.user.findMany({ where: { id: { in: [a.createdById, ...a.deliveries.map((d) => d.actorId).filter((x) => !!x)] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
        return { ...this.view(a), createdByName: names.get(a.createdById) ?? '—', deliveries: a.deliveries.map((d) => ({ kind: d.kind, at: d.createdAt, slot: d.slot, by: d.actorId ? names.get(d.actorId) ?? '—' : 'Automatik' })) };
    }
    async create(actor, d) {
        await this.check(actor, d);
        const a = await this.prisma.$transaction(async (tx) => {
            const x = await tx.announcement.create({ data: { type: d.type, title: d.content.title, content: d.content, channelId: d.channelId, audience: d.audience, audienceRoleIds: d.audienceRoleIds, audienceDepartments: d.audienceDepartments, mentionRoleIds: d.mentionRoleIds, scheduledAt: d.scheduledAt ?? null, recurrence: d.recurrence, templateName: d.templateName || null, createdById: actor.userId } });
            await this.audit.record(actor, { action: 'announce.create', module: 'announce', entityType: 'Announcement', entityId: x.id, after: { type: x.type, title: x.title, channelId: x.channelId } }, tx);
            return x;
        });
        return this.get(a.id);
    }
    async update(actor, id, d) {
        const a = await this.load(id);
        if (['RETRACTED'].includes(a.status))
            throw new errors_1.AppError('CONFLICT', 'Zurückgezogene Ankündigungen bleiben unverändert erhalten.');
        if (a.status === 'PUBLISHED' && a.channelId !== d.channelId)
            throw new errors_1.AppError('CONFLICT', 'Der Kanal einer veröffentlichten Ankündigung kann nicht geändert werden.');
        await this.check(actor, d);
        await this.prisma.$transaction(async (tx) => {
            const n = await tx.announcement.updateMany({ where: { id, version: d.version }, data: { type: d.type, title: d.content.title, content: d.content, channelId: d.channelId, audience: d.audience, audienceRoleIds: d.audienceRoleIds, audienceDepartments: d.audienceDepartments, mentionRoleIds: d.mentionRoleIds, ...(a.status === 'PUBLISHED' && a.recurrence === 'NONE' ? {} : { scheduledAt: d.scheduledAt ?? null, recurrence: d.recurrence }), templateName: d.templateName || null, version: { increment: 1 } } });
            if (!n.count)
                throw new errors_1.AppError('CONFLICT', 'Die Ankündigung wurde inzwischen geändert. Bitte neu laden.');
            await this.audit.record(actor, { action: 'announce.update', module: 'announce', entityType: 'Announcement', entityId: id, before: { title: a.title, content: a.content }, after: { title: d.content.title, content: d.content } }, tx);
            // veröffentlicht: dieselbe Discord-Nachricht aktualisieren (ohne erneuten Ping)
            if (a.status === 'PUBLISHED') {
                const last = await tx.announcementDelivery.findFirst({ where: { announcementId: id, kind: 'PUBLISH' }, orderBy: { createdAt: 'desc' } });
                if (last) {
                    await this.discord.postMessage(last.stateKey, a.channelId, (0, shared_1.announcementMessage)(d.type, d.content, []), { tx });
                    await tx.announcementDelivery.create({ data: { announcementId: id, kind: 'UPDATE', stateKey: last.stateKey, actorId: actor.userId } });
                }
            }
        });
        return this.get(id);
    }
    /** Jetzt veröffentlichen (Entwurf/geplant/fehlgeschlagen) bzw. planen, falls `scheduledAt` in der Zukunft liegt. */
    async publish(actor, id) {
        await this.perms.assert(actor.userId, 'announce.publish');
        const a = await this.load(id);
        if (!['DRAFT', 'SCHEDULED', 'FAILED'].includes(a.status))
            throw new errors_1.AppError('CONFLICT', 'Diese Ankündigung ist schon veröffentlicht oder zurückgezogen.');
        if (a.scheduledAt && a.scheduledAt.getTime() > Date.now()) {
            await this.prisma.$transaction(async (tx) => {
                const n = await tx.announcement.updateMany({ where: { id, status: { in: ['DRAFT', 'FAILED'] } }, data: { status: 'SCHEDULED', version: { increment: 1 } } });
                if (!n.count)
                    throw new errors_1.AppError('CONFLICT', 'Die Ankündigung ist schon geplant.');
                await this.audit.record(actor, { action: 'announce.schedule', module: 'announce', entityType: 'Announcement', entityId: id, after: { scheduledAt: a.scheduledAt, recurrence: a.recurrence } }, tx);
            });
            return this.get(id);
        }
        await this.send(actor, a, null);
        return this.get(id);
    }
    /** Senden genau einmal je Zeitpunkt (`slot`): Zeile in der Versandhistorie ist der Riegel (übersteht Neustarts, mehrere Instanzen). */
    async send(actor, a, slot) {
        const stateKey = `ann-${a.id.slice(0, 8)}-${(slot ?? new Date()).getTime().toString(36)}`;
        const sent = await this.prisma.$transaction(async (tx) => {
            if (!slot) {
                const n = await tx.announcement.updateMany({ where: { id: a.id, status: { in: ['DRAFT', 'SCHEDULED', 'FAILED'] } }, data: { status: 'PUBLISHED', publishedAt: new Date(), ...(a.recurrence === 'NONE' ? {} : { scheduledAt: (0, shared_1.nextRecurrence)(new Date(), a.recurrence) }), version: { increment: 1 } } });
                if (!n.count)
                    throw new errors_1.AppError('CONFLICT', 'Die Ankündigung wurde gerade schon veröffentlicht.');
            }
            else {
                try {
                    await tx.announcementDelivery.create({ data: { announcementId: a.id, kind: 'PUBLISH', stateKey, slot, actorId: null } });
                }
                catch (e) {
                    if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
                        return false;
                    throw e;
                }
                await tx.announcement.update({ where: { id: a.id }, data: { status: 'PUBLISHED', publishedAt: new Date(), scheduledAt: a.recurrence === 'NONE' ? a.scheduledAt : (0, shared_1.nextRecurrence)(slot, a.recurrence), version: { increment: 1 } } });
            }
            if (!slot)
                await tx.announcementDelivery.create({ data: { announcementId: a.id, kind: 'PUBLISH', stateKey, actorId: actor.userId } });
            await this.discord.postMessage(stateKey, a.channelId, (0, shared_1.announcementMessage)(a.type, a.content, a.mentionRoleIds), { tx, forceNew: true });
            await this.audit.record(actor, { action: 'announce.publish', module: 'announce', entityType: 'Announcement', entityId: a.id, after: { channelId: a.channelId, mentions: a.mentionRoleIds.length, slot } }, tx);
            return true;
        });
        if (sent)
            await this.notifyAudience(a);
    }
    /** Dashboard/MDT/Leitstelle: Hinweis an die Zielgruppe (ohne DM, ohne Inhalt außer Titel). */
    async notifyAudience(a) {
        let users;
        if (a.audience === 'DEPARTMENTS' && a.audienceDepartments.length)
            users = (await this.prisma.personnel.findMany({ where: { team: { in: a.audienceDepartments } }, select: { userId: true } })).map((p) => p.userId);
        else if (a.audience === 'ROLES' && a.audienceRoleIds.length) {
            const g = (0, guild_context_1.currentGuild)();
            users = (await this.prisma.serverMembership.findMany({ where: { status: 'MEMBER', discordRoleIds: { hasSome: a.audienceRoleIds }, ...(g ? { server: { guildId: g } } : {}) }, select: { userId: true } })).map((m) => m.userId);
        }
        else
            users = await this.notify.usersWith('dashboard.view');
        await this.notify.emit('announcement.new', users, { title: `📣 ${shared_1.ANNOUNCEMENT_TYPE_INFO[a.type]?.emoji ?? ''} ${a.title}`, link: `/announcements?id=${a.id}`, entityType: 'Announcement', entityId: a.id, dedupeKey: `${a.id}:${a.publishedAt?.getTime() ?? Date.now()}`, dm: false });
    }
    /** Zurückziehen: bleibt in der Historie; die Discord-Nachricht(en) werden als zurückgezogen markiert (kein Löschen, kein Ping). */
    async retract(actor, id, reason) {
        await this.perms.assert(actor.userId, 'announce.publish');
        const a = await this.load(id);
        if (a.status === 'RETRACTED')
            throw new errors_1.AppError('CONFLICT', 'Schon zurückgezogen.');
        await this.prisma.$transaction(async (tx) => {
            const n = await tx.announcement.updateMany({ where: { id, status: { not: 'RETRACTED' } }, data: { status: 'RETRACTED', retractedAt: new Date(), retractReason: reason, version: { increment: 1 } } });
            if (!n.count)
                throw new errors_1.AppError('CONFLICT', 'Schon zurückgezogen.');
            for (const d of a.deliveries.filter((x) => x.kind === 'PUBLISH')) {
                await this.discord.postMessage(d.stateKey, a.channelId, (0, shared_1.announcementMessage)(a.type, a.content, [], { retracted: true }), { tx });
                await tx.announcementDelivery.create({ data: { announcementId: id, kind: 'RETRACT', stateKey: d.stateKey, actorId: actor.userId } });
            }
            await this.audit.record(actor, { action: 'announce.retract', module: 'announce', entityType: 'Announcement', entityId: id, reason }, tx);
        });
        return this.get(id);
    }
    /** Jede Minute: geplante und wiederkehrende Ankündigungen veröffentlichen (je Zeitpunkt genau einmal). */
    async tick(now = new Date()) {
        const due = await this.prisma.announcement.findMany({ where: { scheduledAt: { lte: now }, OR: [{ status: 'SCHEDULED' }, { status: 'PUBLISHED', recurrence: { not: 'NONE' } }] }, take: 50 });
        let published = 0;
        for (const a of due) {
            try {
                await this.send({ userId: null }, a, a.scheduledAt);
                published++;
            }
            catch (e) {
                await this.prisma.announcement.updateMany({ where: { id: a.id, status: 'SCHEDULED' }, data: { status: 'FAILED' } });
                await this.notify.emitPermission('system.error', 'announce.publish', { title: `Ankündigung „${a.title}“ konnte nicht veröffentlicht werden`, body: e instanceof Error ? e.message : String(e), link: `/announcements?id=${a.id}`, dedupeKey: `ann-fail-${a.id}-${a.scheduledAt?.getTime()}` }, { guildId: null });
            }
        }
        return { published };
    }
};
exports.AnnouncementsService = AnnouncementsService;
exports.AnnouncementsService = AnnouncementsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, permission_service_1.PermissionService, notify_service_1.NotifyService, discord_service_1.DiscordService])
], AnnouncementsService);
//# sourceMappingURL=announcements.service.js.map