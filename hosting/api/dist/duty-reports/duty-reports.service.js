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
exports.DutyReportsService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const permission_service_1 = require("../authz/permission.service");
const discord_service_1 = require("../discord/discord.service");
const errors_1 = require("../common/errors");
const json_store_1 = require("../common/json-store");
const numbering_1 = require("../common/numbering");
/** Tages-/Wochenberichte: Vorlagen mit eigenen Feldern; ausfüllen, ansehen und bearbeiten im Dashboard und in Discord. */
let DutyReportsService = class DutyReportsService {
    prisma;
    audit;
    perms;
    discord;
    templates;
    constructor(prisma, audit, perms, discord) {
        this.prisma = prisma;
        this.audit = audit;
        this.perms = perms;
        this.discord = discord;
        this.templates = new json_store_1.JsonListStore(prisma, 'dutyReports.templates', shared_1.reportTemplateSchema, 50);
    }
    // ---------------- Vorlagen ----------------
    async listTemplates(guildId, onlyActive = false) {
        return (await this.templates.all()).filter((t) => (!guildId || !t.guildId || t.guildId === guildId) && (!onlyActive || t.active));
    }
    async saveTemplate(actor, t) {
        const doc = shared_1.reportTemplateSchema.parse(t);
        const ids = doc.fields.map((f) => f.id);
        if (new Set(ids).size !== ids.length)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Jedes Feld braucht ein eigenes Kürzel.');
        const [d, old] = await this.templates.upsert(doc);
        await this.audit.record(actor, { action: old ? 'dutyreport.template.update' : 'dutyreport.template.create', module: 'dutyreports', entityType: 'ReportTemplate', entityId: d.id, before: old ? { name: old.name, fields: old.fields.length } : undefined, after: { name: d.name, fields: d.fields.length } });
        return d;
    }
    async duplicateTemplate(actor, id) {
        const t = await this.templates.get(id);
        if (!t)
            throw new errors_1.AppError('NOT_FOUND', 'Vorlage nicht gefunden.');
        return this.saveTemplate(actor, { ...t, id: (0, node_crypto_1.randomUUID)(), name: `${t.name} (Kopie)`.slice(0, 60) });
    }
    async removeTemplate(actor, id) {
        if (!(await this.templates.remove(id)))
            throw new errors_1.AppError('NOT_FOUND', 'Vorlage nicht gefunden.');
        await this.audit.record(actor, { action: 'dutyreport.template.delete', module: 'dutyreports', entityType: 'ReportTemplate', entityId: id });
    }
    async template(id) {
        const t = await this.templates.get(id);
        if (!t)
            throw new errors_1.AppError('NOT_FOUND', 'Vorlage nicht gefunden.');
        return t;
    }
    // ---------------- Berichte ----------------
    async seeAll(userId) { return this.perms.has(userId, 'dutyreports.view_all'); }
    async list(actor, f, page = 1, pageSize = 50) {
        const all = await this.seeAll(actor.userId);
        const where = {
            ...(f.templateId ? { templateId: f.templateId } : {}),
            ...(f.status ? { status: f.status } : {}),
            ...(!all || f.mine ? { authorId: actor.userId } : f.authorId ? { authorId: f.authorId } : {}),
            ...(f.from || f.to ? { periodStart: { ...(f.from ? { gte: new Date(f.from) } : {}), ...(f.to ? { lte: new Date(f.to) } : {}) } } : {}),
            ...(f.q ? { OR: [{ number: { contains: f.q.toUpperCase() } }, { templateName: { contains: f.q, mode: 'insensitive' } }, { author: { displayName: { contains: f.q, mode: 'insensitive' } } }] } : {}),
        };
        const [items, total] = await Promise.all([
            this.prisma.dutyReport.findMany({ where, include: { author: { select: { id: true, displayName: true } } }, orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
            this.prisma.dutyReport.count({ where }),
        ]);
        return { items, total, page, pageSize, seeAll: all };
    }
    async get(actor, idOrNumber) {
        const r = await this.prisma.dutyReport.findFirst({ where: /^[0-9a-f-]{36}$/.test(idOrNumber) ? { id: idOrNumber } : { number: idOrNumber.toUpperCase() }, include: { author: { select: { id: true, displayName: true } } } });
        if (!r || (r.authorId !== actor.userId && !(await this.seeAll(actor.userId))))
            throw new errors_1.AppError('NOT_FOUND', 'Bericht nicht gefunden.');
        const [t, posted] = await Promise.all([this.templates.get(r.templateId), this.discord.posted(`drep-${r.id}`)]);
        return { ...r, template: t ?? null, posted, canEdit: await this.canEdit(actor.userId, r, t) };
    }
    async canEdit(userId, r, t) {
        if (await this.perms.has(userId, 'dutyreports.edit_all'))
            return true;
        return r.authorId === userId && (t?.authorCanEdit ?? true);
    }
    /** Neuer Bericht – bei „ein Bericht je Zeitraum“ wird der vorhandene des Zeitraums bearbeitet. */
    async create(actor, d) {
        const t = await this.template(d.templateId);
        if (!t.active)
            throw new errors_1.AppError('CONFLICT', 'Diese Vorlage ist deaktiviert.');
        const clean = (0, shared_1.cleanReportValues)(t, d.values);
        if ('error' in clean)
            throw new errors_1.AppError('VALIDATION_FAILED', clean.error);
        const start = (0, shared_1.periodStart)(t.period, d.periodStart ? new Date(d.periodStart) : new Date());
        const existing = t.onePerPeriod && t.period !== 'FREE' ? await this.prisma.dutyReport.findFirst({ where: { templateId: t.id, authorId: actor.userId, periodStart: start } }) : null;
        if (existing)
            return { ...(await this.update(actor, existing.id, { values: clean.values })), merged: true };
        const r = await this.prisma.$transaction(async (tx) => {
            const row = await tx.dutyReport.create({ data: { number: (0, numbering_1.makeNumber)(t.period === 'WEEKLY' ? 'WB' : 'TB'), templateId: t.id, templateName: t.name, period: t.period, periodStart: start, authorId: actor.userId, values: clean.values, source: d.source ?? 'WEB', guildId: d.guildId ?? null } });
            await this.audit.record(actor, { action: 'dutyreport.create', module: 'dutyreports', entityType: 'DutyReport', entityId: row.id, after: { number: row.number, template: t.name, values: clean.values } }, tx);
            return row;
        });
        await this.publish(r.id, true);
        return { ...r, merged: false };
    }
    async update(actor, id, d) {
        const r = await this.prisma.dutyReport.findUnique({ where: { id } });
        if (!r)
            throw new errors_1.AppError('NOT_FOUND', 'Bericht nicht gefunden.');
        const t = await this.templates.get(r.templateId);
        if (!(await this.canEdit(actor.userId, r, t)))
            throw new errors_1.AppError(r.authorId === actor.userId ? 'CONFLICT' : 'PERMISSION_DENIED', r.authorId === actor.userId ? 'Diese Vorlage erlaubt kein nachträgliches Bearbeiten.' : 'Dafür fehlt dir die Berechtigung.');
        // gelöschte Vorlage: Felder aus dem Bericht weiter bearbeitbar
        const clean = t ? (0, shared_1.cleanReportValues)(t, d.values) : { values: Object.fromEntries(Object.entries(d.values).map(([k, v]) => [k, String(v ?? '').slice(0, 4000)])) };
        if ('error' in clean)
            throw new errors_1.AppError('VALIDATION_FAILED', clean.error);
        const after = await this.prisma.$transaction(async (tx) => {
            const upd = await tx.dutyReport.updateMany({ where: { id, ...(d.version ? { version: d.version } : {}) }, data: { values: clean.values, version: { increment: 1 }, editedById: actor.userId } });
            if (!upd.count)
                throw new errors_1.AppError('CONFLICT', 'Der Bericht wurde inzwischen geändert. Bitte neu laden.');
            await this.audit.record(actor, { action: 'dutyreport.edit', module: 'dutyreports', entityType: 'DutyReport', entityId: id, before: { values: r.values }, after: { values: clean.values } }, tx);
            return tx.dutyReport.findUniqueOrThrow({ where: { id } });
        });
        await this.publish(id, false);
        return after;
    }
    async review(actor, id) {
        const r = await this.prisma.dutyReport.findUnique({ where: { id } });
        if (!r)
            throw new errors_1.AppError('NOT_FOUND', 'Bericht nicht gefunden.');
        if (r.authorId === actor.userId)
            throw new errors_1.AppError('CONFLICT', 'Eigene Berichte kannst du nicht prüfen.');
        const after = await this.prisma.dutyReport.update({ where: { id }, data: { status: r.status === 'REVIEWED' ? 'SUBMITTED' : 'REVIEWED', reviewedById: actor.userId, reviewedAt: new Date() } });
        await this.audit.record(actor, { action: after.status === 'REVIEWED' ? 'dutyreport.review' : 'dutyreport.unreview', module: 'dutyreports', entityType: 'DutyReport', entityId: id });
        if (after.status === 'REVIEWED')
            await this.prisma.notification.create({ data: { userId: r.authorId, type: 'REPORT_REVIEW', title: `${r.templateName} ${r.number} wurde geprüft`, entityType: 'DutyReport', entityId: id } });
        await this.publish(id, false);
        return after;
    }
    async remove(actor, id) {
        const r = await this.prisma.dutyReport.findUnique({ where: { id } });
        if (!r)
            throw new errors_1.AppError('NOT_FOUND', 'Bericht nicht gefunden.');
        await this.prisma.dutyReport.delete({ where: { id } });
        const posted = await this.discord.posted(`drep-${id}`);
        if (posted)
            await this.prisma.discordOutbox.create({ data: { type: 'bot.delete', channelKey: 'announcements', payload: posted } });
        await this.audit.record(actor, { action: 'dutyreport.delete', module: 'dutyreports', entityType: 'DutyReport', entityId: id, before: { number: r.number, values: r.values } });
    }
    /** Bericht in den Kanal der Vorlage posten bzw. die vorhandene Nachricht aktualisieren. */
    async publish(id, isNew) {
        const r = await this.prisma.dutyReport.findUnique({ where: { id }, include: { author: { select: { id: true, displayName: true } } } });
        const t = r ? await this.templates.get(r.templateId) : undefined;
        if (!r || !t?.channelId)
            return;
        const posted = await this.discord.posted(`drep-${id}`);
        if (!isNew && !posted)
            return; // nie gepostet → bei Änderungen nicht nachträglich posten
        const link = await this.prisma.discordLink.findUnique({ where: { userId: r.authorId } });
        const msg = (0, shared_1.reportMessage)(t, { number: r.number, period: t.period, periodStart: r.periodStart, values: r.values, authorName: r.author.displayName, authorDiscordId: link?.discordId, status: r.status, updatedAt: r.updatedAt, edited: r.version > 1 }, r.id);
        const ping = isNew && t.pingRoleIds.length ? { content: t.pingRoleIds.map((x) => `<@&${x}>`).join(' '), mentionRoles: t.pingRoleIds } : {};
        await this.discord.postMessage(`drep-${id}`, posted?.channelId ?? t.channelId, { ...msg, ...ping });
    }
};
exports.DutyReportsService = DutyReportsService;
exports.DutyReportsService = DutyReportsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, permission_service_1.PermissionService, discord_service_1.DiscordService])
], DutyReportsService);
//# sourceMappingURL=duty-reports.service.js.map