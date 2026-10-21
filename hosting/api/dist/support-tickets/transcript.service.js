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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TicketTranscriptService = exports.MAX_TRANSCRIPT_ATTEMPTS = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const discord_service_1 = require("../discord/discord.service");
const errors_1 = require("../common/errors");
const env_1 = require("../config/env");
const web_url_1 = require("../common/web-url");
const guild_context_1 = require("../common/guild-context");
const config_service_1 = require("./config.service");
const transcript_1 = require("./transcript");
const INLINE_IMAGE = 2 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
/** Wartezeit vor dem n-ten erneuten Versuch (Minuten); danach gilt der Auftrag als fehlgeschlagen. */
const BACKOFF_MIN = [1, 5, 15, 60];
exports.MAX_TRANSCRIPT_ATTEMPTS = BACKOFF_MIN.length + 1;
/** Ein laufender Auftrag gilt nach so vielen Minuten als abgebrochen (Neustart) und wird erneut übernommen. */
const LEASE_MIN = 10;
/** Ereignisse, die nur intern sind und nie in einem Transkript erscheinen (Notizen, Transkript-Verwaltung). */
const INTERNAL_EVENTS = new Set(['note_added', 'transcript_created', 'transcript_requested', 'transcript_deleted', 'transcript_failed', 'transcript_viewed', 'rating_requested', 'staff_alert', 'sla_reminder', 'sla_escalated', 'unassigned_escalated', 'routing_warning']);
const LABEL = {
    created: 'Ticket erstellt', answers: 'Fragen beantwortet', claimed: 'Übernommen', claim_transferred: 'Bearbeiter gewechselt', unclaimed: 'Freigegeben', assigned: 'Zuständigkeit geändert',
    user_added: 'Benutzer hinzugefügt', user_removed: 'Benutzer entfernt', role_added: 'Rolle hinzugefügt', role_removed: 'Rolle entfernt', priority_changed: 'Priorität geändert',
    status_changed: 'Status geändert', category_changed: 'Kategorie geändert', department_changed: 'Abteilung geändert', renamed: 'Umbenannt', moved: 'Verschoben', locked: 'Gesperrt',
    unlocked: 'Entsperrt', escalated: 'Eskaliert', closed: 'Geschlossen', reopened: 'Wieder geöffnet', archived: 'Archiviert', info_requested: 'Rückfrage an den Nutzer',
    rated: 'Bewertet', access_expired: 'Zugriff abgelaufen', auto_warning: 'Inaktivitäts-Warnung', deleted: 'Gelöscht', close_requested: 'Schließen angefragt',
    close_request_accepted: 'Schließen bestätigt', close_request_declined: 'Schließen abgelehnt',
};
/**
 * Transkripte als Hintergrund-Aufträge: beim Schließen wird nur ein Auftrag angelegt (die Nachrichten liegen bereits in der
 * Datenbank, nichts geht verloren), die Erstellung läuft danach mit begrenzten Wiederholungen. Jede Erstellung ist eine neue
 * Version; derselbe Anlass (`jobKey`) erzeugt nie zwei Aufträge.
 */
