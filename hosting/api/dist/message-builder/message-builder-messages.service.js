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
exports.MessageBuilderMessagesService = exports.loadedSchema = exports.messagesQuery = exports.editSchema = exports.renameSchema = exports.loadLinkSchema = exports.MESSAGE_LINK = void 0;
exports.restoreActions = restoreActions;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const permission_service_1 = require("../authz/permission.service");
const errors_1 = require("../common/errors");
const guild_context_1 = require("../common/guild-context");
const message_builder_service_1 = require("./message-builder.service");
const message_builder_send_service_1 = require("./message-builder-send.service");
/** Discord-Nachrichtenlink: https://discord.com/channels/<Server>/<Kanal>/<Nachricht> (auch ptb/canary/discordapp). */
exports.MESSAGE_LINK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(\d{15,25})\/(\d{15,25})\/(\d{15,25})\/?$/;
exports.loadLinkSchema = zod_1.z.object({ link: zod_1.z.string().trim().max(200).regex(exports.MESSAGE_LINK, 'Kein gültiger Discord-Nachrichtenlink (Rechtsklick auf die Nachricht → „Nachrichtenlink kopieren“).'), name: zod_1.z.string().trim().max(100).optional() });
exports.renameSchema = zod_1.z.object({ name: zod_1.z.string().trim().min(1).max(100) });
exports.editSchema = zod_1.z.object({ data: shared_1.mbDocumentDataSchema, confirm: zod_1.z.literal(true, { errorMap: () => ({ message: 'Bearbeitung bitte bestätigen.' }) }) });
exports.messagesQuery = zod_1.z.object({ page: zod_1.z.coerce.number().int().min(1).default(1), pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(25), q: zod_1.z.string().trim().max(100).optional() });
/** Antwort des Bots auf „Nachricht laden“. */
exports.loadedSchema = zod_1.z.object({
    ok: zod_1.z.boolean(),
    error: zod_1.z.string().max(500).optional(),
    /** bot = vom Bot selbst, webhook = von einem Webhook (Discord-ID), other = fremd */
    author: zod_1.z.enum(['bot', 'webhook', 'other']).optional(),
    webhookId: message_builder_service_1.sf.optional(),
    /** Kanal, in dem die Nachricht liegt; parentId, wenn das ein Thread ist */
    channelId: message_builder_service_1.sf.optional(),
    parentId: message_builder_service_1.sf.nullable().optional(),
    channelName: zod_1.z.string().max(100).optional(),
    message: zod_1.z.object({ content: zod_1.z.string().max(4000).optional(), embeds: zod_1.z.array(zod_1.z.unknown()).max(10).optional(), components: zod_1.z.array(zod_1.z.unknown()).max(10).optional() }).optional(),
});
/**
 * Gespeicherte Discord-Nachrichten des Embed Builders: Links zu gesendeten Nachrichten, per Link geladene Bot-/Webhook-Nachrichten,
 * Bearbeiten (mit Vorschau im Dashboard), Duplizieren/erneut senden (als neuer Entwurf im Dashboard).
 *
 * Rechte: `messagebuilder.edit` für eigene (von dir gesendete) Nachrichten, `messagebuilder.edit_others` für Nachrichten anderer
 * und für per Link geladene Nachrichten, deren Absender im Dashboard unbekannt ist. Bearbeiten kann ohnehin nur der Absender:
 * der Bot seine eigenen Nachrichten, ein Webhook die eigenen (Discord erzwingt das zusätzlich).
 */
