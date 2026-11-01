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
exports.MessageBuilderSendService = exports.historyQuery = exports.webhookUpdateSchema = exports.webhookCreateSchema = exports.interactionSchema = exports.finishSchema = exports.itemResultSchema = exports.sendSchema = void 0;
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
    /** optional: in einen bestehenden Thread bzw. Forum-Beitrag senden */
    threadId: message_builder_service_1.sf.nullable().default(null),
    /** nur Forum: Titel eines neuen Beitrags (die erste Nachricht eröffnet ihn) */
    threadName: zod_1.z.string().trim().min(1).max(100).nullable().default(null),
    /** Bestätigung im Dialog („Jetzt senden“) */
    confirm: zod_1.z.literal(true, { errorMap: () => ({ message: 'Versand bitte bestätigen.' }) }),
});
exports.itemResultSchema = zod_1.z.object({ ok: zod_1.z.boolean(), messageId: message_builder_service_1.sf.optional(), error: zod_1.z.string().max(500).optional(), /** Kanal/Thread, in dem die Nachricht liegt (z. B. neuer Forum-Beitrag) */ channelId: message_builder_service_1.sf.optional() });
exports.finishSchema = zod_1.z.object({ error: zod_1.z.string().max(500).optional() });
exports.interactionSchema = zod_1.z.object({ actionId: zod_1.z.string().uuid(), value: zod_1.z.string().max(100).optional(), values: zod_1.z.array(zod_1.z.string().max(100)).max(25).optional(), guildId: message_builder_service_1.sf.nullable().default(null), discordId: message_builder_service_1.sf });
const profileName = zod_1.z.string().trim().max(80).refine((v) => !/clyde|discord/i.test(v), 'Discord verbietet „clyde“ und „discord“ im Webhook-Namen.').nullable().default(null);
const profileAvatar = zod_1.z.string().trim().max(2048).refine((v) => !v || /^https:\/\/\S+$/.test(v), 'Profilbild: https-URL').nullable().default(null);
exports.webhookCreateSchema = zod_1.z.object({ name: zod_1.z.string().trim().min(1).max(60), url: zod_1.z.string().trim().max(400).regex(webhook_client_1.WEBHOOK_URL, 'Keine gültige Discord-Webhook-URL (https://discord.com/api/webhooks/<id>/<token>).'), username: profileName, avatarUrl: profileAvatar });
exports.webhookUpdateSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(60), username: profileName, avatarUrl: profileAvatar,
    /** zusätzlich den Namen des Webhooks in Discord ändern (Discord erlaubt das mit dem Webhook-Token) */
    discordName: zod_1.z.string().trim().min(1).max(80).refine((v) => !/clyde|discord/i.test(v), 'Discord verbietet „clyde“ und „discord“ im Webhook-Namen.').nullable().default(null),
});
exports.historyQuery = zod_1.z.object({ page: zod_1.z.coerce.number().int().min(1).default(1), pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(25), status: zod_1.z.string().max(20).optional(), kind: zod_1.z.enum(['SEND', 'EDIT']).optional() });
const QUEUE_TIMEOUT_MS = 10 * 60_000;
const SENDING_TIMEOUT_MS = 15 * 60_000;
const ERR = (s) => (s ?? '').replace(/https?:\/\/\S*webhooks\S*/gi, '[Webhook-URL]').slice(0, 500) || null;
const WEBHOOK_CDN = (id, hash) => (hash ? `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=64` : null);
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
        let templateName = null;
        if (b.documentId) {
            const doc = await this.mb.get(actor, b.documentId); // eigener Entwurf bzw. Vorlage dieses Servers (sonst 404)
            if (doc.kind === 'TEMPLATE')
                templateName = doc.name;
            else if (doc.sourceTemplateId)
                templateName = (await this.prisma.messageBuilderDocument.findFirst({ where: { id: doc.sourceTemplateId, guildId }, select: { name: true } }))?.name ?? null;
        }
        const server = await this.mb.serverInfo();
        const issues = (0, shared_1.validateMbDocument)(b.data, { target: b.mode === 'webhook' ? 'webhook' : 'bot', allowRoleActions: await this.perms.has(uid, 'messagebuilder.roles'), ...(server.guild ? { roleIds: server.roles.map((r) => r.id) } : {}) });
        if ((0, shared_1.hasErrors)(issues))
            throw new errors_1.AppError('VALIDATION_FAILED', `Die Nachrichten sind so nicht sendbar: ${issues.find((i) => i.level === 'error').where} – ${issues.find((i) => i.level === 'error').message}`, { issues });
        let channelId = b.channelId, channelName = null, webhook = null;
        let profile = b.data.webhookProfile;
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
            const wch = server.channels.find((c) => c.id === w.channelId);
            channelName = wch?.name ?? null;
            this.checkThread(server, wch?.type ?? 'text', w.channelId, b.threadId, b.threadName, wch?.name ?? 'dem Kanal des Webhooks');
            // Absenderprofil: je Nachricht gesetztes Profil, sonst Standard des Webhooks
            profile = { username: profile.username.trim() || w.username || '', avatarUrl: profile.avatarUrl || w.avatarUrl || '' };
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
                throw new errors_1.AppError('PERMISSION_DENIED', `In #${ch.name} darf über den Embed Builder nicht gesendet werden (erlaubte Kanäle festgelegt).`);
            this.checkThread(server, ch.type, ch.id, b.threadId, b.threadName, `#${ch.name}`);
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
                    threadId: b.threadId, threadName: b.threadId ? null : b.threadName, templateName, data: { ...b.data, webhookProfile: profile },
                    status: test ? 'TEST' : 'QUEUED', createdById: uid, createdByName: userName, ...(test ? { startedAt: now, finishedAt: now } : {}),
                    items: { create: items.map((i) => ({ position: i.position, summary: i.summary, status: test ? 'TEST' : 'PENDING', payload: test ? client_1.Prisma.DbNull : i.payload })) },
                } });
            if (actions.length)
                await tx.messageBuilderAction.createMany({ data: actions.map((a) => ({ id: a.id, guildId, sendId, kind: a.kind, config: a.config, createdById: uid })) });
            if (b.mode === 'bot')
                await tx.discordOutbox.create({ data: { type: 'mb.send', channelKey: 'announcements', payload: { sendId } } });
            await this.audit.record(actor, { action: test ? 'messagebuilder.test' : 'messagebuilder.send', module: 'messagebuilder', entityType: 'MessageBuilderSend', entityId: sendId, after: { mode: b.mode, channelId, threadId: b.threadId, messages: items.length, document: b.name, template: templateName } }, tx);
        });
        if (webhook)
            this.track(this.runWebhook(sendId, webhook.url, profile, items.map((i) => i.payload), { threadId: b.threadId, threadName: b.threadId ? null : b.threadName }));
        return { ...(await this.get(actor, sendId)), warnings: issues.filter((i) => i.level === 'warning'), ...(test ? { payloads: items.map((i) => i.payload) } : {}) };
    }
    track(p) { this.running.add(p); void p.finally(() => this.running.delete(p)); }
    async waitIdle() { await Promise.all([...this.running]); }
    /** Webhook-Versand: Nachricht für Nachricht; bei einem Fehler werden die restlichen nicht gesendet (Reihenfolge bleibt erhalten). */
    async runWebhook(sendId, url, webhookProfile, payloads, thread) {
        try {
            await this.prisma.messageBuilderSend.update({ where: { id: sendId }, data: { status: 'SENDING', startedAt: new Date() } });
            const profile = { ...(webhookProfile.username.trim() ? { username: webhookProfile.username.trim() } : {}), ...(webhookProfile.avatarUrl ? { avatar_url: webhookProfile.avatarUrl } : {}) };
            let failed = null;
            // Forum: die erste Nachricht eröffnet den Beitrag (thread_name), die weiteren gehen in diesen Beitrag
            let threadId = thread.threadId;
            for (const [position, p] of payloads.entries()) {
                try {
                    const first = position === 0 && !threadId && thread.threadName;
                    const r = await this.webhooks.execute(url, { ...p, ...profile, ...(first ? { thread_name: thread.threadName } : {}) }, { threadId });
                    if (first && r.channelId)
                        threadId = r.channelId;
                    await this.itemResult(sendId, position, { ok: true, ...(r.messageId ? { messageId: r.messageId } : {}), ...(threadId ? { channelId: threadId } : {}) });
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
        const target = s.kind === 'EDIT' && s.targetId ? await (0, guild_context_1.unscoped)(() => this.prisma.messageBuilderMessage.findUnique({ where: { id: s.targetId } })) : null;
        return {
            proceed: true, kind: s.kind, guildId: s.guildId, channelId: s.channelId, threadId: s.threadId, threadName: s.threadName,
            ...(target ? { messageId: target.messageId } : {}),
            items: s.items.map((i) => ({ position: i.position, payload: i.payload })),
        };
    }
    async itemResult(sendId, position, b) {
        const r = await this.prisma.messageBuilderSendItem.updateMany({
            where: { sendId, position, status: 'PENDING' },
            data: b.ok ? { status: 'SENT', messageId: b.messageId ?? null, channelId: b.channelId ?? null, sentAt: new Date(), error: null, payload: client_1.Prisma.DbNull } : { status: 'FAILED', error: ERR(b.error) ?? 'Unbekannter Fehler.', payload: client_1.Prisma.DbNull },
        });
        if (r.count && b.ok && b.messageId)
            await this.remember(sendId, position, b.messageId, b.channelId ?? null).catch((e) => this.log.warn(`could not save message link: ${e instanceof Error ? e.message : e}`));
    }
    /** Gesendete Nachricht als „gespeicherte Nachricht“ merken (Link, Inhalt) bzw. nach dem Bearbeiten aktualisieren. */
    async remember(sendId, position, messageId, landedIn) {
        const s = await (0, guild_context_1.unscoped)(() => this.prisma.messageBuilderSend.findUnique({ where: { id: sendId } }));
        if (!s || s.mode === 'TEST')
            return;
        const data = shared_1.mbDocumentDataSchema.safeParse(s.data);
        const one = data.success ? data.data.messages[position] : undefined;
        const content = one ? { messages: [one], webhookProfile: data.success ? data.data.webhookProfile : { username: '', avatarUrl: '' } } : client_1.Prisma.DbNull;
        if (s.kind === 'EDIT') {
            if (s.targetId)
                await (0, guild_context_1.unscoped)(() => this.prisma.messageBuilderMessage.update({ where: { id: s.targetId }, data: { data: content, lastEditedAt: new Date(), lastEditedById: s.createdById } }));
            return;
        }
        const n = data.success ? data.data.messages.length : 1;
        const threadId = landedIn && landedIn !== s.channelId ? landedIn : s.threadId;
        await (0, guild_context_1.unscoped)(() => this.prisma.messageBuilderMessage.create({ data: {
                guildId: s.guildId, name: `${s.documentName}${n > 1 ? ` (${position + 1}/${n})` : ''}`.slice(0, 100), channelId: threadId ?? s.channelId ?? '', channelName: s.channelName, threadId,
                messageId, mode: s.mode, webhookId: s.webhookId, sendId, position, data: content, sentById: s.createdById, createdById: s.createdById, createdByName: s.createdByName,
            } }));
    }
    /** Thread/Forum-Angaben prüfen (soweit der Bot Threads gemeldet hat; unbekannte Thread-IDs prüft der Bot beim Senden). */
    checkThread(server, type, channelId, threadId, threadName, label) {
        if (threadId && threadName)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Entweder einen bestehenden Thread wählen oder einen neuen Forum-Beitrag benennen – nicht beides.');
        if (type === 'forum' && !threadId && !threadName)
            throw new errors_1.AppError('VALIDATION_FAILED', `${label} ist ein Forum: bestehenden Beitrag wählen oder einen Titel für einen neuen Beitrag angeben.`);
        if (type !== 'forum' && threadName)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Einen neuen Beitrag mit Titel gibt es nur in Forum-Kanälen – für Textkanäle einen bestehenden Thread wählen.');
        if (threadId) {
            const t = server.threads.find((x) => x.id === threadId);
            if (t && t.parentId !== channelId)
                throw new errors_1.AppError('VALIDATION_FAILED', `Dieser Thread gehört nicht zu ${label}.`);
        }
    }
    // ───────────── Bestehende Discord-Nachricht bearbeiten ─────────────
    /**
     * Bearbeitung einer gespeicherten Nachricht einreihen: über den Bot (Outbox, der Bot bearbeitet nur eigene Nachrichten)
     * bzw. direkt über den Webhook, der sie gesendet hat. Rechte prüft der Aufrufer (MessageBuilderMessagesService).
     */
    async queueEdit(actor, userName, t, data) {
        const uid = actor.userId;
        const guildId = (0, message_builder_service_1.requireGuild)();
        const server = await this.mb.serverInfo();
        const target = t.mode === 'WEBHOOK' ? 'webhook' : 'bot';
        const issues = (0, shared_1.validateMbDocument)(data, { target, keptCustomIds: t.keptCustomIds, allowRoleActions: await this.perms.has(uid, 'messagebuilder.roles'), ...(server.guild ? { roleIds: server.roles.map((r) => r.id) } : {}) });
        if (data.messages.length !== 1)
            issues.push({ level: 'error', where: 'Nachricht', path: ['messages'], message: 'Beim Bearbeiten genau eine Nachricht.' });
        if ((0, shared_1.hasErrors)(issues))
            throw new errors_1.AppError('VALIDATION_FAILED', `So nicht speicherbar: ${issues.find((i) => i.level === 'error').where} – ${issues.find((i) => i.level === 'error').message}`, { issues });
        let url = null;
        if (t.mode === 'WEBHOOK') {
            const w = t.webhookId ? await this.prisma.messageBuilderWebhook.findFirst({ where: { id: t.webhookId, guildId, archivedAt: null } }) : null;
            url = w ? (0, erlc_crypto_1.decryptSecret)(w.secret) : null;
            if (!url)
                throw new errors_1.AppError('VALIDATION_FAILED', 'Der Webhook, der diese Nachricht gesendet hat, ist nicht (mehr) eingerichtet – Bearbeiten ist nur über diesen Webhook möglich.');
        }
        const m = data.messages[0];
        const sendId = (0, node_crypto_1.randomUUID)();
        const actions = [];
        const ids = new Map();
        if (t.mode === 'BOT')
            for (const c of (0, shared_1.interactiveComponents)(m)) {
                const id = (0, node_crypto_1.randomUUID)();
                ids.set(c.componentId, `mb:${id}`);
                actions.push({ id, kind: c.kind, config: c.kind === 'button' ? { action: c.action } : { options: c.options } });
            }
        const payload = (0, shared_1.toDiscordPayload)(m, { customIdOf: (cid) => ids.get(cid) });
        await this.prisma.$transaction(async (tx) => {
            await tx.messageBuilderSend.create({ data: {
                    id: sendId, guildId, kind: 'EDIT', targetId: t.id, documentId: null, documentName: t.name, mode: t.mode, channelId: t.channelId, channelName: t.channelName, webhookId: t.webhookId,
                    threadId: t.threadId, data: data, status: 'QUEUED', createdById: uid, createdByName: userName,
                    items: { create: [{ position: 0, summary: (0, shared_1.mbSummary)(m), status: 'PENDING', payload: payload }] },
                } });
            if (actions.length)
                await tx.messageBuilderAction.createMany({ data: actions.map((a) => ({ id: a.id, guildId, sendId, kind: a.kind, config: a.config, createdById: uid })) });
            if (t.mode === 'BOT')
                await tx.discordOutbox.create({ data: { type: 'mb.send', channelKey: 'announcements', payload: { sendId } } });
            await this.audit.record(actor, { action: 'messagebuilder.edit', module: 'messagebuilder', entityType: 'MessageBuilderMessage', entityId: t.id, after: { messageId: t.messageId, channelId: t.channelId, mode: t.mode } }, tx);
        });
        if (url)
            this.track(this.runWebhookEdit(sendId, url, t, payload, data.webhookProfile));
        return { ...(await this.get(actor, sendId)), warnings: issues.filter((i) => i.level === 'warning') };
    }
    async runWebhookEdit(sendId, url, t, p, _profile) {
        try {
            await this.prisma.messageBuilderSend.update({ where: { id: sendId }, data: { status: 'SENDING', startedAt: new Date() } });
            try {
                // Name/Profilbild lassen sich bei bestehenden Webhook-Nachrichten in Discord nicht ändern
                const r = await this.webhooks.edit(url, t.messageId, { ...p }, t.threadId);
                await this.itemResult(sendId, 0, { ok: true, messageId: r.messageId });
            }
            catch (e) {
                await this.itemResult(sendId, 0, { ok: false, error: e instanceof webhook_client_1.DiscordHttpError ? e.message : 'Unbekannter Fehler beim Bearbeiten.' });
            }
            await this.finish(sendId, {});
        }
        catch (e) {
            this.log.error(`webhook edit ${sendId} failed: ${e instanceof Error ? e.message : e}`);
            await this.finish(sendId, { error: 'Interner Fehler beim Bearbeiten.' }).catch(() => undefined);
        }
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
            id: s.id, kind: s.kind, documentId: s.documentId, documentName: s.documentName, templateName: s.templateName, mode: s.mode, channelId: s.channelId, channelName: s.channelName, webhookId: s.webhookId,
            threadId: s.threadId, threadName: s.threadName, targetId: s.targetId, hasData: s.data !== null,
            status: s.status, error: s.error, createdById: s.createdById, createdByName: s.createdByName, createdAt: s.createdAt, startedAt: s.startedAt, finishedAt: s.finishedAt,
            items: s.items.sort((a, b) => a.position - b.position).map((i) => ({ position: i.position, summary: i.summary, status: i.status, messageId: i.messageId, channelId: i.channelId ?? s.threadId ?? s.channelId, error: i.error, sentAt: i.sentAt })),
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
        const where = { guildId, ...(q.status ? { status: q.status } : {}), ...(q.kind ? { kind: q.kind } : {}) };
        const [total, rows] = await Promise.all([
            this.prisma.messageBuilderSend.count({ where }),
            this.prisma.messageBuilderSend.findMany({ where, include: { items: true }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
        ]);
        return { items: rows.map((r) => this.view(r)), total, page: q.page, pageSize: q.pageSize, guildId };
    }
    /** Inhalt eines früheren Versands wieder als neuen Entwurf öffnen (eigener Versand oder Recht „Versandhistorie“). */
    async toDraft(actor, id) {
        await this.perms.assert(actor.userId, 'messagebuilder.create');
        await this.get(actor, id);
        const s = await this.prisma.messageBuilderSend.findFirstOrThrow({ where: { id, guildId: (0, message_builder_service_1.requireGuild)() } });
        const p = shared_1.mbDocumentDataSchema.safeParse(s.data);
        if (!p.success)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Für diesen (älteren) Versand ist kein Inhalt gespeichert.');
        return this.mb.create(actor, { kind: 'DRAFT', name: `${s.documentName}`.slice(0, 100), categoryId: null, data: (0, shared_1.cloneWithNewIds)(p.data) });
    }
    // ───────────── Interaktive Komponenten (Bot fragt beim Klick nach) ─────────────
    async interaction(b) {
        // Buttons/Menüs wirken nur auf dem Server, für den sie gesendet wurden (kopierte Nachricht auf anderem Server → „gone“)
        const a = await (0, guild_context_1.unscoped)(() => this.prisma.messageBuilderAction.findUnique({ where: { id: b.actionId } }));
        if (!a || !b.guildId || a.guildId !== b.guildId)
            return { type: 'gone' };
        const cfg = a.config;
        const guildId = b.guildId;
        let server = null;
        const valid = async (action) => {
            if (!action)
                return false;
            if (action.type !== 'role')
                return true;
            server ??= await this.mb.serverInfo(guildId);
            return !!server.guild && server.roles.some((r) => r.id === action.roleId);
        };
        if (a.kind !== 'select')
            return (await valid(cfg.action)) ? cfg.action : { type: 'gone' };
        // Auswahlmenü: eine oder mehrere Optionen (Mindest-/Höchstanzahl); alles abgewählt → kurze Bestätigung
        const values = b.values ?? (b.value !== undefined ? [b.value] : []);
        if (!values.length)
            return { type: 'reply', text: 'Deine Auswahl wurde entfernt.' };
        const actions = [];
        for (const v of values) {
            const x = cfg.options?.[v];
            if (await valid(x))
                actions.push(x);
        }
        if (!actions.length)
            return { type: 'gone' };
        return actions.length === 1 ? actions[0] : { type: 'multi', actions };
    }
    // ───────────── Webhooks (optional) ─────────────
    async listWebhooks() {
        const server = await this.mb.serverInfo();
        const rows = await this.prisma.messageBuilderWebhook.findMany({ where: { guildId: (0, message_builder_service_1.requireGuild)(), archivedAt: null }, orderBy: { name: 'asc' } });
        // Die URL (enthält das Token) verlässt die API nie
        return rows.map((w) => ({
            id: w.id, name: w.name, webhookId: w.webhookId, channelId: w.channelId, channelName: server.channels.find((c) => c.id === w.channelId)?.name ?? null,
            channelType: server.channels.find((c) => c.id === w.channelId)?.type ?? null, readable: (0, erlc_crypto_1.decryptSecret)(w.secret) !== null, createdAt: w.createdAt,
            username: w.username, avatarUrl: w.avatarUrl, discordName: w.discordName, discordAvatarUrl: WEBHOOK_CDN(w.webhookId, w.discordAvatar),
            lastCheckAt: w.lastCheckAt, lastCheckOk: w.lastCheckOk, lastCheckError: w.lastCheckError,
        }));
    }
    async webhookRow(id) {
        const w = await this.prisma.messageBuilderWebhook.findFirst({ where: { id, guildId: (0, message_builder_service_1.requireGuild)(), archivedAt: null } });
        if (!w)
            throw new errors_1.AppError('NOT_FOUND', 'Webhook nicht gefunden.');
        return w;
    }
    /** Name/Standardprofil ändern; optional auch den Namen in Discord (geht mit dem Webhook-Token). */
    async updateWebhook(actor, id, b) {
        const w = await this.webhookRow(id);
        let discordName = w.discordName;
        if (b.discordName && b.discordName !== w.discordName) {
            const url = (0, erlc_crypto_1.decryptSecret)(w.secret);
            if (!url)
                throw new errors_1.AppError('VALIDATION_FAILED', 'Die Webhook-URL lässt sich nicht mehr entschlüsseln – Webhook neu anlegen.');
            try {
                discordName = (await this.webhooks.rename(url, b.discordName)).name;
            }
            catch (e) {
                throw new errors_1.AppError('VALIDATION_FAILED', `Discord hat die Änderung abgelehnt: ${e instanceof webhook_client_1.DiscordHttpError ? e.message : 'unbekannter Fehler'}`);
            }
        }
        await this.prisma.$transaction(async (tx) => {
            await tx.messageBuilderWebhook.update({ where: { id }, data: { name: b.name, username: b.username || null, avatarUrl: b.avatarUrl || null, discordName } });
            await this.audit.record(actor, { action: 'messagebuilder.webhook_update', module: 'messagebuilder', entityType: 'MessageBuilderWebhook', entityId: id, before: { name: w.name, username: w.username, discordName: w.discordName }, after: { name: b.name, username: b.username, discordName } }, tx);
        });
        return (await this.listWebhooks()).find((x) => x.id === id);
    }
    /** Verbindung testen: Webhook bei Discord abfragen (ohne etwas zu senden); Name, Avatar und Kanal aktualisieren. */
    async testWebhook(actor, id) {
        const w = await this.webhookRow(id);
        const url = (0, erlc_crypto_1.decryptSecret)(w.secret);
        let ok = false, error = null;
        if (!url)
            error = 'Die Webhook-URL lässt sich nicht mehr entschlüsseln (Schlüssel geändert?) – Webhook neu anlegen.';
        else {
            try {
                const info = await this.webhooks.info(url);
                if (info.guildId && info.guildId !== w.guildId)
                    error = 'Der Webhook gehört inzwischen zu einem anderen Discord-Server.';
                else {
                    ok = true;
                    await this.prisma.messageBuilderWebhook.update({ where: { id }, data: { discordName: info.name, discordAvatar: info.avatar, channelId: info.channelId ?? w.channelId } });
                }
            }
            catch (e) {
                error = e instanceof webhook_client_1.DiscordHttpError ? e.message : 'Unbekannter Fehler.';
            }
        }
        await this.prisma.messageBuilderWebhook.update({ where: { id }, data: { lastCheckAt: new Date(), lastCheckOk: ok, lastCheckError: ERR(error) } });
        await this.audit.record(actor, { action: 'messagebuilder.webhook_test', module: 'messagebuilder', entityType: 'MessageBuilderWebhook', entityId: id, after: { ok } });
        return { ok, error: ERR(error), webhook: (await this.listWebhooks()).find((x) => x.id === id) };
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
            const w = await tx.messageBuilderWebhook.create({ data: { name: b.name, secret: (0, erlc_crypto_1.encryptSecret)(b.url), webhookId: info.id, channelId: info.channelId, guildId: info.guildId, createdById: actor.userId,
                    username: b.username || null, avatarUrl: b.avatarUrl || null, discordName: info.name, discordAvatar: info.avatar, lastCheckAt: new Date(), lastCheckOk: true } });
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