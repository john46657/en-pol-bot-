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
exports.MessageBuilderSendService = exports.historyQuery = exports.webhookCreateSchema = exports.interactionSchema = exports.finishSchema = exports.itemResultSchema = exports.sendSchema = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const permission_service_1 = require("../authz/permission.service");
const errors_1 = require("../common/errors");
const guild_context_1 = require("../common/guild-context");
const erlc_crypto_1 = require("../cad/erlc-crypto");
const message_builder_service_1 = require("./message-builder.service");
const webhook_client_1 = require("./webhook-client");
exports.sendSchema = zod_1.z.object({
    documentId: zod_1.z.string().uuid().nullable().default(null),
    name: zod_1.z.string().trim().min(1).max(100).default('Ohne Namen'),
    data: shared_1.mbDocumentDataSchema,
    /** bot = über den vorhandenen Discord-Bot (Standard), webhook = ausdrücklich gewählter Webhook, test = nur prüfen, nichts senden */
    mode: zod_1.z.enum(['bot', 'webhook', 'test']),
    channelId: message_builder_service_1.sf.nullable().default(null),
    webhookId: zod_1.z.string().uuid().nullable().default(null),
    /** Bestätigung im Dialog („Jetzt senden“) */
    confirm: zod_1.z.literal(true, { errorMap: () => ({ message: 'Versand bitte bestätigen.' }) }),
});
exports.itemResultSchema = zod_1.z.object({ ok: zod_1.z.boolean(), messageId: message_builder_service_1.sf.optional(), error: zod_1.z.string().max(500).optional() });
exports.finishSchema = zod_1.z.object({ error: zod_1.z.string().max(500).optional() });
exports.interactionSchema = zod_1.z.object({ actionId: zod_1.z.string().uuid(), value: zod_1.z.string().max(100).optional(), guildId: message_builder_service_1.sf.nullable().default(null), discordId: message_builder_service_1.sf });
exports.webhookCreateSchema = zod_1.z.object({ name: zod_1.z.string().trim().min(1).max(60), url: zod_1.z.string().trim().max(400).regex(webhook_client_1.WEBHOOK_URL, 'Keine gültige Discord-Webhook-URL (https://discord.com/api/webhooks/<id>/<token>).') });
exports.historyQuery = zod_1.z.object({ page: zod_1.z.coerce.number().int().min(1).default(1), pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(25), status: zod_1.z.string().max(20).optional() });
const QUEUE_TIMEOUT_MS = 10 * 60_000;
const SENDING_TIMEOUT_MS = 15 * 60_000;
const ERR = (s) => (s ?? '').replace(/https?:\/\/\S*webhooks\S*/gi, '[Webhook-URL]').slice(0, 500) || null;
/** Versand der Nachrichtengruppen (Bot über die Outbox, optional Webhook, Testmodus) und Versandhistorie. */
let MessageBuilderSendService = class MessageBuilderSendService {
    prisma;
    audit;
    perms;
    mb;
    webhooks;
    log = new common_1.Logger('MessageBuilder');
    /** laufende Webhook-Versände (Tests warten darauf) */
    running = new Set();
    constructor(prisma, audit, perms, mb, webhooks) {
        this.prisma = prisma;
        this.audit = audit;
        this.perms = perms;
        this.mb = mb;
        this.webhooks = webhooks;
    }
    // ───────────── Versand ─────────────
    async send(actor, userName, b) {
        const uid = actor.userId;
        if (b.mode === 'test')
            await this.perms.assert(uid, 'messagebuilder.create');
        else
            await this.perms.assert(uid, 'messagebuilder.send');
        if (b.mode === 'webhook')
            await this.perms.assert(uid, 'messagebuilder.webhooks');
        const guildId = (0, message_builder_service_1.requireGuild)();
        if (b.documentId)
            await this.mb.get(actor, b.documentId); // eigener Entwurf bzw. Vorlage dieses Servers (sonst 404)
        const server = await this.mb.serverInfo();
        const issues = (0, shared_1.validateMbDocument)(b.data, { target: b.mode === 'webhook' ? 'webhook' : 'bot', allowRoleActions: await this.perms.has(uid, 'messagebuilder.roles'), ...(server.guild ? { roleIds: server.roles.map((r) => r.id) } : {}) });
        if ((0, shared_1.hasErrors)(issues))
            throw new errors_1.AppError('VALIDATION_FAILED', `Die Nachrichten sind so nicht sendbar: ${issues.find((i) => i.level === 'error').where} – ${issues.find((i) => i.level === 'error').message}`, { issues });
        let channelId = b.channelId, channelName = null, webhook = null;
        if (b.mode === 'webhook') {
            if (!b.webhookId)
                throw new errors_1.AppError('VALIDATION_FAILED', 'Webhook wählen.');
            const w = await this.prisma.messageBuilderWebhook.findFirst({ where: { id: b.webhookId, guildId, archivedAt: null } });
            if (!w)
                throw new errors_1.AppError('NOT_FOUND', 'Webhook nicht gefunden.');
            const url = (0, erlc_crypto_1.decryptSecret)(w.secret);
            if (!url)
                throw new errors_1.AppError('VALIDATION_FAILED', 'Die Webhook-URL lässt sich nicht mehr entschlüsseln (Schlüssel geändert?) – Webhook neu anlegen.');
            webhook = { id: w.id, url };
            channelId = w.channelId;
            channelName = server.channels.find((c) => c.id === w.channelId)?.name ?? null;
        }
        else {
            if (!channelId)
                throw new errors_1.AppError('VALIDATION_FAILED', 'Kanal wählen.');
            if (!server.guild)
                throw new errors_1.AppError('CAPABILITY_UNAVAILABLE', 'Die Kanäle dieses Discord-Servers sind noch nicht bekannt – ist der Bot dort und läuft er?');
            const ch = server.channels.find((c) => c.id === channelId);
            if (!ch)
                throw new errors_1.AppError('VALIDATION_FAILED', 'Diesen Textkanal gibt es auf diesem Discord-Server nicht.');
            if (!ch.allowed)
                throw new errors_1.AppError('PERMISSION_DENIED', `In #${ch.name} darf über den Message Builder nicht gesendet werden (erlaubte Kanäle festgelegt).`);
            if (ch.bot) {
                const miss = (0, shared_1.missingBotPerms)(ch.bot, b.data);
                if (miss.length)
                    throw new errors_1.AppError('VALIDATION_FAILED', `Dem Bot fehlen in #${ch.name} Rechte: ${miss.join(', ')}.`, { missing: miss });
            }
            channelName = ch.name;
        }
        const sendId = (0, node_crypto_1.randomUUID)();
        const now = new Date();
        // Aktionen interaktiver Komponenten festschreiben (custom_id `mb:<aktion>`) – nur bei echtem Versand über den Bot
        const actions = [];
        const items = b.data.messages.map((m, position) => {
            const ids = new Map();
            for (const c of (0, shared_1.interactiveComponents)(m)) {
                const id = b.mode === 'bot' ? (0, node_crypto_1.randomUUID)() : `test-${c.componentId}`.slice(0, 36);
                ids.set(c.componentId, `mb:${id}`);
                if (b.mode === 'bot')
                    actions.push({ id, kind: c.kind, config: c.kind === 'button' ? { action: c.action } : { options: c.options } });
            }
            const payload = (0, shared_1.toDiscordPayload)(m, { now, customIdOf: (cid) => ids.get(cid) });
            return { position, summary: (0, shared_1.mbSummary)(m), payload };
        });
        const test = b.mode === 'test';
        await this.prisma.$transaction(async (tx) => {
            await tx.messageBuilderSend.create({ data: {
                    id: sendId, guildId, documentId: b.documentId, documentName: b.name, mode: b.mode.toUpperCase(), channelId, channelName, webhookId: webhook?.id ?? null,
                    status: test ? 'TEST' : 'QUEUED', createdById: uid, createdByName: userName, ...(test ? { startedAt: now, finishedAt: now } : {}),
                    items: { create: items.map((i) => ({ position: i.position, summary: i.summary, status: test ? 'TEST' : 'PENDING', payload: test ? client_1.Prisma.DbNull : i.payload })) },
                } });
            if (actions.length)
                await tx.messageBuilderAction.createMany({ data: actions.map((a) => ({ id: a.id, guildId, sendId, kind: a.kind, config: a.config, createdById: uid })) });
            if (b.mode === 'bot')
                await tx.discordOutbox.create({ data: { type: 'mb.send', channelKey: 'announcements', payload: { sendId } } });
            await this.audit.record(actor, { action: test ? 'messagebuilder.test' : 'messagebuilder.send', module: 'messagebuilder', entityType: 'MessageBuilderSend', entityId: sendId, after: { mode: b.mode, channelId, messages: items.length, document: b.name } }, tx);
        });
        if (webhook)
            this.track(this.runWebhook(sendId, webhook.url, b.data, items.map((i) => i.payload)));
        return { ...(await this.get(actor, sendId)), warnings: issues.filter((i) => i.level === 'warning'), ...(test ? { payloads: items.map((i) => i.payload) } : {}) };
    }
    track(p) { this.running.add(p); void p.finally(() => this.running.delete(p)); }
    async waitIdle() { await Promise.all([...this.running]); }
    /** Webhook-Versand: Nachricht für Nachricht; bei einem Fehler werden die restlichen nicht gesendet (Reihenfolge bleibt erhalten). */
    async runWebhook(sendId, url, data, payloads) {
        try {
            await this.prisma.messageBuilderSend.update({ where: { id: sendId }, data: { status: 'SENDING', startedAt: new Date() } });
            const profile = { ...(data.webhookProfile.username.trim() ? { username: data.webhookProfile.username.trim() } : {}), ...(data.webhookProfile.avatarUrl ? { avatar_url: data.webhookProfile.avatarUrl } : {}) };
            let failed = null;
            for (const [position, p] of payloads.entries()) {
                try {
                    const r = await this.webhooks.execute(url, { ...p, ...profile });
                    await this.itemResult(sendId, position, { ok: true, ...(r.messageId ? { messageId: r.messageId } : {}) });
                }
                catch (e) {
                    failed = e instanceof webhook_client_1.DiscordHttpError ? e.message : 'Unbekannter Fehler beim Webhook-Versand.';
                    await this.itemResult(sendId, position, { ok: false, error: failed });
                    break;
                }
            }
            await this.finish(sendId, failed ? { error: 'Nicht gesendet, weil eine vorherige Nachricht fehlschlug.' } : {});
        }
        catch (e) {
            this.log.error(`webhook send ${sendId} failed: ${e instanceof Error ? e.message : e}`);
            await this.finish(sendId, { error: 'Interner Fehler beim Webhook-Versand.' }).catch(() => undefined);
        }
    }
    // ───────────── Rückmeldungen des Bots ─────────────
    /** Bot holt den Auftrag ab: nur einmal (QUEUED → SENDING), sonst wird nichts gesendet (kein doppelter Versand). */
    async start(sendId) {
        const r = await this.prisma.messageBuilderSend.updateMany({ where: { id: sendId, status: 'QUEUED', mode: 'BOT' }, data: { status: 'SENDING', startedAt: new Date() } });
        if (!r.count)
            return { proceed: false };
        const s = await this.prisma.messageBuilderSend.findUniqueOrThrow({ where: { id: sendId }, include: { items: { orderBy: { position: 'asc' } } } });
        return { proceed: true, guildId: s.guildId, channelId: s.channelId, items: s.items.map((i) => ({ position: i.position, payload: i.payload })) };
    }
    async itemResult(sendId, position, b) {
        await this.prisma.messageBuilderSendItem.updateMany({
            where: { sendId, position, status: 'PENDING' },
            data: b.ok ? { status: 'SENT', messageId: b.messageId ?? null, sentAt: new Date(), error: null, payload: client_1.Prisma.DbNull } : { status: 'FAILED', error: ERR(b.error) ?? 'Unbekannter Fehler.', payload: client_1.Prisma.DbNull },
        });
    }
    /** Abschluss: nicht gesendete Nachrichten → übersprungen; Gesamtstatus aus den Einzelstatus (nie „gesendet“, wenn etwas fehlte). */
    async finish(sendId, b) {
        await this.prisma.messageBuilderSendItem.updateMany({ where: { sendId, status: 'PENDING' }, data: { status: 'SKIPPED', error: ERR(b.error) ?? 'Nicht gesendet.', payload: client_1.Prisma.DbNull } });
        const items = await this.prisma.messageBuilderSendItem.findMany({ where: { sendId }, select: { status: true, error: true } });
        const sent = items.filter((i) => i.status === 'SENT').length;
        const status = items.length && sent === items.length ? 'SENT' : sent ? 'PARTIAL' : 'FAILED';
        const firstError = items.find((i) => i.status === 'FAILED')?.error ?? (status === 'SENT' ? null : ERR(b.error));
        await this.prisma.messageBuilderSend.updateMany({ where: { id: sendId, status: { in: ['QUEUED', 'SENDING'] } }, data: { status, error: firstError, finishedAt: new Date() } });
    }
    /** Aufträge, die der Bot nie abgeholt bzw. nie abgeschlossen hat, ehrlich als fehlgeschlagen markieren. */
    async expireStale(now = Date.now()) {
        const queued = await this.prisma.messageBuilderSend.findMany({ where: { status: 'QUEUED', mode: 'BOT', createdAt: { lt: new Date(now - QUEUE_TIMEOUT_MS) } }, select: { id: true } });
        for (const { id } of queued) {
            const r = await this.prisma.messageBuilderSend.updateMany({ where: { id, status: 'QUEUED' }, data: { status: 'FAILED', error: 'Der Bot hat den Auftrag nicht innerhalb von 10 Minuten abgeholt (Bot offline?). Es wurde nichts gesendet.', finishedAt: new Date(now) } });
            if (!r.count)
                continue; // inzwischen abgeholt
            await this.prisma.messageBuilderSendItem.updateMany({ where: { sendId: id, status: 'PENDING' }, data: { status: 'SKIPPED', error: 'Nicht gesendet (Bot hat den Auftrag nicht abgeholt).', payload: client_1.Prisma.DbNull } });
            await this.prisma.discordOutbox.updateMany({ where: { type: 'mb.send', sentAt: null, payload: { path: ['sendId'], equals: id } }, data: { sentAt: new Date(now), lastError: 'abgelaufen' } });
        }
        const stuck = await this.prisma.messageBuilderSend.findMany({ where: { status: 'SENDING', startedAt: { lt: new Date(now - SENDING_TIMEOUT_MS) } }, select: { id: true } });
        for (const { id } of stuck) {
            await this.prisma.messageBuilderSendItem.updateMany({ where: { sendId: id, status: 'PENDING' }, data: { status: 'FAILED', error: 'Keine Rückmeldung vom Versand – ob diese Nachricht in Discord angekommen ist, ist unbekannt. Bitte im Kanal prüfen.', payload: client_1.Prisma.DbNull } });
            await this.finish(id, {});
        }
    }
    // ───────────── Historie ─────────────
    view(s) {
        return {
            id: s.id, documentId: s.documentId, documentName: s.documentName, mode: s.mode, channelId: s.channelId, channelName: s.channelName, webhookId: s.webhookId,
            status: s.status, error: s.error, createdById: s.createdById, createdByName: s.createdByName, createdAt: s.createdAt, startedAt: s.startedAt, finishedAt: s.finishedAt,
            items: s.items.sort((a, b) => a.position - b.position).map((i) => ({ position: i.position, summary: i.summary, status: i.status, messageId: i.messageId, error: i.error, sentAt: i.sentAt })),
        };
    }
    /** Einzelner Versand: wer gesendet hat, sieht den Status immer; sonst Recht „Versandhistorie“. */
    async get(actor, id) {
        await this.expireStale();
        const s = await this.prisma.messageBuilderSend.findFirst({ where: { id, guildId: (0, message_builder_service_1.requireGuild)() }, include: { items: true } });
        if (!s)
            throw new errors_1.AppError('NOT_FOUND', 'Versand nicht gefunden.');
        if (s.createdById !== actor.userId)
            await this.perms.assert(actor.userId, 'messagebuilder.history');
        return { ...this.view(s), guildId: s.guildId };
    }
    async history(q) {
        await this.expireStale();
        const guildId = (0, message_builder_service_1.requireGuild)();
        const where = { guildId, ...(q.status ? { status: q.status } : {}) };
        const [total, rows] = await Promise.all([
            this.prisma.messageBuilderSend.count({ where }),
            this.prisma.messageBuilderSend.findMany({ where, include: { items: true }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
        ]);
        return { items: rows.map((r) => this.view(r)), total, page: q.page, pageSize: q.pageSize, guildId };
    }
    // ───────────── Interaktive Komponenten (Bot fragt beim Klick nach) ─────────────
    async interaction(b) {
        // Buttons/Menüs wirken nur auf dem Server, für den sie gesendet wurden (kopierte Nachricht auf anderem Server → „gone“)
        const a = await (0, guild_context_1.unscoped)(() => this.prisma.messageBuilderAction.findUnique({ where: { id: b.actionId } }));
        if (!a || !b.guildId || a.guildId !== b.guildId)
            return { type: 'gone' };
        const cfg = a.config;
        const action = a.kind === 'select' ? cfg.options?.[b.value ?? ''] : cfg.action;
        if (!action)
            return { type: 'gone' };
        if (action.type === 'role') {
            const server = await this.mb.serverInfo(b.guildId);
            if (!server.guild || !server.roles.some((r) => r.id === action.roleId))
                return { type: 'gone' };
        }
        return action;
    }
    // ───────────── Webhooks (optional) ─────────────
    async listWebhooks() {
        const server = await this.mb.serverInfo();
        const rows = await this.prisma.messageBuilderWebhook.findMany({ where: { guildId: (0, message_builder_service_1.requireGuild)(), archivedAt: null }, orderBy: { name: 'asc' } });
        // Die URL (enthält das Token) verlässt die API nie
        return rows.map((w) => ({ id: w.id, name: w.name, webhookId: w.webhookId, channelId: w.channelId, channelName: server.channels.find((c) => c.id === w.channelId)?.name ?? null, readable: (0, erlc_crypto_1.decryptSecret)(w.secret) !== null, createdAt: w.createdAt }));
    }
    async createWebhook(actor, b) {
        const home = (0, message_builder_service_1.requireGuild)();
        let info;
        try {
            info = await this.webhooks.info(b.url);
        }
        catch (e) {
            throw new errors_1.AppError('VALIDATION_FAILED', `Webhook konnte nicht geprüft werden: ${e instanceof webhook_client_1.DiscordHttpError ? e.message : 'unbekannter Fehler'}`);
        }
        if (info.guildId !== home)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Dieser Webhook gehört zu einem anderen Discord-Server als dem gewählten.');
        const w = await this.prisma.$transaction(async (tx) => {
            const w = await tx.messageBuilderWebhook.create({ data: { name: b.name, secret: (0, erlc_crypto_1.encryptSecret)(b.url), webhookId: info.id, channelId: info.channelId, guildId: info.guildId, createdById: actor.userId } });
            await this.audit.record(actor, { action: 'messagebuilder.webhook_create', module: 'messagebuilder', entityType: 'MessageBuilderWebhook', entityId: w.id, after: { name: w.name, webhookId: info.id, channelId: info.channelId } }, tx);
            return w;
        });
        return (await this.listWebhooks()).find((x) => x.id === w.id);
    }
    async removeWebhook(actor, id) {
        const w = await this.prisma.messageBuilderWebhook.findFirst({ where: { id, guildId: (0, message_builder_service_1.requireGuild)(), archivedAt: null } });
        if (!w)
            throw new errors_1.AppError('NOT_FOUND', 'Webhook nicht gefunden.');
        await this.prisma.$transaction(async (tx) => {
            // Das Geheimnis wird beim Entfernen gelöscht – es soll nicht unnötig gespeichert bleiben
            await tx.messageBuilderWebhook.update({ where: { id }, data: { archivedAt: new Date(), secret: '' } });
            await this.audit.record(actor, { action: 'messagebuilder.webhook_delete', module: 'messagebuilder', entityType: 'MessageBuilderWebhook', entityId: id, before: { name: w.name } }, tx);
        });
    }
};
exports.MessageBuilderSendService = MessageBuilderSendService;
exports.MessageBuilderSendService = MessageBuilderSendService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, permission_service_1.PermissionService, message_builder_service_1.MessageBuilderService, webhook_client_1.WebhookClient])
], MessageBuilderSendService);
//# sourceMappingURL=message-builder-send.service.js.map