let TicketTranscriptService = class TicketTranscriptService {
    prisma;
    discord;
    config;
    log = new common_1.Logger('TicketTranscripts');
    dir = node_path_1.default.resolve((0, env_1.loadEnv)().STORAGE_DIR, 'tickets');
    hook = null;
    running = false;
    constructor(prisma, discord, config) {
        this.prisma = prisma;
        this.discord = discord;
        this.config = config;
    }
    /** Benachrichtigungen bei Erfolg/Fehlschlag (gesetzt vom Ticket-Service). */
    onFinished(h) { this.hook = h; }
    /** Auftrag anlegen (idempotent über `key`). Liefert den bestehenden Auftrag, falls es ihn schon gibt. */
    async enqueue(ticketId, o) {
        const jobKey = o.key ?? `${o.trigger}:${(0, node_crypto_1.randomUUID)()}`;
        const existing = await this.prisma.ticketTranscript.findUnique({ where: { jobKey } });
        if (existing)
            return { transcript: existing, created: false };
        try {
            const tr = await this.prisma.$transaction(async (tx) => {
                // Versionsnummer je Ticket ohne Lücken/Doppel: Sperre je Ticket
                await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${`transcript:${ticketId}`}))`;
                const t = await tx.supportTicket.findUnique({ where: { id: ticketId }, select: { number: true, creatorId: true, creatorName: true, claimers: true } });
                if (!t)
                    throw new errors_1.AppError('NOT_FOUND', 'Ticket nicht gefunden.');
                const last = await tx.ticketTranscript.aggregate({ where: { ticketId }, _max: { version: true } });
                return tx.ticketTranscript.create({ data: {
                        ticketId, ticketNumber: t.number, categoryName: '—', creatorId: t.creatorId, creatorName: t.creatorName, claimers: t.claimers, statusName: '—',
                        version: (last._max.version ?? 0) + 1, status: 'PENDING', trigger: o.trigger, jobKey, createdById: o.actor.id, createdByName: o.actor.name,
                        notify: (o.notify ?? {}),
                    } });
            });
            if (process.env.NODE_ENV !== 'test')
                setImmediate(() => void this.processDue().catch((e) => this.log.error(e.message)));
            return { transcript: tr, created: true };
        }
        catch (e) {
            // paralleler Auftrag mit demselben Schlüssel
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
                return { transcript: (await this.prisma.ticketTranscript.findUniqueOrThrow({ where: { jobKey } })), created: false };
            throw e;
        }
    }
    /** Fehlgeschlagenen Auftrag erneut einplanen. */
    async retry(id) {
        const tr = await this.prisma.ticketTranscript.findUnique({ where: { id } });
        if (!tr)
            throw new errors_1.AppError('NOT_FOUND', 'Transkript nicht gefunden.');
        if (tr.status !== 'FAILED')
            throw new errors_1.AppError('CONFLICT', 'Nur fehlgeschlagene Transkripte können wiederholt werden.');
        const r = await this.prisma.ticketTranscript.update({ where: { id }, data: { status: 'PENDING', attempts: 0, nextAttemptAt: null, lastError: null } });
        if (process.env.NODE_ENV !== 'test')
            setImmediate(() => void this.processDue().catch((e) => this.log.error(e.message)));
        return r;
    }
    /** Fällige Aufträge abarbeiten (auch nach einem Neustart hängengebliebene). Mehrere Instanzen sperren sich gegenseitig aus. */
    async processDue(now = new Date(), limit = 10) {
        if (this.running)
            return { done: 0, failed: 0 };
        this.running = true;
        let done = 0, failed = 0;
        try {
            for (let i = 0; i < limit; i++) {
                const lease = new Date(now.getTime() + LEASE_MIN * 60_000);
                const rows = await this.prisma.$queryRaw `
          UPDATE "TicketTranscript" SET "status" = 'RUNNING', "attempts" = "attempts" + 1, "nextAttemptAt" = ${lease}
          WHERE "id" = (SELECT "id" FROM "TicketTranscript"
            WHERE ("status" = 'PENDING' AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= ${now})) OR ("status" = 'RUNNING' AND "nextAttemptAt" <= ${now})
            ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED)
          RETURNING "id"`;
                const id = rows[0]?.id;
                if (!id)
                    break;
                if (await this.runJob(id, now))
                    done++;
                else
                    failed++;
            }
        }
        finally {
            this.running = false;
        }
        return { done, failed };
    }
    async runJob(id, now) {
        const job = await this.prisma.ticketTranscript.findUniqueOrThrow({ where: { id } });
        try {
            const r = await this.render(job.ticketId, job.version);
            const tr = await this.prisma.ticketTranscript.update({ where: { id }, data: {
                    status: 'DONE', html: r.html, text: r.text, data: r.data, sha256: r.sha256, sizeBytes: Buffer.byteLength(r.html),
                    categoryName: r.meta.category, statusName: r.meta.status, claimers: r.meta.claimers, completedAt: new Date(), nextAttemptAt: null, lastError: null,
                } });
            await this.prisma.ticketLog.create({ data: { ticketId: job.ticketId, action: 'transcript_created', actorName: job.createdByName, detail: { transcriptId: id, version: job.version, trigger: job.trigger } } });
            await this.deliver(tr, r.meta.ref, r.meta.guildId);
            await this.hook?.(tr, true).catch((e) => this.log.warn(`transcript hook: ${e.message}`));
            return true;
        }
        catch (e) {
            // Fehlertext ohne Inhalte des Tickets (keine Nachrichten in Logs)
            const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
            const final = job.attempts >= exports.MAX_TRANSCRIPT_ATTEMPTS;
            const tr = await this.prisma.ticketTranscript.update({ where: { id }, data: final
                    ? { status: 'FAILED', lastError: msg, nextAttemptAt: null }
                    : { status: 'PENDING', lastError: msg, nextAttemptAt: new Date(now.getTime() + BACKOFF_MIN[Math.max(0, job.attempts - 1)] * 60_000) } });
            this.log.warn(`transcript ${id} (ticket ${job.ticketId}, version ${job.version}) attempt ${job.attempts} failed${final ? ' – giving up' : ''}: ${msg}`);
            if (final) {
                await this.prisma.ticketLog.create({ data: { ticketId: job.ticketId, action: 'transcript_failed', actorName: 'System', detail: { transcriptId: id, version: job.version, error: msg } } });
                await this.hook?.(tr, false).catch((x) => this.log.warn(`transcript hook: ${x.message}`));
            }
            return false;
        }
    }
    /** Fertiges Transkript in Discord zustellen (Datei + Link zur Online-Ansicht); Fehler dabei ändern das Transkript nicht. */
    async deliver(tr, ref, guildId) {
        const n = (tr.notify ?? {});
        if (!n.channelIds?.length && !n.userId)
            return;
        const message = {
            embeds: [{ description: n.message ?? `📋 Transkript **${ref}** (Version ${tr.version}) wurde erstellt.`, color: 0x5865f2 }],
            buttons: [{ id: `tr-link-${tr.id}`, label: 'Online ansehen (Anmeldung nötig)', style: 'secondary', url: (0, web_url_1.webUrl)(`/transcript/${encodeURIComponent(ref)}`) }],
        };
        const effect = { type: 'transcript', transcriptId: tr.id, channelIds: n.channelIds ?? [], userId: n.userId ?? null, filename: `transkript-${ref}-v${tr.version}.html`, message };
        await (0, guild_context_1.runInGuild)(guildId, () => this.discord.enqueue('tickets', 'ticket.effects', { effects: [effect] }, { always: true })).catch((e) => this.log.warn(`transcript delivery: ${e.message}`));
    }
    /** Transkript aus den gespeicherten Daten erzeugen (ohne interne Notizen und interne Ereignisse). */
    async render(ticketId, version) {
        const t = await this.prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
        const [cat, status, priority, dept, messages, logs, access, settings, tz] = await Promise.all([
            this.prisma.ticketCategory.findUnique({ where: { id: t.categoryId } }), this.prisma.ticketStatus.findUnique({ where: { id: t.statusId } }),
            t.priorityId ? this.prisma.ticketPriority.findUnique({ where: { id: t.priorityId } }) : null,
            t.departmentId ? this.prisma.ticketDepartment.findUnique({ where: { id: t.departmentId } }) : null,
            this.prisma.ticketMessage.findMany({ where: { ticketId }, orderBy: { createdAt: 'asc' }, take: 10_000 }),
            this.prisma.ticketLog.findMany({ where: { ticketId }, orderBy: { createdAt: 'asc' } }),
            this.prisma.ticketAccess.findMany({ where: { ticketId } }), (0, guild_context_1.runInGuild)(t.guildId, () => this.config.settings()), this.timezone(),
        ]);
        const ref = (0, shared_1.ticketRef)(t.number, settings.refPrefix);
        const names = new Map([[t.creatorId, t.creatorName], ...messages.map((m) => [m.authorId, m.authorName])]);
        const entries = [];
        for (const m of messages) {
            const atts = [];
            for (const a of m.attachments ?? []) {
                let dataUri = null;
                if (a.storageKey && a.contentType && IMAGE_TYPES.includes(a.contentType) && a.size <= INLINE_IMAGE && /^[0-9a-f-]{36}\.[a-z0-9]{1,9}$/.test(a.storageKey)) {
                    const buf = await (0, promises_1.readFile)(node_path_1.default.join(this.dir, a.storageKey)).catch(() => null);
                    if (buf)
                        dataUri = `data:${a.contentType};base64,${buf.toString('base64')}`;
                }
                atts.push({ name: a.name, size: a.size, contentType: a.contentType ?? undefined, dataUri, href: a.storageKey ? (0, web_url_1.webUrl)(`/api/v1/support-tickets/attachments/${a.storageKey}`) : null });
            }
            entries.push({ kind: 'message', at: m.createdAt, author: m.authorName, authorId: m.authorId, avatar: m.authorAvatar, staff: m.isStaff, bot: m.isBot, content: m.content, attachments: atts, embeds: m.embeds ?? [] });
        }
        for (const g of logs) {
            if (INTERNAL_EVENTS.has(g.action))
                continue;
            const det = g.detail;
            const extra = det.to ? `: ${String(det.from ?? '—')} → ${String(det.to)}` : det.reason ? `: ${String(det.reason)}` : det.target ? `: ${names.get(String(det.target)) ?? String(det.target)}` : '';
            entries.push({ kind: 'event', at: g.createdAt, text: `${LABEL[g.action] ?? g.action}${extra} · ${g.actorName ?? 'System'}` });
        }
        entries.sort((a, b) => a.at.getTime() - b.at.getTime());
        const generatedAt = new Date();
        const base = {
            ref, subject: t.subject, department: dept?.name ?? null, version,
            number: (0, shared_1.ticketNumber)(t.number), name: t.name, category: cat?.name ?? '—', status: status ? `${status.emoji} ${status.name}`.trim() : '—', priority: priority ? `${priority.emoji} ${priority.name}`.trim() : '—',
            creator: { id: t.creatorId, name: t.creatorName }, claimers: t.claimers.map((id) => ({ id, name: names.get(id) ?? id })), participants: access.map((a) => (a.kind === 'USER' ? names.get(a.targetId) ?? a.targetId : `Rolle ${a.targetId}`)),
            createdAt: t.createdAt, closedAt: t.closedAt, closedBy: t.closedByName, closeReason: t.closeReason, generatedAt, timezone: tz,
            answers: (t.answers ?? []).map((a) => ({ label: a.label, value: a.value })), entries,
        };
        // strukturierte Daten (JSON-Export) ohne eingebettete Bilder; SHA-256 darüber = Integritätsnachweis der Version
        const data = { ...base, entries: entries.map((e) => (e.kind === 'event' ? e : { ...e, attachments: e.attachments.map((a) => ({ name: a.name, size: a.size, contentType: a.contentType })) })), createdAt: t.createdAt.toISOString(), closedAt: t.closedAt?.toISOString() ?? null, generatedAt: generatedAt.toISOString() };
        const sha256 = (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(data)).digest('hex');
        const full = { ...base, sha256 };
        return { html: (0, transcript_1.renderTranscript)(full), text: (0, transcript_1.renderTranscriptText)(full), data: { ...data, sha256 }, sha256, meta: { ref, guildId: t.guildId, category: cat?.name ?? '—', status: status?.name ?? '—', claimers: t.claimers } };
    }
    async timezone() {
        const v = (await this.prisma.systemSetting.findUnique({ where: { key: 'org.timezone' } }))?.value;
        return typeof v === 'string' && v ? v : 'Europe/Berlin';
    }
};
exports.TicketTranscriptService = TicketTranscriptService;
exports.TicketTranscriptService = TicketTranscriptService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, discord_service_1.DiscordService, config_service_1.TicketConfigService])
], TicketTranscriptService);
//# sourceMappingURL=transcript.service.js.map