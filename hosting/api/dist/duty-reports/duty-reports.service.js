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
        const reviewerName = r.reviewedById ? (await this.prisma.user.findUnique({ where: { id: r.reviewedById }, select: { displayName: true } }))?.displayName ?? null : null;
        return { ...r, template: t ?? null, posted, reviewerName, canEdit: await this.canEdit(actor.userId, r, t) };
    }
    async canEdit(userId, r, t) {
        if (await this.perms.has(userId, 'dutyreports.edit_all'))
            return true;
        return r.authorId === userId && (t?.authorCanEdit ?? true);
    }
    /** Neuer Bericht – bei „ein Bericht je Zeitraum“ wird der vorhandene des Zeitraums bearbeitet. */
    /** Dienstzeit des Zeitraums aus den Dienst-Sitzungen (Pausen abgezogen) – für Felder wie „Dienstzeit“. */
    async dutyTime(userId, t, date) {
        if (t.period === 'FREE')
            return null;
        const from = (0, shared_1.periodStart)(t.period, date ? new Date(date) : new Date()), to = (0, shared_1.periodEnd)(t.period, from);
        const [sessions, tz] = await Promise.all([
            this.prisma.dutySession.findMany({ where: { userId, startedAt: { lt: to }, OR: [{ endedAt: null }, { endedAt: { gt: from } }] }, select: { status: true, startedAt: true, endedAt: true } }),
            this.prisma.systemSetting.findUnique({ where: { key: 'org.timezone' } }).then((r) => (typeof r?.value === 'string' && r.value ? r.value : 'Europe/Berlin')),
        ]);
        try {
            return (0, shared_1.dutyTimeText)(t.period, sessions, from, to, tz);
        }
        catch {
            return (0, shared_1.dutyTimeText)(t.period, sessions, from, to, 'Europe/Berlin');
        }
    }
    /** Vorbelegung fürs Formular (Dashboard und Discord): Dienstzeit-Felder automatisch. */
    async prefill(actor, templateId, date) {
        const t = await this.template(templateId);
        const fields = t.fields.filter(shared_1.isDutyTimeField);
        const text = fields.length ? await this.dutyTime(actor.userId, t, date) : null;
        return { values: text ? Object.fromEntries(fields.map((f) => [f.id, text.slice(0, f.maxLength)])) : {} };
    }
    async create(actor, d) {
        const t = await this.template(d.templateId);
        if (!t.active)
            throw new errors_1.AppError('CONFLICT', 'Diese Vorlage ist deaktiviert.');
        // leere Dienstzeit-Felder automatisch aus den Dienst-Sitzungen füllen
        const empty = t.fields.filter((f) => (0, shared_1.isDutyTimeField)(f) && !String(d.values[f.id] ?? '').trim());
        if (empty.length) {
            const text = await this.dutyTime(actor.userId, t, d.periodStart);
            if (text)
                d = { ...d, values: { ...d.values, ...Object.fromEntries(empty.map((f) => [f.id, text])) } };
        }
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
            // nachgebessert vom Verfasser → wieder „eingereicht“, damit die Leitung erneut prüft
            const back = r.status === 'RETURNED' && r.authorId === actor.userId;
            const upd = await tx.dutyReport.updateMany({ where: { id, ...(d.version ? { version: d.version } : {}) }, data: { values: clean.values, version: { increment: 1 }, editedById: actor.userId, ...(back ? { status: 'SUBMITTED' } : {}) } });
            if (!upd.count)
                throw new errors_1.AppError('CONFLICT', 'Der Bericht wurde inzwischen geändert. Bitte neu laden.');
            await this.audit.record(actor, { action: 'dutyreport.edit', module: 'dutyreports', entityType: 'DutyReport', entityId: id, before: { values: r.values }, after: { values: clean.values } }, tx);
            return tx.dutyReport.findUniqueOrThrow({ where: { id } });
        });
        await this.publish(id, false);
        return after;
    }
    /**
     * Leitung bearbeitet den Bericht: „Geprüft“ (Anmerkung optional), „Zur Nachbesserung“ (Anmerkung Pflicht) oder zurück auf „eingereicht“.
     * Ohne `decision`: zwischen geprüft und eingereicht umschalten. Der Verfasser bekommt eine Benachrichtigung (und bei Nachbesserung eine DM).
     */
    async review(actor, id, d = {}) {
        const r = await this.prisma.dutyReport.findUnique({ where: { id } });
        if (!r)
            throw new errors_1.AppError('NOT_FOUND', 'Bericht nicht gefunden.');
        if (r.authorId === actor.userId)
            throw new errors_1.AppError('CONFLICT', 'Eigene Berichte kannst du nicht prüfen.');
        const status = d.decision ?? (r.status === 'REVIEWED' ? 'SUBMITTED' : 'REVIEWED');
        const note = d.note?.trim() || null;
        if (status === 'RETURNED' && !note)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Bitte schreib dazu, was nachgebessert werden soll.');
        const after = await this.prisma.dutyReport.update({ where: { id }, data: { status, reviewedById: status === 'SUBMITTED' ? null : actor.userId, reviewedAt: status === 'SUBMITTED' ? null : new Date(), reviewNote: status === 'SUBMITTED' ? null : note } });
        await this.audit.record(actor, { action: status === 'REVIEWED' ? 'dutyreport.review' : status === 'RETURNED' ? 'dutyreport.return' : 'dutyreport.unreview', module: 'dutyreports', entityType: 'DutyReport', entityId: id, ...(note ? { reason: note } : {}) });
        if (status !== 'SUBMITTED') {
            const title = status === 'REVIEWED' ? `${r.templateName} ${r.number} wurde geprüft ✅` : `${r.templateName} ${r.number}: bitte nachbessern ↩️`;
            await this.prisma.notification.create({ data: { userId: r.authorId, type: 'REPORT_REVIEW', title, ...(note ? { body: note.slice(0, 500) } : {}), entityType: 'DutyReport', entityId: id } });
            const link = status === 'RETURNED' ? await this.prisma.discordLink.findUnique({ where: { userId: r.authorId } }) : null;
            if (link)
                await this.prisma.discordOutbox.create({ data: { type: 'bot.dm', channelKey: 'duty', payload: { discordId: link.discordId, message: { embeds: [{ title: `↩️ ${r.templateName} ${r.number} – bitte nachbessern`, description: `${note}\n\nÜber „Bearbeiten“ am Bericht (Discord oder Dashboard) kannst du ihn anpassen.`.slice(0, 4000), color: 0xf59e0b }] } } } });
        }
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
        const reviewer = r.reviewedById ? await this.prisma.discordLink.findUnique({ where: { userId: r.reviewedById } }).then(async (l) => (l ? `<@${l.discordId}>` : (await this.prisma.user.findUnique({ where: { id: r.reviewedById }, select: { displayName: true } }))?.displayName ?? null)) : null;
        const msg = (0, shared_1.reportMessage)(t, { number: r.number, period: t.period, periodStart: r.periodStart, values: r.values, authorName: r.author.displayName, authorDiscordId: link?.discordId, status: r.status, updatedAt: r.updatedAt, edited: r.version > 1, reviewerName: reviewer, reviewNote: r.reviewNote }, r.id);
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