let MessageBuilderMessagesService = class MessageBuilderMessagesService {
    prisma;
    audit;
    perms;
    mb;
    send;
    constructor(prisma, audit, perms, mb, send) {
        this.prisma = prisma;
        this.audit = audit;
        this.perms = perms;
        this.mb = mb;
        this.send = send;
    }
    async row(id) {
        const r = await this.prisma.messageBuilderMessage.findFirst({ where: { id, guildId: (0, message_builder_service_1.requireGuild)(), archivedAt: null } });
        if (!r)
            throw new errors_1.AppError('NOT_FOUND', 'Gespeicherte Nachricht nicht gefunden.');
        return r;
    }
    /** Darf die Person diese Nachricht bearbeiten (eigene vs. fremde)? */
    async mayEdit(actor, r) {
        const uid = actor.userId;
        if (!(await this.perms.has(uid, 'messagebuilder.edit')))
            return false;
        return r.sentById === uid || this.perms.has(uid, 'messagebuilder.edit_others');
    }
    async assertEdit(actor, r) {
        await this.perms.assert(actor.userId, 'messagebuilder.edit');
        if (r.sentById !== actor.userId)
            await this.perms.assert(actor.userId, 'messagebuilder.edit_others');
    }
    /** Ansehen: Historie, Bearbeiten oder eigene Nachricht. */
    async assertView(actor, r) {
        const uid = actor.userId;
        if (r && r.sentById === uid)
            return;
        if (await this.perms.has(uid, 'messagebuilder.history'))
            return;
        if (await this.perms.has(uid, 'messagebuilder.edit_others'))
            return;
        if (!r && (await this.perms.has(uid, 'messagebuilder.edit')))
            return; // Liste: nur eigene
        throw new errors_1.AppError('PERMISSION_DENIED', 'Dafür fehlt das Recht „Versandhistorie“ bzw. „Nachrichten anderer bearbeiten“.');
    }
    view(r, canEdit, withData = false) {
        const data = shared_1.mbDocumentDataSchema.safeParse(r.data);
        return {
            id: r.id, name: r.name, channelId: r.channelId, channelName: r.channelName, threadId: r.threadId, messageId: r.messageId, mode: r.mode, webhookId: r.webhookId,
            sendId: r.sendId, status: r.status, error: r.error, sentById: r.sentById, createdByName: r.createdByName, createdAt: r.createdAt, lastEditedAt: r.lastEditedAt,
            link: r.guildId ? `https://discord.com/channels/${r.guildId}/${r.channelId}/${r.messageId}` : null, canEdit: canEdit && r.status === 'READY' && data.success,
            foreignComponents: r.keptCustomIds.length, ...(withData ? { data: data.success ? data.data : null } : {}),
        };
    }
    async list(actor, q) {
        await this.assertView(actor);
        const uid = actor.userId;
        const all = (await this.perms.has(uid, 'messagebuilder.history')) || (await this.perms.has(uid, 'messagebuilder.edit_others'));
        const where = { guildId: (0, message_builder_service_1.requireGuild)(), archivedAt: null, ...(all ? {} : { sentById: uid }), ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { channelName: { contains: q.q, mode: 'insensitive' } }, { messageId: q.q }] } : {}) };
        const [total, rows] = await Promise.all([
            this.prisma.messageBuilderMessage.count({ where }),
            this.prisma.messageBuilderMessage.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
        ]);
        const canEdit = await this.perms.has(uid, 'messagebuilder.edit'), canOthers = await this.perms.has(uid, 'messagebuilder.edit_others');
        return { items: rows.map((r) => this.view(r, canEdit && (r.sentById === uid || canOthers))), total, page: q.page, pageSize: q.pageSize };
    }
    async get(actor, id) {
        const r = await this.row(id);
        await this.assertView(actor, r);
        return this.view(r, await this.mayEdit(actor, r), true);
    }
    async rename(actor, id, b) {
        const r = await this.row(id);
        await this.assertEdit(actor, r);
        await this.prisma.messageBuilderMessage.update({ where: { id }, data: { name: b.name } });
        return this.get(actor, id);
    }
    /** Link entfernen (archivieren) – die Discord-Nachricht selbst bleibt unverändert. */
    async remove(actor, id) {
        const r = await this.row(id);
        await this.assertEdit(actor, r);
        await this.prisma.$transaction(async (tx) => {
            await tx.messageBuilderMessage.update({ where: { id }, data: { archivedAt: new Date() } });
            await this.audit.record(actor, { action: 'messagebuilder.message_unlink', module: 'messagebuilder', entityType: 'MessageBuilderMessage', entityId: id, before: { messageId: r.messageId, name: r.name } }, tx);
        });
    }
    /** Nachricht per Link laden: der Bot holt sie ab (nur eigene Bot- oder Webhook-Nachrichten des gewählten Servers). */
    async loadByLink(actor, userName, b) {
        await this.perms.assert(actor.userId, 'messagebuilder.edit');
        const [, guildId, channelId, messageId] = exports.MESSAGE_LINK.exec(b.link);
        if (guildId !== (0, message_builder_service_1.requireGuild)())
            throw new errors_1.AppError('VALIDATION_FAILED', 'Diese Nachricht liegt auf einem anderen Discord-Server als dem gewählten.');
        // Über den Embed Builder gesendet? Dann ist der Absender bekannt (eigene Nachricht)
        const item = await this.prisma.messageBuilderSendItem.findFirst({ where: { messageId: messageId, status: 'SENT', send: { guildId } }, include: { send: true } });
        const server = await this.mb.serverInfo();
        const r = await this.prisma.$transaction(async (tx) => {
            const r = await tx.messageBuilderMessage.create({ data: {
                    guildId, name: b.name || `Nachricht ${messageId}`, channelId: channelId, channelName: server.channels.find((c) => c.id === channelId)?.name ?? server.threads.find((t) => t.id === channelId)?.name ?? null,
                    messageId: messageId, mode: 'BOT', status: 'LOADING', sentById: item?.send.createdById ?? null, createdById: actor.userId, createdByName: userName, sendId: item?.sendId ?? null, position: item?.position ?? null,
                } });
            await tx.discordOutbox.create({ data: { type: 'mb.fetch', channelKey: 'announcements', payload: { id: r.id } } });
            await this.audit.record(actor, { action: 'messagebuilder.message_load', module: 'messagebuilder', entityType: 'MessageBuilderMessage', entityId: r.id, after: { channelId, messageId } }, tx);
            return r;
        });
        return this.view(r, false);
    }
    /** Inhalt erneut aus Discord laden (z. B. nachdem jemand die Nachricht in Discord geändert hat). */
    async reload(actor, id) {
        const r = await this.row(id);
        await this.assertEdit(actor, r);
        await this.prisma.$transaction(async (tx) => {
            await tx.messageBuilderMessage.update({ where: { id }, data: { status: 'LOADING', error: null } });
            await tx.discordOutbox.create({ data: { type: 'mb.fetch', channelKey: 'announcements', payload: { id } } });
        });
        return this.get(actor, id);
    }
    /** Bearbeiten einreihen (Vorschau/Bestätigung im Dashboard). */
    async edit(actor, userName, id, b) {
        const r = await this.row(id);
        await this.assertEdit(actor, r);
        if (r.status !== 'READY')
            throw new errors_1.AppError('CONFLICT', r.status === 'LOADING' ? 'Die Nachricht wird gerade aus Discord geladen – kurz warten.' : `Die Nachricht konnte nicht geladen werden: ${r.error ?? 'unbekannter Fehler'}`);
        const busy = await this.prisma.messageBuilderSend.count({ where: { targetId: id, status: { in: ['QUEUED', 'SENDING'] } } });
        if (busy)
            throw new errors_1.AppError('CONFLICT', 'Für diese Nachricht läuft schon eine Bearbeitung – bitte warten, bis sie abgeschlossen ist.');
        const t = { id: r.id, guildId: r.guildId, channelId: r.channelId, channelName: r.channelName, threadId: r.threadId, messageId: r.messageId, mode: r.mode, webhookId: r.webhookId, keptCustomIds: r.keptCustomIds, name: r.name };
        return this.send.queueEdit(actor, userName, t, b.data);
    }
    // ───────────── Bot: Nachricht laden ─────────────
    async botTarget(id) {
        const r = await (0, guild_context_1.unscoped)(() => this.prisma.messageBuilderMessage.findUnique({ where: { id } }));
        if (!r || r.status !== 'LOADING')
            return { proceed: false };
        return { proceed: true, guildId: r.guildId, channelId: r.channelId, messageId: r.messageId };
    }
    async loaded(id, b) {
        const r = await (0, guild_context_1.unscoped)(() => this.prisma.messageBuilderMessage.findUnique({ where: { id } }));
        if (!r || r.status !== 'LOADING')
            return;
        const fail = (error) => (0, guild_context_1.unscoped)(() => this.prisma.messageBuilderMessage.update({ where: { id }, data: { status: 'FAILED', error: error.slice(0, 500) } }));
        if (!b.ok || !b.message)
            return void (await fail(b.error ?? 'Die Nachricht konnte nicht geladen werden.'));
        let mode = 'BOT', webhookId = null;
        if (b.author === 'webhook') {
            const w = await (0, guild_context_1.unscoped)(() => this.prisma.messageBuilderWebhook.findFirst({ where: { guildId: r.guildId, webhookId: b.webhookId ?? '-', archivedAt: null } }));
            if (!w)
                return void (await fail('Die Nachricht stammt von einem Webhook, der im Embed Builder nicht eingerichtet ist – sie kann nur über diesen Webhook bearbeitet werden.'));
            mode = 'WEBHOOK';
            webhookId = w.id;
        }
        else if (b.author !== 'bot') {
            return void (await fail('Diese Nachricht stammt weder vom Bot noch von einem eingerichteten Webhook – fremde Nachrichten können nicht bearbeitet werden.'));
        }
        // Komponenten früherer Embed-Builder-Versände (custom_id `mb:<Aktion>`) bekommen ihre Aktion zurück
        const ids = (0, shared_1.customIdsOf)(b.message.components ?? []);
        const actionIds = ids.filter((c) => /^mb:[0-9a-f-]{36}$/.test(c)).map((c) => c.slice(3));
        const actions = actionIds.length ? await (0, guild_context_1.unscoped)(() => this.prisma.messageBuilderAction.findMany({ where: { id: { in: actionIds }, guildId: r.guildId } })) : [];
        const json = { content: b.message.content ?? '', embeds: b.message.embeds ?? [], components: b.message.components ?? [] };
        const parsed = (0, shared_1.mbFromDiscordJson)(json, { foreignCustomIds: 'keep' });
        if (!parsed.ok)
            return void (await fail(`Die Nachricht hat einen Aufbau, den der Editor nicht darstellen kann (${parsed.error.path}: ${parsed.error.message}).`));
        const data = restoreActions(parsed.data, new Map(actions.map((a) => [`mb:${a.id}`, a.config])));
        const kept = new Set();
        for (const row of data.messages[0].rows) {
            if (row.type === 'select' && row.keepCustomId)
                kept.add(row.keepCustomId);
            if (row.type === 'buttons')
                for (const btn of row.buttons)
                    if (btn.keepCustomId)
                        kept.add(btn.keepCustomId);
        }
        const threadId = b.parentId ? (b.channelId ?? r.channelId) : null;
        await (0, guild_context_1.unscoped)(() => this.prisma.messageBuilderMessage.update({ where: { id }, data: {
                status: 'READY', error: null, mode, webhookId, data: data, keptCustomIds: [...kept], threadId,
                ...(b.channelName ? { channelName: b.channelName } : {}),
            } }));
    }
};
exports.MessageBuilderMessagesService = MessageBuilderMessagesService;
exports.MessageBuilderMessagesService = MessageBuilderMessagesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, permission_service_1.PermissionService, message_builder_service_1.MessageBuilderService, message_builder_send_service_1.MessageBuilderSendService])
], MessageBuilderMessagesService);
/** custom_ids `mb:<Aktion>` → normale Komponenten mit der damals festgelegten Aktion (beim Speichern entsteht eine neue Aktion). */
function restoreActions(d, actions) {
    return {
        ...d,
        messages: d.messages.map((m) => ({
            ...m,
            rows: m.rows.map((row) => {
                if (row.type === 'select') {
                    const a = actions.get(row.keepCustomId);
                    if (!a?.options)
                        return row;
                    return { ...row, keepCustomId: '', options: row.options.map((o) => ({ ...o, action: a.options[o.id] ?? o.action })) };
                }
                return { ...row, buttons: row.buttons.map((btn) => { const a = actions.get(btn.keepCustomId); return a?.action ? { ...btn, keepCustomId: '', action: a.action } : btn; }) };
            }),
        })),
    };
}
//# sourceMappingURL=message-builder-messages.service.js.map