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
exports.SupportTicketsService = exports.permissionFor = void 0;
const notify_service_1 = require("../notifications/notify.service");
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const permission_service_1 = require("../authz/permission.service");
const discord_service_1 = require("../discord/discord.service");
const errors_1 = require("../common/errors");
const env_1 = require("../config/env");
const web_url_1 = require("../common/web-url");
const audit_service_1 = require("../audit/audit.service");
const guild_context_1 = require("../common/guild-context");
const config_service_1 = require("./config.service");
const transcript_service_1 = require("./transcript.service");
const MAX_ATTACHMENT = 8 * 1024 * 1024;
/** angefangene Discord-Formulare verfallen nach so vielen Minuten */
const DRAFT_MINUTES = 30;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const mention = (id) => `<@${id}>`;
const NOTIFY_LABEL = {
    created: 'neues Ticket', claimed: 'übernommen', assigned: 'Zuständigkeit geändert', user_message: 'neue Nachricht', info_requested: 'Rückfrage gestellt', priority: 'Priorität geändert',
    escalated: 'eskaliert', closed: 'geschlossen', reopened: 'wieder geöffnet', transcript_ready: 'Transkript erstellt', transcript_failed: 'Transkript fehlgeschlagen',
};
/** Welches Recht welche API-Aktion braucht (Katalog in @enrp/shared). */
const PERM = {
    close: 'close', close_request: 'close_request', reopen: 'reopen', claim: 'claim', unclaim: 'unclaim', add_access: 'add_user', remove_access: 'remove_user', priority: 'priority', status: 'status',
    category: 'category', rename: 'rename', move: 'move', transcript: 'transcript', lock: 'lock', unlock: 'unlock', escalate: 'escalate', note: 'note', rating: 'rating', delete: 'delete',
};
/** Rechte der neuen Aktionen. Antworten/Rückfragen: wer Tickets bearbeiten (übernehmen) darf. */
const EXTRA_PERM = {
    reply: 'ticket.claim', assign: 'ticket.assign', department: 'ticket.change_department', request_info: 'ticket.claim', archive: 'ticket.archive', transcript_retry: 'ticket.transcript_manage',
};
const permissionFor = (a) => (a in EXTRA_PERM ? EXTRA_PERM[a] : shared_1.TICKET_ACTIONS[PERM[a]].permission);
exports.permissionFor = permissionFor;
/** Aktionen, die zusätzlich ins (unveränderliche) Audit-Protokoll gehören. */
const AUDITED = new Set(['created', 'claimed', 'claim_transferred', 'unclaimed', 'assigned', 'department_changed', 'category_changed', 'priority_changed', 'status_changed', 'note_added', 'closed', 'reopened', 'archived', 'deleted', 'user_added', 'user_removed', 'role_added', 'role_removed', 'escalated', 'locked', 'unlocked', 'info_requested', 'transcript_requested', 'transcript_retry', 'routing_warning']);
/**
 * Support-Ticket-System. Das System entscheidet (Rechte, Regeln, Daten, Protokoll), der Bot führt die Discord-Seite aus (Effekte).
 * Aktionen aus Discord bekommen ihre Effekte direkt zurück; Aktionen aus dem Web und der Automatik laufen über die Outbox.
 */
let SupportTicketsService = class SupportTicketsService {
    prisma;
    perms;
    discord;
    config;
    notify;
    audit;
    transcriptsSvc;
    log = new common_1.Logger('Tickets');
    dir = node_path_1.default.resolve((0, env_1.loadEnv)().STORAGE_DIR, 'tickets');
    constructor(prisma, perms, discord, config, notify, audit, transcriptsSvc) {
        this.prisma = prisma;
        this.perms = perms;
        this.discord = discord;
        this.config = config;
        this.notify = notify;
        this.audit = audit;
        this.transcriptsSvc = transcriptsSvc;
        transcriptsSvc.onFinished((tr, ok) => this.transcriptFinished(tr, ok));
    }
    /** Einstellungen des Servers, zu dem das Ticket gehört (Ticket-Einstellungen können je Server gelten). */
    settingsFor(guildId) { return guildId ? (0, guild_context_1.runInGuild)(guildId, () => this.config.settings()) : this.config.settings(); }
    ref(n, settings) { return (0, shared_1.ticketRef)(n, settings?.refPrefix); }
    // ================= Hilfsfunktionen =================
    async actorFromUser(u) {
        const link = await this.prisma.discordLink.findUnique({ where: { userId: u.id } });
        return { userId: u.id, discordId: link?.discordId ?? null, name: u.displayName, viaBot: u.sessionId === 'bot' };
    }
    async timezone() {
        const v = (await this.prisma.systemSetting.findUnique({ where: { key: 'org.timezone' } }))?.value;
        return typeof v === 'string' && v ? v : 'Europe/Berlin';
    }
    fmt(d, tz) {
        if (!d)
            return '—';
        try {
            return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(d);
        }
        catch {
            return d.toISOString();
        }
    }
    async load(id) {
        const t = await this.prisma.supportTicket.findUnique({ where: { id } });
        if (!t || t.deletedAt)
            throw new errors_1.AppError('NOT_FOUND', 'Ticket nicht gefunden.');
        const [cat, status, priority, settings, tz, dept] = await Promise.all([
            this.config.category(t.categoryId), this.prisma.ticketStatus.findUniqueOrThrow({ where: { id: t.statusId } }),
            t.priorityId ? this.prisma.ticketPriority.findUnique({ where: { id: t.priorityId } }) : Promise.resolve(null), this.settingsFor(t.guildId), this.timezone(), this.config.department(t.departmentId),
        ]);
        return { t, cat, status, priority, settings, tz, dept };
    }
    vars(l, extra = {}) {
        const { t, cat, status, priority, tz } = l;
        return {
            '{user}': mention(t.creatorId), '{username}': t.creatorName, '{user_id}': t.creatorId, '{ticket_id}': (0, shared_1.ticketNumber)(t.number), '{ticket_ref}': this.ref(t.number, l.settings), '{category}': cat.name,
            '{staff}': t.claimers.length ? t.claimers.map(mention).join(', ') : 'niemand', '{status}': `${status.emoji} ${status.name}`.trim(),
            '{priority}': priority ? `${priority.emoji} ${priority.name}`.trim() : '—', '{reason}': t.closeReason ?? '—', '{closed_by}': t.closedByName ?? '—',
            '{created_at}': this.fmt(t.createdAt, tz), '{closed_at}': this.fmt(t.closedAt, tz), '{channel}': t.channelId ? `<#${t.channelId}>` : `#${t.name}`, ...extra,
        };
    }
    isClosed(l) { return l.status.kind !== 'OPEN' || !!l.t.closedAt; }
    /** Ticket-Embed mit Buttons (wird bei jeder Änderung neu gezeichnet). */
    control(l) {
        const closed = this.isClosed(l);
        const v = this.vars(l);
        const buttons = [];
        for (const b of (0, shared_1.ticketButtonsOf)(l.cat.buttons)) {
            if (!b.enabled)
                continue;
            const def = shared_1.TICKET_ACTIONS[b.action];
            if (!def || (def.state === 'open' && closed) || (def.state === 'closed' && !closed))
                continue;
            if (b.action === 'reopen' && !l.cat.allowReopen)
                continue;
            if (b.action === 'claim' && l.cat.claimMode === 'SINGLE' && l.t.claimers.length)
                continue;
            if (b.action === 'unclaim' && !l.t.claimers.length)
                continue;
            if (b.action === 'lock' && l.t.locked)
                continue;
            if (b.action === 'unlock' && !l.t.locked)
                continue;
            if (b.action === 'rating' && !l.cat.ratingEnabled)
                continue;
            buttons.push({ id: b.action === 'close' ? `tk:close:${l.t.id}:${this.closeMode(l.cat)}` : `tk:${b.action}:${l.t.id}`, label: b.label, emoji: b.emoji, style: b.style });
        }
        const fields = [
            ...(l.t.subject ? [{ name: 'Betreff', value: l.t.subject.slice(0, 1024), inline: false }] : []),
            { name: 'Status', value: v['{status}'], inline: true }, { name: 'Priorität', value: v['{priority}'], inline: true },
            ...(l.dept ? [{ name: 'Abteilung', value: `${l.dept.emoji ? `${l.dept.emoji} ` : ''}${l.dept.name}`, inline: true }] : []),
            { name: l.cat.claimMode === 'PRIMARY' && l.t.claimers.length > 1 ? 'Bearbeiter (Haupt + Helfer)' : 'Bearbeiter', value: v['{staff}'], inline: true },
            ...(l.t.locked ? [{ name: 'Gesperrt', value: '⛔ Der Ersteller kann nicht schreiben.', inline: false }] : []),
        ];
        const embed = {
            title: (0, shared_1.renderTicketText)(l.cat.welcomeTitle || '🎫 {category}', v).slice(0, 256),
            description: (0, shared_1.renderTicketText)(l.cat.welcomeMessage || 'Hallo {user}!', v).slice(0, 4000),
            color: closed ? l.settings.closedColor : l.priority?.color ?? l.cat.color, fields, footer: `Ticket ${this.ref(l.t.number, l.settings)} · erstellt ${this.fmt(l.t.createdAt, l.tz)}`,
            ...(l.cat.welcomeImageUrl ? { image: l.cat.welcomeImageUrl } : {}),
        };
        return { embeds: [embed], buttons: buttons.slice(0, 25) };
    }
    /** n = ohne Grund, m = Formular, s = Auswahl (feste Gründe). */
    closeMode(cat) {
        if (cat.closeReasonMode === 'NONE')
            return 'n';
        return cat.closeReasonSource === 'CUSTOM' ? 'm' : 's';
    }
    questionMessage(t, cat, idx) {
        const qs = (0, shared_1.activeFields)(cat.questions);
        const q = qs[idx];
        if (!q)
            return null;
        const buttons = [];
        let select;
        // Zeichenlimit im Button (das Formular in Discord kennt die Frage sonst nicht): …:l:min-max
        const lim = q.minLength || q.maxLength ? `:${q.minLength ?? 0}-${q.maxLength ?? (q.type === 'LONG' ? 2000 : 200)}` : '';
        if (q.type === 'SHORT' || q.type === 'LONG' || q.type === 'NUMBER' || q.type === 'DATE')
            buttons.push({ id: `tk:ans:${t.id}:${q.id}:${q.type === 'LONG' ? 'l' : 's'}${lim}`, label: 'Antworten', emoji: '✍️', style: 'primary' });
        if (q.type === 'CHECKBOX')
            buttons.push({ id: `tk:ansv:${t.id}:${q.id}:Ja`, label: 'Bestätigen', emoji: '☑️', style: 'success' });
        if (q.type === 'FILE')
            buttons.push({ id: `tk:ansv:${t.id}:${q.id}:hochgeladen`, label: 'Datei ist hochgeladen', emoji: '📎', style: 'primary' });
        if (q.type === 'YESNO')
            buttons.push({ id: `tk:ansv:${t.id}:${q.id}:Ja`, label: 'Ja', style: 'success' }, { id: `tk:ansv:${t.id}:${q.id}:Nein`, label: 'Nein', style: 'danger' });
        if (q.type === 'SELECT' || q.type === 'MULTI')
            select = { id: `tk:anss:${t.id}:${q.id}`, placeholder: q.placeholder || 'Bitte auswählen …', min: q.required ? 1 : 0, max: q.type === 'MULTI' ? q.options.length : 1, options: q.options.slice(0, 25).map((o) => ({ label: o.slice(0, 100), value: o.slice(0, 100) })) };
        if (!q.required)
            buttons.push({ id: `tk:skip:${t.id}:${q.id}`, label: 'Überspringen', style: 'secondary' });
        const hint = q.type === 'FILE' ? '\n\n📎 Lade die Datei einfach hier im Kanal hoch und klicke danach auf den Button.' : q.type === 'DATE' ? '\n-# Format: TT.MM.JJJJ' : q.type === 'NUMBER' ? '\n-# Bitte eine Zahl eingeben.' : '';
        return { embeds: [{ title: `Frage ${idx + 1}/${qs.length}`, description: `${q.label}${q.description ? `\n-# ${q.description}` : ''}${hint}${q.required ? '' : '\n\n*(optional)*'}`, color: cat.color, footer: 'Nur der Ticket-Ersteller kann antworten.' }], buttons, select };
    }
    async logAction(l, action, actor, detail, effects, text) {
        await this.prisma.ticketLog.create({ data: { ticketId: l.t.id, action, actorId: actor.discordId, actorName: actor.name, detail: detail } });
        const ref = this.ref(l.t.number, l.settings);
        // vertrauliche Tickets: im Log-Kanal nur Ticket-ID und Art der Aktion (keine Gründe, Namen, Inhalte)
        const shown = l.cat?.confidential && text ? `🔒 vertraulich · ${text.split(/ von | – |: |\(/)[0].trim()}` : text;
        if (l.settings.logChannelId && shown)
            effects.push({ type: 'post', channelId: l.settings.logChannelId, message: { embeds: [{ description: `**${ref}**${l.cat?.confidential ? '' : ` (${l.t.name})`} · ${shown}`, color: 0x64748b, footer: actor.name }] } });
        if (AUDITED.has(action))
            await this.auditTicket(actor, action, l.t, { ref, ...this.auditDetail(detail) }, action === 'routing_warning' ? 'FAILED' : 'SUCCESS');
    }
    /** Nur unkritische Metadaten ins Audit (keine Notiztexte, Gründe oder Nachrichten – das Audit kann in Discord-Logkanäle gespiegelt werden). */
    auditDetail(d) {
        const keep = ['from', 'to', 'target', 'claimers', 'category', 'priority', 'status', 'transcriptId', 'version', 'departmentId'];
        return Object.fromEntries(Object.entries(d).filter(([k]) => keep.includes(k)));
    }
    async auditTicket(actor, action, t, after, result = 'SUCCESS') {
        await this.audit.record({ userId: actor.userId, requestId: (0, guild_context_1.currentRequestId)() ?? actor.requestId ?? `system-${(0, node_crypto_1.randomUUID)()}` }, { action: `ticket.${action}`, module: 'tickets', entityType: 'SupportTicket', entityId: t.id, after, serverId: t.guildId, result })
            .catch((e) => this.log.warn(`audit failed: ${e.message}`));
    }
    async dispatch(effects, viaBot) {
        if (!effects.length)
            return [];
        if (viaBot)
            return effects;
        await this.discord.enqueue('tickets', 'ticket.effects', { effects }, { always: true });
        return [];
    }
    /**
     * Darf der Mitarbeiter dieses Ticket sehen / dieses Recht ausüben? Standard: verweigern. ticket.manage darf alles.
     * Abgelehnte Versuche landen im Audit-Protokoll (ohne Inhalte).
     */
    async assertCan(actor, perm, cat, dept, ticket) {
        if (actor.system)
            return;
        const deny = async (msg) => {
            if (ticket)
                await this.auditTicket(actor, 'access_denied', ticket, { permission: perm }, 'DENIED');
            throw new errors_1.AppError('PERMISSION_DENIED', msg);
        };
        if (!actor.userId)
            return deny('Dein Discord-Konto ist mit keinem Team-Konto verknüpft.');
        if (await this.perms.has(actor.userId, 'ticket.manage'))
            return;
        if (!(await this.perms.has(actor.userId, perm)))
            return deny('Dafür fehlt dir die Berechtigung.');
        if (!(await this.categoryVisible(actor.userId, cat, dept)))
            return deny('Du hast keinen Zugriff auf Tickets dieser Art.');
    }
    async roleNames(userId) {
        return new Set((await this.prisma.userRole.findMany({ where: { userId }, include: { role: { select: { name: true } } } })).map((r) => r.role.name));
    }
    /**
     * Sichtbarkeit eines Tickets: Systemrollen der Kategorie und der Abteilung des Tickets. Ohne eingestellte Rollen sehen alle mit
     * ticket.view das Ticket – außer bei vertraulichen Kategorien (dann nur ticket.manage).
     */
    async categoryVisible(userId, cat, dept) {
        const names = [...cat.accessRoleNames, ...(dept?.accessRoleNames ?? [])];
        if (!names.length)
            return !cat.confidential;
        const mine = await this.roleNames(userId);
        return names.some((n) => mine.has(n));
    }
    /** IDs der Kategorien, deren Tickets der Benutzer grundsätzlich sehen darf (null = alle) – für Bewertungen/Statistiken je Kategorie. */
    async visibleCategoryIds(userId) {
        if (await this.perms.has(userId, 'ticket.manage'))
            return null;
        const [cats, mine] = await Promise.all([this.prisma.ticketCategory.findMany({ select: { id: true, accessRoleNames: true, confidential: true } }), this.roleNames(userId)]);
        return cats.filter((c) => (!c.accessRoleNames.length ? !c.confidential : c.accessRoleNames.some((n) => mine.has(n)))).map((c) => c.id);
    }
    /** Filter für alle Tickets, die der Benutzer sehen darf (null = alle). Gleiche Regel wie `categoryVisible`, aber als Datenbank-Abfrage. */
    async visibleWhere(userId) {
        if (await this.perms.has(userId, 'ticket.manage'))
            return null;
        const [cats, deps, mine] = await Promise.all([
            this.prisma.ticketCategory.findMany({ select: { id: true, accessRoleNames: true, confidential: true } }),
            this.prisma.ticketDepartment.findMany({ select: { id: true, accessRoleNames: true } }), this.roleNames(userId),
        ]);
        const has = (names) => names.some((n) => mine.has(n));
        const catMine = cats.filter((c) => has(c.accessRoleNames)).map((c) => c.id);
        const depMine = deps.filter((d) => has(d.accessRoleNames)).map((d) => d.id);
        const catOpen = cats.filter((c) => !c.accessRoleNames.length && !c.confidential).map((c) => c.id);
        const depOpen = deps.filter((d) => !d.accessRoleNames.length).map((d) => d.id);
        return { OR: [
                { categoryId: { in: catMine } }, { departmentId: { in: depMine } },
                { categoryId: { in: catOpen }, OR: [{ departmentId: null }, { departmentId: { in: depOpen } }] },
            ] };
    }
    /** Zuständige Discord-Rollen eines Tickets (Kategorie + Abteilung) mit sicherem Ersatz, falls keine eingerichtet sind. */
    async routing(cat, dept, settings) {
        const own = [...new Set([...cat.staffRoleIds, ...(dept?.active ? dept.staffRoleIds : [])])];
        if (own.length)
            return { responsible: own, warning: null };
        if (cat.confidential) {
            // vertraulich: NIE die allgemeine Staff-Rolle – nur die eingestellten Ersatz-Rollen (z. B. Leitung)
            return { responsible: settings.confidentialFallbackRoleIds, warning: `Für die vertrauliche Kategorie „${cat.name}“ ist keine zuständige Abteilung/Rolle eingerichtet. ${settings.confidentialFallbackRoleIds.length ? 'Das Ticket ist nur für die Ersatz-Rollen (Allgemein → Vertrauliche Tickets) sichtbar.' : 'Das Ticket ist im Discord-Kanal nur für den Ersteller sichtbar; im Dashboard nur für Personen mit ticket.manage.'}` };
        }
        const general = ((await this.discord.channels()).staffRole ?? '').split(/[\s,;]+/).filter((r) => /^\d{15,25}$/.test(r));
        return { responsible: general, warning: general.length ? null : `Für „${cat.name}“ ist keine zuständige Rolle eingerichtet und keine allgemeine Staff-Rolle hinterlegt.` };
    }
    // ================= Öffnen =================
    /** Prüft alle Voraussetzungen, legt das Ticket an und liefert den „create“-Effekt (Channel, Rechte, Ticket-Embed, erste Frage). */
    /** `byStaff`: vom Team für ein Mitglied geöffnet (Recht ticket.create) – ohne Rollen-, Limit- und Cooldown-Prüfung. */
    async open(d, actor, byStaff = false) {
        const cat = await this.config.category(d.categoryId);
        await this.checkOpenable(cat, d.guildId);
        // Formular vor dem Erstellen: ohne eingereichte Antworten wird nichts angelegt (der Bot zeigt das Formular)
        if (cat.formMode === 'MODAL' && !d.form && !byStaff && (0, shared_1.activeFields)(cat.questions).length)
            return { form: { categoryId: cat.id, panelId: d.panelId ?? null } };
        if (d.openKey) {
            const prev = await this.prisma.supportTicket.findUnique({ where: { openKey: d.openKey } });
            if (prev)
                return { ticket: this.summary(await this.load(prev.id)), effects: [], existing: true };
        }
        let made;
        try {
            made = await this.prisma.$transaction(async (tx) => {
                // gleichzeitige Klicks desselben Nutzers nacheinander prüfen (Limit, Cooldown, Doppelklick)
                await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${`ticket-open:${d.discordId}`}))`;
                // dieselbe Interaktion wurde inzwischen (parallel) verarbeitet → kein zweites Ticket
                if (d.openKey) {
                    const prev = await tx.supportTicket.findUnique({ where: { openKey: d.openKey }, select: { id: true } });
                    if (prev)
                        return { existingId: prev.id };
                }
                if (!byStaff)
                    await this.checkCanOpen(cat, d, tx);
                return this.create(cat, d, tx);
            }, { timeout: 20_000 });
        }
        catch (e) {
            // gleiche Interaktion parallel verarbeitet → vorhandenes Ticket zurückgeben
            if (d.openKey && e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                const prev = await this.prisma.supportTicket.findUnique({ where: { openKey: d.openKey } });
                if (prev)
                    return { ticket: this.summary(await this.load(prev.id)), effects: [], existing: true };
            }
            throw e;
        }
        if ('existingId' in made)
            return { ticket: this.summary(await this.load(made.existingId)), effects: [], existing: true };
        return this.finishCreate(made, d, actor);
    }
    /** Nach dem Speichern: Protokoll, Hinweis auf fehlende Zuständigkeit, Formular-Anhänge, Panel-Auslastung, Benachrichtigungen. */
    async finishCreate({ l, effects, warning }, d, actor) {
        const { t, cat, settings } = l;
        const ref = this.ref(t.number, settings);
        await this.logAction(l, 'created', actor, { category: cat.name, by: actor.discordId === d.discordId ? 'creator' : actor.name, ...(d.form ? { formVersion: d.form.version } : {}) }, effects, `🎫 Ticket erstellt von ${mention(d.discordId)} (${cat.name})`);
        if (warning) {
            // sichtbarer Hinweis (Log-Kanal, Ticket-Verlauf, Audit) ohne Inhalte des Tickets
            if (settings.logChannelId)
                effects.push({ type: 'post', channelId: settings.logChannelId, message: { embeds: [{ title: '⚠️ Ticket-Zuständigkeit fehlt', description: `${ref}: ${warning}`, color: 0xf59e0b }] } });
            await this.logAction(l, 'routing_warning', { ...actor, system: true }, { warning }, effects);
        }
        const files = d.form?.answers.flatMap((a) => a.files ?? []) ?? [];
        if (files.length)
            await this.storeFormFiles(t, files);
        await this.panelLoad(cat.id, effects);
        await this.queueNotify(l, 'created', effects, `🎫 Neues Ticket **${ref}** · ${cat.name}${cat.confidential ? '' : ` · ${d.discordName}`}`);
        return { ticket: this.summary(l), effects: await this.dispatch(effects, actor.viaBot) };
    }
    /** Formular-Anhänge sicher ablegen und als Nachricht im Verlauf speichern (Dashboard, Transkript). */
    async storeFormFiles(t, files) {
        const attachments = [];
        for (const f of files.slice(0, 10))
            attachments.push({ name: f.name.slice(0, 200), size: f.size, contentType: f.contentType ?? null, url: f.url, storageKey: await this.storeAttachment(f.url, f.size, f.name) });
        await this.prisma.ticketMessage.create({ data: { ticketId: t.id, authorId: t.creatorId, authorName: t.creatorName, content: '📎 Anhang aus dem Formular', attachments: attachments, createdAt: t.createdAt } });
    }
    async checkOpenable(cat, guildId) {
        if (!cat.active || cat.archivedAt)
            throw new errors_1.AppError('CONFLICT', 'Diese Ticket-Art ist derzeit deaktiviert.');
        if (cat.guildId && cat.guildId !== guildId)
            throw new errors_1.AppError('CONFLICT', 'Diese Ticket-Art gibt es auf diesem Server nicht.');
        const settings = await this.settingsFor(guildId);
        if (settings.guildId && settings.guildId !== guildId)
            throw new errors_1.AppError('CONFLICT', 'Tickets können nur auf dem eingestellten Discord-Server geöffnet werden.');
    }
    async checkCanOpen(cat, d, db = this.prisma) {
        if (d.panelId) {
            const panel = await db.ticketPanel.findUnique({ where: { id: d.panelId } });
            if (panel?.allowedRoleIds.length && !panel.allowedRoleIds.some((r) => d.memberRoleIds.includes(r)))
                throw new errors_1.AppError('PERMISSION_DENIED', 'Du darfst dieses Ticket-Panel nicht benutzen.');
        }
        if (cat.requiredRoleIds.length && !cat.requiredRoleIds.some((r) => d.memberRoleIds.includes(r)))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Dir fehlt die nötige Rolle für diese Ticket-Art.');
        if (cat.allowedUserIds.length && !cat.allowedUserIds.includes(d.discordId))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Du darfst diese Ticket-Art nicht öffnen.');
        // Berechtigte Mitarbeiter (verknüpftes Konto mit ticket.bypass_limits) umgehen Limits und Cooldown
        const link = await db.discordLink.findUnique({ where: { discordId: d.discordId } });
        if (link && (await this.perms.has(link.userId, 'ticket.bypass_limits')))
            return;
        if (cat.maxOpen > 0) {
            const open = await db.supportTicket.findMany({ where: { creatorId: d.discordId, categoryId: cat.id, closedAt: null, deletedAt: null }, select: { channelId: true } });
            if (open.length >= cat.maxOpen)
                throw new errors_1.AppError('CONFLICT', `Du hast bereits ${open.length} offene${open.length === 1 ? 's' : ''} Ticket${open.length === 1 ? '' : 's'} dieser Art${open[0]?.channelId ? `: <#${open[0].channelId}>` : ''}.`);
        }
        const settings = await this.settingsFor(d.guildId);
        if (settings.maxOpenPerUser > 0) {
            const all = await db.supportTicket.count({ where: { creatorId: d.discordId, closedAt: null, deletedAt: null } });
            if (all >= settings.maxOpenPerUser)
                throw new errors_1.AppError('CONFLICT', `Du hast bereits ${all} offene Tickets – mehr als ${settings.maxOpenPerUser} gleichzeitig sind nicht möglich. Bitte warte, bis eines abgeschlossen ist.`);
        }
        if (cat.cooldownMinutes > 0) {
            const last = await db.supportTicket.findFirst({ where: { creatorId: d.discordId, categoryId: cat.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
            const wait = last ? last.createdAt.getTime() + cat.cooldownMinutes * 60_000 - Date.now() : 0;
            if (wait > 0)
                throw new errors_1.AppError('CONFLICT', `Bitte warte noch ${Math.ceil(wait / 60_000)} Minute(n), bevor du ein neues Ticket dieser Art öffnest.`);
        }
        // Doppelklick-Schutz auch ohne Limit
        const recent = await db.supportTicket.findFirst({ where: { creatorId: d.discordId, categoryId: cat.id, deletedAt: null, createdAt: { gte: new Date(Date.now() - 10_000) } }, select: { id: true } });
        if (recent)
            throw new errors_1.AppError('CONFLICT', 'Dein Ticket wird gerade erstellt – bitte einen Moment warten.');
    }
    async create(cat, d, tx) {
        const status = await tx.ticketStatus.findFirst({ where: { isDefault: true } }) ?? await tx.ticketStatus.findFirst({ where: { kind: 'OPEN' }, orderBy: { position: 'asc' } });
        if (!status)
            throw new errors_1.AppError('CONFLICT', 'Kein offener Ticket-Status eingerichtet (Dashboard → Tickets → Einstellungen).');
        const priority = cat.defaultPriorityId ? await tx.ticketPriority.findUnique({ where: { id: cat.defaultPriorityId } }) : await tx.ticketPriority.findFirst({ where: { isDefault: true } });
        const link = await tx.discordLink.findUnique({ where: { discordId: d.discordId } });
        const dept = cat.departmentId ? await tx.ticketDepartment.findUnique({ where: { id: cat.departmentId } }) : null;
        const answers = d.form?.answers ?? [];
        const subject = d.form?.subject ?? answers.find((a) => a.questionId === 'subject')?.value ?? null;
        const now = new Date();
        const sla = (0, shared_1.slaState)({ createdAt: now, firstResponseAt: null, closedAt: null, waitingSince: null, waitingSeconds: 0, firstResponseMinutes: priority?.firstResponseMinutes ?? null, resolutionMinutes: priority?.resolutionMinutes ?? null });
        let t = await tx.supportTicket.create({ data: {
                categoryId: cat.id, panelId: d.panelId ?? null, guildId: d.guildId, name: 'ticket', creatorId: d.discordId, creatorName: d.discordName, creatorUserId: link?.userId, statusId: status.id, priorityId: priority?.id,
                departmentId: dept?.id ?? null, subject: subject?.slice(0, 200) ?? null, openKey: d.openKey ?? null, createdAt: now, lastActivityAt: now,
                firstResponseDueAt: sla.firstDueAt, resolveDueAt: sla.resolveDueAt,
                ...(d.form ? { formVersion: d.form.version, answers: answers.map(({ files, ...a }) => ({ ...a, ...(files?.length ? { files: files.map((f) => ({ name: f.name, size: f.size, contentType: f.contentType })) } : {}) })), questionIndex: cat.questions.length } : { formVersion: cat.formVersion }),
            } });
        const [settings, tz] = await Promise.all([this.settingsFor(d.guildId), this.timezone()]);
        const name = (0, shared_1.ticketChannelName)(cat.channelNameFormat, this.vars({ t, cat, status, priority, tz, settings }));
        t = await tx.supportTicket.update({ where: { id: t.id }, data: { name } });
        const l = { t, cat, status, priority, settings, tz, dept };
        const effects = [];
        const { responsible, warning } = await this.routing(cat, dept, settings);
        const staffRoles = [...new Set([...responsible, ...cat.extraRoleIds])];
        const control = this.control(l);
        const mentionText = (0, shared_1.renderTicketText)(cat.mentionText || '', this.vars(l)).trim();
        const prioRoles = priority?.notifyRoleIds.filter((r) => staffRoles.includes(r)) ?? []; // dringend: nur Rollen mit Zugriff pingen
        // neues Ticket: Ersteller und zuständige Rollen werden gepingt
        control.content = [mention(d.discordId), ...(cat.mentionStaff ? responsible.map((r) => `<@&${r}>`) : []), ...prioRoles.filter((r) => !cat.mentionStaff || !responsible.includes(r)).map((r) => `<@&${r}>`), mentionText].filter(Boolean).join(' ');
        control.mentionUsers = [d.discordId];
        control.mentionRoles = [...new Set([...(cat.mentionStaff ? responsible : []), ...prioRoles])];
        const messages = [];
        if (d.form) {
            messages.push({ embeds: [{ title: `📝 Angaben · ${this.ref(t.number, settings)}`, color: cat.color, fields: answers.slice(0, 25).map((a) => ({ name: a.label.slice(0, 256), value: (a.value || '—').slice(0, 1024) })), footer: `Formular-Version ${d.form.version}` }] });
            const hasFileField = (0, shared_1.activeFields)(cat.questions).some((q) => q.type === 'FILE');
            if (!hasFileField)
                messages.push({ embeds: [{ description: '📎 Dateien oder Screenshots kannst du jetzt hier im Kanal anhängen.', color: 0x64748b }] });
        }
        else {
            const first = this.questionMessage(t, cat, 0);
            if (first)
                messages.push(first);
        }
        effects.unshift({
            type: 'create', ticketId: t.id, guildId: d.guildId, name, parentId: cat.discordCategoryId, topic: `Ticket ${this.ref(t.number, settings)} · ${cat.name}${cat.confidential ? '' : ` · ${d.discordName} (${d.discordId})`}`,
            viewers: [{ id: d.discordId, kind: 'user', send: true }, ...staffRoles.map((id) => ({ id, kind: 'role', send: true }))], control, messages,
        });
        return { l, effects, warning };
    }
    /** Ticket aus dem Dashboard für einen Discord-Benutzer öffnen (Recht ticket.create). */
    async openFromDashboard(actor, d) {
        if (actor.userId)
            await this.perms.assert(actor.userId, 'ticket.create');
        const ch = await this.discord.channels();
        // aus Discord (/ticket mitglied:…): der Server, auf dem der Befehl kam – sonst der eingestellte Server
        const cat = await this.config.category(d.categoryId);
        const guildId = d.guildId ?? cat.guildId ?? (ch.guildId ?? process.env.DISCORD_GUILD_ID ?? '').split(/[\s,;]+/).find((g) => /^\d{15,25}$/.test(g));
        if (!guildId)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Trage zuerst die Discord-Server-ID unter Einstellungen → Discord-Bot-Kanäle ein.');
        return this.open({ categoryId: d.categoryId, guildId, discordId: d.discordId, discordName: d.discordName || d.discordId, memberRoleIds: [] }, actor, true);
    }
    /** Für /ticket im Discord: aktive Ticket-Arten (Voraussetzungen prüft der Bot vorab, das System beim Öffnen erneut). */
    async openableCategories(guildId) {
        const cats = await this.prisma.ticketCategory.findMany({ where: { active: true, ...(guildId ? { OR: [{ guildId }, { guildId: null }] } : {}) }, orderBy: [{ position: 'asc' }, { name: 'asc' }] });
        return cats.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, description: c.description, requiredRoleIds: c.requiredRoleIds, allowedUserIds: c.allowedUserIds }));
    }
    /** Bot meldet: Channel und Ticket-Embed sind angelegt. */
    async attachChannel(id, channelId, controlMessageId) {
        await this.prisma.supportTicket.update({ where: { id }, data: { channelId, controlMessageId, lastActivityAt: new Date() } }).catch(() => { throw new errors_1.AppError('NOT_FOUND', 'Ticket nicht gefunden.'); });
        return { ok: true };
    }
    /** Bot meldet: Channel konnte nicht angelegt werden → Ticket verwerfen. */
    async abort(id, reason) {
        const t = await this.prisma.supportTicket.findUnique({ where: { id } });
        if (t && !t.channelId)
            await this.prisma.supportTicket.update({ where: { id }, data: { deletedAt: new Date(), closedAt: new Date(), closeReason: `Kanal konnte nicht erstellt werden: ${reason}`.slice(0, 300) } });
        return { ok: true };
    }
    // ================= Fragen =================
    async answer(id, discordId, questionId, values) {
        const l = await this.load(id);
        if (l.t.creatorId !== discordId)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Nur der Ticket-Ersteller kann die Fragen beantworten.');
        if (this.isClosed(l))
            throw new errors_1.AppError('CONFLICT', 'Das Ticket ist geschlossen.');
        const qs = (0, shared_1.activeFields)(l.cat.questions);
        const q = qs[l.t.questionIndex];
        if (!q || q.id !== questionId)
            throw new errors_1.AppError('CONFLICT', 'Diese Frage wurde bereits beantwortet.');
        if (values === null && q.required)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Diese Frage ist Pflicht.');
        const clean = (values ?? []).map((v) => v.trim()).filter(Boolean);
        let value;
        if (values === null)
            value = '— (übersprungen)';
        else if (q.type === 'FILE')
            value = 'im Ticket-Kanal hochgeladen';
        else {
            // gleiche Prüfung wie im Formular (Länge, Auswahl, Zahl, Datum)
            const v = (0, shared_1.validateForm)([{ ...q, required: true }], { [q.id]: q.type === 'MULTI' ? clean : clean.join(', ') });
            if (!v.ok || !v.answers[0])
                throw new errors_1.AppError('VALIDATION_FAILED', v.errors[q.id] ?? 'Bitte eine Antwort angeben.');
            value = v.answers[0].value.slice(0, 2000);
        }
        const answers = [...(l.t.answers ?? []), { questionId: q.id, label: q.label, value }];
        const t = await this.prisma.supportTicket.update({ where: { id }, data: { answers: answers, questionIndex: { increment: 1 }, lastActivityAt: new Date() } });
        const effects = [];
        const next = this.questionMessage(t, l.cat, t.questionIndex);
        if (next)
            effects.push({ type: 'post', channelId: t.channelId, message: next });
        else {
            effects.push({ type: 'post', channelId: t.channelId, message: { embeds: [{ title: '📝 Angaben', color: l.cat.color, fields: answers.slice(0, 25).map((a) => ({ name: a.label.slice(0, 256), value: (a.value || '—').slice(0, 1024) })) }] } });
            await this.logAction({ ...l, t }, 'answers', { userId: null, discordId, name: t.creatorName, viaBot: true }, { count: answers.length }, effects);
        }
        return { answer: value, done: !next, effects };
    }
    // ================= Aktionen =================
    async action(id, actor, input) {
        const l = await this.load(id);
        const perm = input.action === 'status' ? await this.statusPerm(input.statusId) : (0, exports.permissionFor)(input.action);
        await this.assertCan(actor, perm, l.cat, l.dept, l.t);
        const effects = [];
        const message = await this.perform(l, actor, input, effects);
        return { ok: true, message, ticket: this.summary(await this.load(id).catch(() => l)), effects: await this.dispatch(effects, actor.viaBot) };
    }
    /** Ersteller schließt sein eigenes Ticket (falls in der Kategorie erlaubt). */
    async creatorClose(id, discordId, reason) {
        const l = await this.load(id);
        if (l.t.creatorId !== discordId)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Dazu fehlt dir die Berechtigung.');
        if (!l.cat.creatorCanClose)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Dieses Ticket kann nur das Team schließen.');
        const effects = [];
        const message = await this.perform(l, { userId: l.t.creatorUserId, discordId, name: l.t.creatorName, viaBot: true }, { action: 'close', reason }, effects);
        return { ok: true, message, effects };
    }
    /** Antwort des Erstellers auf „Schließen anfragen“. */
    async closeRequestAnswer(id, discordId, accept) {
        const l = await this.load(id);
        if (l.t.creatorId !== discordId)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Nur der Ersteller kann das beantworten.');
        this.requireOpen(l);
        if (!l.t.closeRequestedAt)
            throw new errors_1.AppError('CONFLICT', 'Es gibt keine offene Anfrage zum Schließen.');
        const effects = [];
        await this.prisma.supportTicket.update({ where: { id }, data: { closeRequestedAt: null, lastActivityAt: new Date() } });
        const creator = { userId: l.t.creatorUserId, discordId, name: l.t.creatorName, viaBot: true };
        if (accept && l.cat.closeRequestCloses) {
            await this.close(l, creator, 'Vom Ersteller bestätigt (Schließen angefragt)', effects);
            return { ok: true, message: 'Ticket geschlossen – danke!', effects: await this.dispatch(effects, true) };
        }
        const ch = l.t.channelId;
        if (ch)
            effects.push({ type: 'post', channelId: ch, message: { content: l.t.claimers.map(mention).join(' ') || undefined, mentionUsers: l.t.claimers,
                    embeds: [{ description: accept ? `✅ ${mention(discordId)} ist einverstanden – das Ticket kann geschlossen werden.` : `✖️ ${mention(discordId)} möchte das Ticket **offen lassen**.`, color: accept ? 0x22c55e : 0x64748b }] } });
        await this.logAction(l, accept ? 'close_request_accepted' : 'close_request_declined', creator, {}, effects);
        return { ok: true, message: accept ? 'Danke! Das Team schließt das Ticket.' : 'Alles klar, das Ticket bleibt offen.', effects: await this.dispatch(effects, true) };
    }
    /** Ersteller fügt eine Person hinzu (wenn in der Kategorie erlaubt). */
    async creatorAdd(id, discordId, targetId) {
        const l = await this.load(id);
        if (l.t.creatorId !== discordId)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Dazu fehlt dir die Berechtigung.');
        if (!l.cat.creatorCanAddUsers)
            throw new errors_1.AppError('PERMISSION_DENIED', 'In diesem Ticket kann nur das Team Personen hinzufügen.');
        const effects = [];
        const message = await this.perform(l, { userId: l.t.creatorUserId, discordId, name: l.t.creatorName, viaBot: true }, { action: 'add_access', targetId, kind: 'USER' }, effects);
        return { ok: true, message, effects };
    }
    /** Ticketauslastung: Panels mit „Auslastung anzeigen“, die diese Kategorie enthalten, neu zeichnen. */
    async panelLoad(categoryId, effects) {
        const panels = await this.prisma.ticketPanel.findMany({ where: { showLoad: true, messageId: { not: null }, categoryIds: { has: categoryId } } });
        for (const p of panels)
            effects.push({ type: 'panel', panelId: p.id, channelId: p.messageChannelId, messageId: p.messageId, message: await this.panelMessage(p.id) });
    }
    requireOpen(l) { if (this.isClosed(l))
        throw new errors_1.AppError('CONFLICT', 'Das Ticket ist geschlossen.'); }
    async statusPerm(statusId) {
        const s = await this.prisma.ticketStatus.findUnique({ where: { id: statusId } });
        return s ? (0, shared_1.statusPermission)(s) : 'ticket.change_status';
    }
    /**
     * Datenänderung bei jedem Statuswechsel (zentral): Wartezeit auf den Nutzer (SLA ruht), Zeitpunkt „gelöst“, neue Lösungsfrist.
     */
    statusData(l, to, now = new Date()) {
        const t = l.t;
        const data = { statusId: to.id };
        let waitingSeconds = t.waitingSeconds;
        if (to.key === 'WAITING_USER' && !t.waitingSince)
            data.waitingSince = now;
        if (to.key !== 'WAITING_USER' && t.waitingSince) {
            waitingSeconds += Math.max(0, Math.round((now.getTime() - t.waitingSince.getTime()) / 1000));
            data.waitingSince = null;
            data.waitingSeconds = waitingSeconds;
            const sla = (0, shared_1.slaState)({ ...t, waitingSince: null, waitingSeconds, firstResponseMinutes: l.priority?.firstResponseMinutes ?? null, resolutionMinutes: l.priority?.resolutionMinutes ?? null }, now);
            data.resolveDueAt = sla.resolveDueAt;
        }
        if (to.key === 'RESOLVED')
            data.resolvedAt = now;
        return data;
    }
    statusByKey(key) { return this.prisma.ticketStatus.findUnique({ where: { key } }); }
    /** Ist das Discord-Konto ein Mitarbeiter mit Zugriff auf dieses Ticket? (Zuweisen, Bearbeiter-Prüfung nach Wechseln) */
    async staffWithAccess(discordId, cat, dept) {
        const link = await this.prisma.discordLink.findUnique({ where: { discordId } });
        if (!link)
            return null;
        if (await this.perms.has(link.userId, 'ticket.manage'))
            return link.userId;
        if (!(await this.perms.has(link.userId, 'ticket.claim')))
            return null;
        return (await this.categoryVisible(link.userId, cat, dept)) ? link.userId : null;
    }
    /** Nach Kategorie-/Abteilungswechsel: Bearbeiter ohne Zugriff entfernen (vertrauliche Inhalte nicht versehentlich offenlegen). */
    async revalidateClaimers(l, cat, dept, effects) {
        const keep = [], removed = [];
        for (const c of l.t.claimers)
            ((await this.staffWithAccess(c, cat, dept)) ? keep : removed).push(c);
        if (!removed.length)
            return removed;
        await this.prisma.supportTicket.update({ where: { id: l.t.id }, data: { claimers: keep } });
        if (l.t.channelId)
            for (const r of removed)
                effects.push({ type: 'access', channelId: l.t.channelId, targetId: r, kind: 'user', view: null });
        return removed;
    }
    /** Rollen-Zugriff im Kanal von alter auf neue Zuständigkeit umstellen (nur Differenzen). */
    async moveRoleAccess(l, toCat, toDept, effects) {
        const ch = l.t.channelId;
        if (!ch)
            return;
        const before = new Set([...(await this.routing(l.cat, l.dept, l.settings)).responsible, ...l.cat.extraRoleIds]);
        const after = new Set([...(await this.routing(toCat, toDept, l.settings)).responsible, ...toCat.extraRoleIds]);
        for (const r of before)
            if (!after.has(r))
                effects.push({ type: 'access', channelId: ch, targetId: r, kind: 'role', view: null });
        for (const r of after)
            if (!before.has(r))
                effects.push({ type: 'access', channelId: ch, targetId: r, kind: 'role', view: true, send: true });
    }
    actorTag(actor) { return actor.discordId ? mention(actor.discordId) : actor.name; }
    async perform(l, actor, input, effects) {
        const { t } = l;
        const ch = t.channelId;
        const post = (message) => { if (ch)
            effects.push({ type: 'post', channelId: ch, message }); };
        const refresh = async () => { const fresh = await this.load(t.id); if (ch)
            effects.push({ type: 'control', ticketId: t.id, channelId: ch, messageId: fresh.t.controlMessageId, message: this.control(fresh) }); return fresh; };
        const users = async () => [t.creatorId, ...(await this.prisma.ticketAccess.findMany({ where: { ticketId: t.id, kind: 'USER' } })).map((a) => a.targetId)];
        switch (input.action) {
            case 'close': {
                this.requireOpen(l);
                const reason = input.reason?.trim() || null;
                if (l.cat.closeReasonMode === 'REQUIRED' && !reason)
                    throw new errors_1.AppError('VALIDATION_FAILED', 'Bitte einen Grund für das Schließen angeben.');
                await this.close(l, actor, l.cat.closeReasonMode === 'NONE' ? null : reason, effects);
                return 'Ticket geschlossen.';
            }
            case 'close_request': {
                this.requireOpen(l);
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { closeRequestedAt: new Date() } });
                post({ content: mention(t.creatorId), mentionUsers: [t.creatorId], embeds: [{ title: '❓ Kann dieses Ticket geschlossen werden?', description: `${this.actorTag(actor)} möchte das Ticket schließen. Ist dein Anliegen erledigt?`, color: 0xf59e0b }],
                    buttons: [{ id: `tk:creq:${t.id}:yes`, label: 'Ja, schließen', emoji: '✅', style: 'success' }, { id: `tk:creq:${t.id}:no`, label: 'Nein, offen lassen', emoji: '✖️', style: 'secondary' }] });
                await this.logAction(l, 'close_requested', actor, {}, effects, `❓ Schließen angefragt von ${this.actorTag(actor)}`);
                return 'Der Ersteller wurde gefragt.';
            }
            case 'reopen': {
                if (!this.isClosed(l))
                    throw new errors_1.AppError('CONFLICT', 'Das Ticket ist bereits offen.');
                if (!l.cat.allowReopen)
                    throw new errors_1.AppError('CONFLICT', 'Tickets dieser Art können nicht wieder geöffnet werden.');
                if (l.status.kind === 'ARCHIVED' && !actor.system && actor.userId && !(await this.perms.has(actor.userId, 'ticket.archive')) && !(await this.perms.has(actor.userId, 'ticket.manage')))
                    throw new errors_1.AppError('PERMISSION_DENIED', 'Archivierte Tickets darf nur öffnen, wer archivieren darf.');
                const status = await this.prisma.ticketStatus.findFirst({ where: { isDefault: true } }) ?? await this.prisma.ticketStatus.findFirstOrThrow({ where: { kind: 'OPEN' } });
                const bad = (0, shared_1.checkStatusChange)(l.status, status, 'reopen');
                if (bad)
                    throw new errors_1.AppError('CONFLICT', bad);
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { statusId: status.id, closedAt: null, closedById: null, closedByName: null, closeReason: null, deleteAt: null, warnedAt: null, archivedAt: null, resolvedAt: null, lastActivityAt: new Date() } });
                if (ch)
                    for (const u of await users())
                        effects.push({ type: 'access', channelId: ch, targetId: u, kind: 'user', view: true, send: !t.locked });
                post({ embeds: [{ description: (0, shared_1.renderTicketText)(l.settings.reopenedMessage, this.vars(l, { '{actor}': this.actorTag(actor) })), color: 0x22c55e }] });
                await refresh();
                await this.logAction(l, 'reopened', actor, {}, effects, `🔓 Wieder geöffnet von ${this.actorTag(actor)}`);
                await this.panelLoad(l.cat.id, effects);
                await this.queueNotify(l, 'reopened', effects, `🔓 Ticket **${this.ref(t.number, l.settings)}** wieder geöffnet von ${actor.name}`);
                return 'Ticket wieder geöffnet.';
            }
            case 'claim': {
                this.requireOpen(l);
                if (!actor.discordId)
                    throw new errors_1.AppError('VALIDATION_FAILED', 'Zum Übernehmen muss dein Konto mit Discord verknüpft sein.');
                if (t.claimers.includes(actor.discordId))
                    throw new errors_1.AppError('CONFLICT', 'Du bearbeitest dieses Ticket bereits.');
                let claimers = [...t.claimers, actor.discordId];
                if (l.cat.claimMode === 'SINGLE' && t.claimers.length) {
                    if (!actor.userId || !(await this.perms.has(actor.userId, 'ticket.manage')))
                        throw new errors_1.AppError('CONFLICT', `Das Ticket wird bereits von ${t.claimers.map(mention).join(', ')} bearbeitet.`);
                    claimers = [actor.discordId]; // Leitung übernimmt
                }
                const claimedStatus = l.status.isDefault ? await this.prisma.ticketStatus.findFirst({ where: { isClaimed: true, kind: 'OPEN' } }) : null;
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { claimers, ...(claimedStatus ? this.statusData(l, claimedStatus) : {}), firstResponseAt: t.firstResponseAt ?? new Date() } });
                const fresh = await refresh();
                await this.queueNotify(fresh, 'claimed', effects, `👤 Ticket **${this.ref(t.number, l.settings)}** übernommen von ${actor.name}`, claimers.filter((c) => c !== actor.discordId));
                // 🎫 Ticket übernommen → Ersteller (falls mit einem Dashboard-Konto verknüpft)
                if (t.creatorUserId && t.creatorUserId !== actor.userId)
                    await this.notify.notify([t.creatorUserId], { type: 'TICKET_CLAIMED', title: `🎫 Dein Ticket ${(0, shared_1.ticketNumber)(t.number)} wurde übernommen`, body: `Bearbeiter: ${this.actorTag(actor)}`, entityType: 'SupportTicket', entityId: t.id });
                const text = (0, shared_1.renderTicketText)(l.cat.claimMessage || '👤 Bearbeiter: {staff}', this.vars(fresh, { '{actor}': this.actorTag(actor) }));
                post({ content: l.cat.claimNotifyStaff ? l.cat.staffRoleIds.map((r) => `<@&${r}>`).join(' ') || undefined : undefined, mentionRoles: l.cat.claimNotifyStaff ? l.cat.staffRoleIds : [], embeds: [{ description: text, color: l.cat.color }] });
                if (ch && !t.claimers.length && l.cat.claimDiscordCategoryId)
                    effects.push({ type: 'move', channelId: ch, parentId: l.cat.claimDiscordCategoryId });
                if (ch && l.cat.claimLocksChat) {
                    // nur noch Bearbeiter, Ersteller und Zusatzrollen schreiben
                    for (const r of l.cat.staffRoleIds.filter((x) => !l.cat.extraRoleIds.includes(x)))
                        effects.push({ type: 'access', channelId: ch, targetId: r, kind: 'role', view: true, send: false });
                    effects.push({ type: 'access', channelId: ch, targetId: actor.discordId, kind: 'user', view: true, send: true });
                }
                await this.logAction(l, t.claimers.length && l.cat.claimMode === 'SINGLE' ? 'claim_transferred' : 'claimed', actor, { claimers }, effects, `👤 Übernommen von ${this.actorTag(actor)}`);
                return 'Ticket übernommen.';
            }
            case 'unclaim': {
                const target = input.targetId ?? actor.discordId;
                if (!target || !t.claimers.includes(target))
                    throw new errors_1.AppError('CONFLICT', 'Diese Person bearbeitet das Ticket nicht.');
                if (target !== actor.discordId && !actor.system && (!actor.userId || !(await this.perms.has(actor.userId, 'ticket.manage'))))
                    throw new errors_1.AppError('PERMISSION_DENIED', 'Nur die Leitung kann andere Bearbeiter entfernen.');
                const claimers = t.claimers.filter((c) => c !== target);
                const def = !claimers.length && l.status.isClaimed ? await this.prisma.ticketStatus.findFirst({ where: { isDefault: true } }) : null;
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { claimers, ...(def ? { statusId: def.id } : {}) } });
                await refresh();
                post({ embeds: [{ description: `↩️ ${mention(target)} bearbeitet dieses Ticket nicht mehr.`, color: 0x64748b }] });
                if (ch && l.cat.claimLocksChat)
                    effects.push({ type: 'access', channelId: ch, targetId: target, kind: 'user', view: null });
                if (ch && !claimers.length) {
                    if (l.cat.claimDiscordCategoryId)
                        effects.push({ type: 'move', channelId: ch, parentId: l.cat.discordCategoryId });
                    if (l.cat.claimLocksChat)
                        for (const r of l.cat.staffRoleIds)
                            effects.push({ type: 'access', channelId: ch, targetId: r, kind: 'role', view: true, send: true });
                }
                await this.logAction(l, 'unclaimed', actor, { target }, effects, `↩️ Freigegeben (${mention(target)})`);
                return 'Ticket freigegeben.';
            }
            case 'add_access': {
                this.requireOpen(l);
                if (input.kind === 'USER' && input.targetId === t.creatorId)
                    throw new errors_1.AppError('CONFLICT', 'Das ist der Ersteller des Tickets.');
                const expiresAt = input.minutes ? new Date(Date.now() + input.minutes * 60_000) : null;
                await this.prisma.ticketAccess.upsert({ where: { ticketId_targetId: { ticketId: t.id, targetId: input.targetId } }, create: { ticketId: t.id, targetId: input.targetId, kind: input.kind, expiresAt, addedById: actor.discordId }, update: { kind: input.kind, expiresAt } });
                if (ch)
                    effects.push({ type: 'access', channelId: ch, targetId: input.targetId, kind: input.kind === 'USER' ? 'user' : 'role', view: true, send: input.kind === 'ROLE' || !t.locked });
                const who = input.kind === 'USER' ? mention(input.targetId) : `<@&${input.targetId}>`;
                post({ embeds: [{ description: `➕ ${who} wurde hinzugefügt${expiresAt ? ` (bis ${this.fmt(expiresAt, l.tz)})` : ''}.`, color: 0x22c55e }] });
                await this.logAction(l, input.kind === 'USER' ? 'user_added' : 'role_added', actor, { target: input.targetId, expiresAt }, effects, `➕ ${who} hinzugefügt`);
                return `${input.kind === 'USER' ? 'Benutzer' : 'Rolle'} hinzugefügt.`;
            }
            case 'remove_access': {
                const a = await this.prisma.ticketAccess.findUnique({ where: { ticketId_targetId: { ticketId: t.id, targetId: input.targetId } } });
                if (!a)
                    throw new errors_1.AppError('NOT_FOUND', 'Dieser Benutzer bzw. diese Rolle wurde nicht zum Ticket hinzugefügt.');
                await this.prisma.ticketAccess.delete({ where: { id: a.id } });
                if (ch)
                    effects.push({ type: 'access', channelId: ch, targetId: a.targetId, kind: a.kind === 'USER' ? 'user' : 'role', view: null });
                const who = a.kind === 'USER' ? mention(a.targetId) : `<@&${a.targetId}>`;
                post({ embeds: [{ description: `➖ ${who} wurde entfernt.`, color: 0x64748b }] });
                await this.logAction(l, a.kind === 'USER' ? 'user_removed' : 'role_removed', actor, { target: a.targetId }, effects, `➖ ${who} entfernt`);
                return 'Entfernt.';
            }
            case 'priority': {
                const p = await this.prisma.ticketPriority.findUnique({ where: { id: input.priorityId } });
                if (!p)
                    throw new errors_1.AppError('NOT_FOUND', 'Priorität nicht gefunden.');
                if (p.allowedRoleNames.length && actor.userId && !(await this.perms.has(actor.userId, 'ticket.manage'))) {
                    const roles = await this.prisma.userRole.findMany({ where: { userId: actor.userId }, include: { role: { select: { name: true } } } });
                    if (!roles.some((r) => p.allowedRoleNames.includes(r.role.name)))
                        throw new errors_1.AppError('PERMISSION_DENIED', `Du darfst die Priorität „${p.name}“ nicht setzen.`);
                }
                const sla = (0, shared_1.slaState)({ ...t, firstResponseMinutes: p.firstResponseMinutes, resolutionMinutes: p.resolutionMinutes });
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { priorityId: p.id, firstResponseDueAt: sla.firstDueAt, resolveDueAt: sla.resolveDueAt, slaFirstWarnedAt: null, slaResolveWarnedAt: null, slaEscalatedAt: null } });
                await refresh();
                await this.queueNotify(l, 'priority', effects, `🔔 Ticket **${this.ref(t.number, l.settings)}**: Priorität → ${p.name}`);
                post({ content: p.notifyRoleIds.map((r) => `<@&${r}>`).join(' ') || undefined, mentionRoles: p.notifyRoleIds, embeds: [{ description: `🔔 Priorität: **${`${p.emoji} ${p.name}`.trim()}** (von ${this.actorTag(actor)})`, color: p.color }] });
                await this.logAction(l, 'priority_changed', actor, { from: l.priority?.name ?? null, to: p.name }, effects, `🔔 Priorität → ${p.name}`);
                return `Priorität: ${p.name}`;
            }
            case 'status': {
                const s = await this.prisma.ticketStatus.findUnique({ where: { id: input.statusId } });
                if (!s)
                    throw new errors_1.AppError('NOT_FOUND', 'Status nicht gefunden.');
                if (s.id === l.status.id)
                    throw new errors_1.AppError('CONFLICT', 'Das Ticket hat diesen Status bereits.');
                const bad = (0, shared_1.checkStatusChange)(l.status, s, 'status');
                if (bad)
                    throw new errors_1.AppError('CONFLICT', bad);
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { ...this.statusData(l, s), ...(s.kind === 'ARCHIVED' ? { archivedAt: new Date() } : {}) } });
                await refresh();
                post({ embeds: [{ description: `🏷️ Status: **${`${s.emoji} ${s.name}`.trim()}** (von ${this.actorTag(actor)})`, color: s.color }] });
                await this.logAction(l, 'status_changed', actor, { from: l.status.name, to: s.name }, effects, `🏷️ Status → ${s.name}`);
                return `Status: ${s.name}`;
            }
            case 'category': {
                const to = await this.config.category(input.categoryId);
                if (to.id === l.cat.id)
                    throw new errors_1.AppError('CONFLICT', 'Das Ticket ist bereits in dieser Kategorie.');
                if (to.archivedAt)
                    throw new errors_1.AppError('CONFLICT', 'Diese Kategorie ist archiviert.');
                // neue Abteilung: die der Zielkategorie (sonst bleibt die bisherige)
                const toDept = to.departmentId ? await this.config.department(to.departmentId) : l.dept;
                await this.assertCan(actor, 'ticket.change_category', to, toDept, t);
                await this.assertConfidentialMove(actor, l, to);
                await this.moveRoleAccess(l, to, toDept, effects);
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { categoryId: to.id, departmentId: toDept?.id ?? null } });
                if (ch && to.discordCategoryId && to.discordCategoryId !== l.cat.discordCategoryId)
                    effects.push({ type: 'move', channelId: ch, parentId: to.discordCategoryId });
                const removed = await this.revalidateClaimers(l, to, toDept, effects);
                await refresh();
                if (removed.length)
                    post({ embeds: [{ description: `↩️ ${removed.map(mention).join(', ')} ${removed.length === 1 ? 'hat' : 'haben'} keinen Zugriff auf die neue Kategorie und wurde${removed.length === 1 ? '' : 'n'} als Bearbeiter entfernt.`, color: 0x64748b }] });
                post({ content: to.mentionStaff ? to.staffRoleIds.map((r) => `<@&${r}>`).join(' ') || undefined : undefined, mentionRoles: to.mentionStaff ? to.staffRoleIds : [], embeds: [{ description: `🗂️ Kategorie geändert: **${l.cat.name}** → **${to.name}**`, color: to.color }] });
                await this.logAction(l, 'category_changed', actor, { from: l.cat.name, to: to.name }, effects, `🗂️ Kategorie → ${to.name}`);
                return `Kategorie: ${to.name}`;
            }
            case 'rename': {
                const name = (0, shared_1.ticketChannelName)(input.name, this.vars(l));
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { name } });
                if (ch)
                    effects.push({ type: 'rename', channelId: ch, name });
                await this.logAction(l, 'renamed', actor, { from: t.name, to: name }, effects, `✏️ Umbenannt → ${name}`);
                return `Umbenannt in ${name}.`;
            }
            case 'move': {
                if (ch)
                    effects.push({ type: 'move', channelId: ch, parentId: input.parentId });
                await this.logAction(l, 'moved', actor, { parentId: input.parentId }, effects, '📁 Verschoben');
                return 'Ticket verschoben.';
            }
            case 'transcript': {
                // neue Version im Hintergrund; der Link/die Datei kommt, sobald sie fertig ist
                const targets = [...new Set([ch, l.cat.transcriptChannelId ?? l.settings.transcriptChannelId].filter((x) => !!x))];
                const { transcript: tr } = await this.transcriptsSvc.enqueue(t.id, { trigger: 'manual', actor: { id: actor.discordId ?? actor.userId, name: actor.name }, notify: { channelIds: targets, message: `📋 Transkript für Ticket **${this.ref(t.number, l.settings)}** erstellt (angefordert von ${actor.name}).` } });
                await this.logAction(l, 'transcript_requested', actor, { transcriptId: tr.id, version: tr.version }, effects, '📋 Transkript angefordert');
                return `Transkript (Version ${tr.version}) wird erstellt – es erscheint gleich im Ticket und im Dashboard.`;
            }
            case 'transcript_retry': {
                const tr = await this.prisma.ticketTranscript.findUnique({ where: { id: input.transcriptId } });
                if (!tr || tr.ticketId !== t.id)
                    throw new errors_1.AppError('NOT_FOUND', 'Transkript nicht gefunden.');
                await this.transcriptsSvc.retry(tr.id);
                await this.logAction(l, 'transcript_retry', actor, { transcriptId: tr.id, version: tr.version }, effects);
                return `Transkript-Version ${tr.version} wird erneut erstellt.`;
            }
            case 'assign': {
                this.requireOpen(l);
                const userId = await this.staffWithAccess(input.targetId, l.cat, l.dept);
                if (!userId)
                    throw new errors_1.AppError('VALIDATION_FAILED', 'Diese Person ist kein Teammitglied mit Zugriff auf Tickets dieser Art (Discord-Konto verknüpft, Recht ticket.claim, passende Rolle).');
                if (t.claimers[0] === input.targetId && (l.cat.claimMode !== 'MULTI' || t.claimers.length === 1))
                    throw new errors_1.AppError('CONFLICT', 'Diese Person bearbeitet das Ticket bereits.');
                const claimers = l.cat.claimMode === 'SINGLE' ? [input.targetId] : [input.targetId, ...t.claimers.filter((c) => c !== input.targetId)];
                const claimedStatus = l.status.isDefault ? await this.prisma.ticketStatus.findFirst({ where: { isClaimed: true, kind: 'OPEN' } }) : null;
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { claimers, ...(claimedStatus ? this.statusData(l, claimedStatus) : {}) } });
                if (ch) {
                    for (const old of t.claimers.filter((c) => !claimers.includes(c)))
                        if (l.cat.claimLocksChat)
                            effects.push({ type: 'access', channelId: ch, targetId: old, kind: 'user', view: null });
                    if (l.cat.claimLocksChat)
                        effects.push({ type: 'access', channelId: ch, targetId: input.targetId, kind: 'user', view: true, send: true });
                }
                const fresh = await refresh();
                post({ content: mention(input.targetId), mentionUsers: [input.targetId], embeds: [{ description: `🧭 ${mention(input.targetId)} ist jetzt zuständig (zugewiesen von ${this.actorTag(actor)}).`, color: l.cat.color }] });
                await this.logAction(l, 'assigned', actor, { from: t.claimers.join(', ') || null, to: input.targetId, claimers }, effects, `🧭 Zugewiesen an ${mention(input.targetId)}`);
                await this.queueNotify(fresh, 'assigned', effects, `🧭 Dir wurde Ticket **${this.ref(t.number, l.settings)}** zugewiesen (${l.cat.name}).`, [input.targetId]);
                return 'Ticket zugewiesen.';
            }
            case 'department': {
                const to = await this.config.department(input.departmentId);
                if (!to || !to.active)
                    throw new errors_1.AppError('NOT_FOUND', 'Abteilung nicht gefunden oder deaktiviert.');
                if (to.id === t.departmentId)
                    throw new errors_1.AppError('CONFLICT', 'Das Ticket ist bereits in dieser Abteilung.');
                // Zugriff auf das Ziel prüfen: nur wer das Ticket danach noch sehen darf, darf es dorthin verschieben (oder ticket.manage)
                await this.assertCan(actor, 'ticket.change_department', l.cat, to, t);
                await this.moveRoleAccess(l, l.cat, to, effects);
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { departmentId: to.id, unassignedEscalatedAt: null } });
                const removed = await this.revalidateClaimers(l, l.cat, to, effects);
                const fresh = await refresh();
                post({ embeds: [{ description: `🏢 Abteilung: **${l.dept?.name ?? '—'}** → **${to.name}**${removed.length ? `\n↩️ ${removed.map(mention).join(', ')} ohne Zugriff – als Bearbeiter entfernt.` : ''}`, color: l.cat.color }] });
                await this.logAction(l, 'department_changed', actor, { from: l.dept?.name ?? null, to: to.name, departmentId: to.id }, effects, `🏢 Abteilung → ${to.name}`);
                await this.queueNotify(fresh, 'assigned', effects, `🏢 Ticket **${this.ref(t.number, l.settings)}** wurde an **${to.name}** übergeben.`);
                return `Abteilung: ${to.name}`;
            }
            case 'request_info': {
                this.requireOpen(l);
                if (!ch)
                    throw new errors_1.AppError('CONFLICT', 'Das Ticket hat (noch) keinen Discord-Kanal.');
                const waiting = await this.statusByKey('WAITING_USER');
                post({ content: mention(t.creatorId), mentionUsers: [t.creatorId], embeds: [{ title: '❔ Rückfrage vom Team', description: input.text, color: 0xeab308, footer: `${actor.name} · Bitte antworte hier im Ticket.` }] });
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { ...(waiting && waiting.id !== l.status.id ? this.statusData(l, waiting) : {}), lastActivityAt: new Date(), firstResponseAt: t.firstResponseAt ?? new Date() } });
                await refresh();
                await this.logAction(l, 'info_requested', actor, {}, effects, `❔ Rückfrage an den Ersteller (${this.actorTag(actor)})`);
                await this.queueNotify(l, 'info_requested', effects, `❔ Rückfrage zu Ticket **${this.ref(t.number, l.settings)}** gestellt von ${actor.name}`);
                return 'Rückfrage gesendet – das Ticket wartet auf den Nutzer.';
            }
            case 'archive': {
                const st = await this.statusByKey('ARCHIVED') ?? await this.prisma.ticketStatus.findFirst({ where: { kind: 'ARCHIVED' }, orderBy: { position: 'asc' } });
                if (!st)
                    throw new errors_1.AppError('CONFLICT', 'Kein Archiv-Status eingerichtet (Tickets → Status & Prioritäten).');
                const bad = (0, shared_1.checkStatusChange)(l.status, st, 'archive');
                if (bad)
                    throw new errors_1.AppError('CONFLICT', bad);
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { statusId: st.id, archivedAt: new Date() } });
                await refresh();
                await this.logAction(l, 'archived', actor, { from: l.status.name, to: st.name }, effects, `📦 Archiviert von ${this.actorTag(actor)}`);
                return 'Ticket archiviert (bleibt vollständig gespeichert und abrufbar).';
            }
            case 'lock':
            case 'unlock': {
                this.requireOpen(l);
                const locked = input.action === 'lock';
                if (t.locked === locked)
                    throw new errors_1.AppError('CONFLICT', locked ? 'Das Ticket ist bereits gesperrt.' : 'Das Ticket ist nicht gesperrt.');
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { locked } });
                if (ch)
                    for (const u of await users())
                        effects.push({ type: 'access', channelId: ch, targetId: u, kind: 'user', view: true, send: !locked });
                await refresh();
                post({ embeds: [{ description: locked ? `⛔ Ticket gesperrt – nur das Team kann schreiben. (${this.actorTag(actor)})` : `✅ Ticket entsperrt. (${this.actorTag(actor)})`, color: locked ? 0xef4444 : 0x22c55e }] });
                await this.logAction(l, locked ? 'locked' : 'unlocked', actor, {}, effects, locked ? '⛔ Gesperrt' : '✅ Entsperrt');
                return locked ? 'Ticket gesperrt.' : 'Ticket entsperrt.';
            }
            case 'escalate': {
                this.requireOpen(l);
                const [status, prio] = await Promise.all([
                    this.prisma.ticketStatus.findFirst({ where: { isEscalation: true, kind: 'OPEN' } }),
                    l.cat.escalationPriorityId ? this.prisma.ticketPriority.findUnique({ where: { id: l.cat.escalationPriorityId } }) : Promise.resolve(null),
                ]);
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { escalatedAt: new Date(), ...(status ? this.statusData(l, status) : {}), ...(prio && (!l.priority || prio.position > l.priority.position) ? { priorityId: prio.id } : {}) } });
                const fresh = await refresh();
                const roles = [...new Set([...l.cat.escalationRoleIds, ...l.cat.staffRoleIds])];
                post({ content: roles.map((r) => `<@&${r}>`).join(' ') || undefined, mentionRoles: roles, embeds: [{ title: '🟠 Ticket eskaliert', description: (0, shared_1.renderTicketText)(l.cat.escalationMessage || 'Dieses Ticket wurde eskaliert. {staff}', this.vars(fresh, { '{actor}': this.actorTag(actor) })), color: 0xf97316 }] });
                await this.logAction(l, 'escalated', actor, { status: status?.name ?? null, priority: prio?.name ?? null }, effects, `🟠 Eskaliert von ${this.actorTag(actor)}`);
                await this.queueNotify(fresh, 'escalated', effects, `🟠 Ticket **${this.ref(t.number, l.settings)}** wurde eskaliert (${actor.name}).`, undefined, true);
                return 'Ticket eskaliert.';
            }
            case 'note': {
                await this.prisma.ticketNote.create({ data: { ticketId: t.id, authorId: actor.discordId, authorUserId: actor.userId, authorName: actor.name, text: input.text } });
                await this.logAction(l, 'note_added', actor, {}, effects); // Inhalt bleibt intern (nicht im Log-Channel)
                return 'Interne Notiz gespeichert (nur für berechtigte Mitarbeiter sichtbar).';
            }
            case 'reply': {
                this.requireOpen(l);
                if (!ch)
                    throw new errors_1.AppError('CONFLICT', 'Das Ticket hat (noch) keinen Discord-Kanal.');
                // Der Bot schreibt die Antwort in den Ticket-Kanal; der Mitschnitt übernimmt sie in den Verlauf
                post({ embeds: [{ author: actor.name.slice(0, 100), description: input.text, color: l.cat.color, footer: 'Antwort über das Dashboard' }] });
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { lastActivityAt: new Date(), warnedAt: null, staffAlertedAt: null, firstResponseAt: t.firstResponseAt ?? new Date() } });
                await this.logAction(l, 'replied', actor, {}, effects);
                return 'Antwort gesendet – sie erscheint gleich im Discord-Kanal und im Verlauf.';
            }
            case 'rating': {
                effects.push(this.ratingRequest(l));
                await this.logAction(l, 'rating_requested', actor, {}, effects);
                return 'Bewertungsanfrage an den Ersteller gesendet.';
            }
            case 'delete': {
                if (l.cat.transcriptOnClose && !(await this.prisma.ticketTranscript.count({ where: { ticketId: t.id } }))) {
                    const target = l.cat.transcriptChannelId ?? l.settings.transcriptChannelId;
                    // der Verlauf liegt in der Datenbank – das Transkript entsteht auch nach dem Löschen des Kanals
                    await this.transcriptsSvc.enqueue(t.id, { trigger: 'delete', key: `delete:${t.id}`, actor: { id: actor.discordId ?? actor.userId, name: actor.name }, notify: { channelIds: target ? [target] : [] } });
                }
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { deletedAt: new Date(), ...(t.closedAt ? {} : { closedAt: new Date(), closedById: actor.discordId, closedByName: actor.name }) } });
                if (ch) {
                    post({ embeds: [{ description: '🗑️ Dieses Ticket wird in 5 Sekunden gelöscht.', color: 0xef4444 }] });
                    effects.push({ type: 'delete', channelId: ch, delayMs: 5000 });
                }
                await this.logAction(l, 'deleted', actor, {}, effects, `🗑️ Gelöscht von ${this.actorTag(actor)}`);
                return 'Ticket wird gelöscht.';
            }
        }
    }
    /** Schließen (auch für Ersteller und Automatik): Status, Rechte, CLOSED-Anzeige, Transcript, Bewertung, Löschplanung. */
    async close(l, actor, reason, effects) {
        const { t } = l;
        const status = await this.prisma.ticketStatus.findFirst({ where: { isClose: true } }) ?? await this.prisma.ticketStatus.findFirst({ where: { kind: 'CLOSED' }, orderBy: { position: 'asc' } });
        if (!status)
            throw new errors_1.AppError('CONFLICT', 'Kein „Geschlossen“-Status eingerichtet (Dashboard → Tickets → Einstellungen).');
        const now = new Date();
        const del = l.cat.deleteAfterMinutes;
        const bad = (0, shared_1.checkStatusChange)(l.status, status, 'close');
        if (bad)
            throw new errors_1.AppError('CONFLICT', bad);
        const updated = await this.prisma.supportTicket.update({ where: { id: t.id }, data: {
                ...this.statusData(l, status, now), closedAt: now, closedById: actor.discordId, closedByName: actor.name, closeReason: reason, deleteAt: del > 0 ? new Date(now.getTime() + del * 60_000) : null,
            } });
        const fresh = { ...l, t: updated, status };
        const ch = t.channelId;
        if (ch && l.cat.closeRemovesAccess) {
            const users = [t.creatorId, ...(await this.prisma.ticketAccess.findMany({ where: { ticketId: t.id, kind: 'USER' } })).map((a) => a.targetId)];
            for (const u of users)
                effects.push({ type: 'access', channelId: ch, targetId: u, kind: 'user', view: false });
        }
        const v = this.vars(fresh, { '{closed_by}': this.actorTag(actor), '{reason}': reason ?? '—', '{actor}': this.actorTag(actor) });
        if (ch) {
            effects.push({ type: 'post', channelId: ch, message: { embeds: [{ title: (0, shared_1.renderTicketText)(l.settings.closedTitle, v), description: (0, shared_1.renderTicketText)(l.settings.closedMessage, v), color: l.settings.closedColor }] } });
            effects.push({ type: 'control', ticketId: t.id, channelId: ch, messageId: updated.controlMessageId, message: this.control(fresh) });
        }
        await this.logAction(l, 'closed', actor, { reason }, effects, `🔒 Geschlossen von ${this.actorTag(actor)}${reason ? ` – ${reason}` : ''}`);
        if (l.cat.transcriptOnClose) {
            // Hintergrund-Auftrag (idempotent je Abschluss); schlägt die Erstellung fehl, bleiben alle Nachrichten gespeichert und der Auftrag wird wiederholt
            const targets = [l.cat.transcriptChannelId ?? l.settings.transcriptChannelId].filter((x) => !!x);
            const notify = { channelIds: targets, userId: l.cat.transcriptToUser ? t.creatorId : null, message: `📋 Transkript – Ticket **${this.ref(t.number, l.settings)}** (${l.cat.name})${l.cat.confidential ? '' : ` · ${reason ?? 'ohne Grund'}`}` };
            const { transcript: tr } = await this.transcriptsSvc.enqueue(t.id, { trigger: 'close', key: `close:${t.id}:${now.toISOString()}`, actor: { id: actor.discordId ?? actor.userId, name: actor.name }, notify });
            await this.prisma.ticketLog.create({ data: { ticketId: t.id, action: 'transcript_requested', actorId: actor.discordId, actorName: actor.name, detail: { transcriptId: tr.id, version: tr.version, trigger: 'close' } } });
        }
        await this.queueNotify(fresh, 'closed', effects, `🔒 Ticket **${this.ref(t.number, l.settings)}** geschlossen von ${actor.name}`);
        if (l.cat.ratingEnabled && !(await this.prisma.ticketRating.count({ where: { ticketId: t.id } })))
            effects.push(this.ratingRequest(fresh, reason));
        await this.panelLoad(l.cat.id, effects);
        if (del === 0 && ch) {
            await this.prisma.supportTicket.update({ where: { id: t.id }, data: { deletedAt: new Date() } });
            effects.push({ type: 'delete', channelId: ch, delayMs: 10_000 });
        }
    }
    ratingRequest(l, reason) {
        const v = this.vars(l, { '{reason}': reason ? `Grund: ${reason}` : '' });
        return { type: 'dm', userId: l.t.creatorId, message: {
                embeds: [{ title: `⭐ ${l.cat.ratingQuestion}`, description: (0, shared_1.renderTicketText)(l.settings.ratingMessage, v), color: 0xfacc15 }],
                buttons: [1, 2, 3, 4, 5].map((n) => ({ id: `tk:rate:${l.t.id}:${n}`, label: '⭐'.repeat(n), style: n >= 4 ? 'success' : n <= 2 ? 'danger' : 'secondary' })),
            } };
    }
    // ================= Bewertung =================
    async rate(id, discordId, stars) {
        const t = await this.prisma.supportTicket.findUnique({ where: { id } });
        if (!t)
            throw new errors_1.AppError('NOT_FOUND', 'Ticket nicht gefunden.');
        if (t.creatorId !== discordId)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Nur der Ersteller kann das Ticket bewerten.');
        if (await this.prisma.ticketRating.findUnique({ where: { ticketId: id } }))
            throw new errors_1.AppError('CONFLICT', 'Du hast dieses Ticket bereits bewertet.');
        await this.prisma.ticketRating.create({ data: { ticketId: id, categoryId: t.categoryId, creatorId: discordId, staffIds: t.claimers, stars } });
        await this.prisma.ticketLog.create({ data: { ticketId: id, action: 'rated', actorId: discordId, actorName: t.creatorName, detail: { stars } } });
        const settings = await this.config.settings();
        await this.postRating(t, stars, null, settings);
        return { ok: true, thanks: settings.ratingThanks };
    }
    async rateComment(id, discordId, comment) {
        const r = await this.prisma.ticketRating.findUnique({ where: { ticketId: id } });
        if (!r || r.creatorId !== discordId)
            throw new errors_1.AppError('NOT_FOUND', 'Keine Bewertung gefunden.');
        await this.prisma.ticketRating.update({ where: { ticketId: id }, data: { comment } });
        const t = await this.prisma.supportTicket.findUnique({ where: { id } });
        if (t)
            await this.postRating(t, r.stars, comment, await this.config.settings());
        return { ok: true };
    }
    /** Bewertung in den Team-Channel (alles) und den öffentlichen Channel (gewählte Werte); Kommentar kommt als eigene Nachricht. */
    async postRating(t, stars, comment, settings) {
        if (!settings.ratingChannelId && !settings.ratingPublicChannelId)
            return;
        const cat = await this.prisma.ticketCategory.findUnique({ where: { id: t.categoryId }, select: { name: true } });
        const mins = t.closedAt ? Math.round((t.closedAt.getTime() - t.createdAt.getTime()) / 60_000) : null;
        const dur = mins === null ? '—' : mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
        const all = {
            creator: { name: 'Ersteller', value: mention(t.creatorId) }, category: { name: 'Kategorie', value: cat?.name ?? '—' },
            staff: { name: 'Bearbeiter', value: t.claimers.map(mention).join(', ') || '—' }, duration: { name: 'Bearbeitungszeit', value: dur },
            ...(comment ? { comment: { name: 'Kommentar', value: comment.slice(0, 1024) } } : {}),
        };
        const embed = (keys) => ({ embeds: [{ title: comment ? `💬 Kommentar zur Bewertung · Ticket #${(0, shared_1.ticketNumber)(t.number)}` : `${'⭐'.repeat(stars)} Bewertung · Ticket #${(0, shared_1.ticketNumber)(t.number)}`, color: 0xfacc15,
                    fields: keys.filter((k) => all[k]).map((k) => ({ ...all[k], inline: k !== 'comment' })) }] });
        const effects = [];
        if (settings.ratingChannelId)
            effects.push({ type: 'post', channelId: settings.ratingChannelId, message: embed(['creator', 'category', 'staff', 'duration', 'comment']) });
        if (settings.ratingPublicChannelId && (!comment || settings.ratingPublicFields.includes('comment')))
            effects.push({ type: 'post', channelId: settings.ratingPublicChannelId, message: embed(comment ? ['comment'] : settings.ratingPublicFields) });
        await this.dispatch(effects, false);
    }
    // ================= Nachrichten & Anhänge =================
    /** Bot meldet eine Nachricht aus einem Ticket-Channel (Verlauf + Transcript). */
    async message(d) {
        const t = await this.prisma.supportTicket.findFirst({ where: { channelId: d.channelId, deletedAt: null } });
        if (!t)
            return { ok: false };
        const staff = !d.isBot && d.authorId !== t.creatorId && !(await this.prisma.ticketAccess.findFirst({ where: { ticketId: t.id, targetId: d.authorId, kind: 'USER' } }));
        const attachments = [];
        for (const a of d.attachments.slice(0, 10))
            attachments.push({ name: a.name.slice(0, 200), size: a.size, contentType: a.contentType ?? null, url: a.url, storageKey: await this.storeAttachment(a.url, a.size, a.name) });
        await this.prisma.ticketMessage.upsert({
            where: { discordId: d.discordMessageId },
            create: { ticketId: t.id, discordId: d.discordMessageId, authorId: d.authorId, authorName: d.authorName.slice(0, 100), authorAvatar: d.authorAvatar ?? null, isStaff: staff, isBot: d.isBot, content: d.content.slice(0, 8000), attachments: attachments, embeds: d.embeds.slice(0, 5) },
            update: { content: d.content.slice(0, 8000) },
        });
        if (!d.isBot)
            await this.prisma.supportTicket.update({ where: { id: t.id }, data: { lastActivityAt: new Date(), warnedAt: null, staffAlertedAt: null, ...(staff && !t.firstResponseAt ? { firstResponseAt: new Date() } : {}) } });
        if (!d.isBot && d.authorId === t.creatorId && !t.closedAt)
            await this.onCreatorMessage(t.id).catch((e) => this.log.warn(`creator message ${t.id}: ${e.message}`));
        // Auto-Claim: erstes Teammitglied, das schreibt, übernimmt (nur mit Recht ticket.claim)
        if (staff && !t.claimers.length && !t.closedAt) {
            const l = await this.load(t.id);
            const link = l.cat.autoClaimOnMessage ? await this.prisma.discordLink.findUnique({ where: { discordId: d.authorId } }) : null;
            if (link && !this.isClosed(l) && (await this.perms.has(link.userId, 'ticket.claim'))) {
                const effects = [];
                await this.perform(l, { userId: link.userId, discordId: d.authorId, name: d.authorName, viaBot: false }, { action: 'claim' }, effects).catch(() => undefined);
                await this.dispatch(effects, false);
            }
        }
        return { ok: true };
    }
    /** Ersteller schreibt: „Wartet auf Nutzer“ endet (SLA läuft weiter), Bearbeiter werden höchstens alle X Minuten benachrichtigt. */
    async onCreatorMessage(id) {
        const l = await this.load(id);
        if (this.isClosed(l))
            return;
        const effects = [];
        if (l.status.key === 'WAITING_USER') {
            const back = await this.statusByKey('IN_PROGRESS') ?? await this.prisma.ticketStatus.findFirst({ where: { isDefault: true } });
            if (back) {
                await this.prisma.supportTicket.update({ where: { id }, data: this.statusData(l, back) });
                const fresh = await this.load(id);
                if (fresh.t.channelId)
                    effects.push({ type: 'control', ticketId: id, channelId: fresh.t.channelId, messageId: fresh.t.controlMessageId, message: this.control(fresh) });
                await this.logAction(l, 'status_changed', { userId: l.t.creatorUserId, discordId: l.t.creatorId, name: l.t.creatorName, viaBot: false }, { from: l.status.name, to: back.name }, effects);
            }
        }
        const every = l.settings.userMessageNotifyMinutes * 60_000;
        if (l.t.claimers.length && (!l.t.userMessageNotifiedAt || Date.now() - l.t.userMessageNotifiedAt.getTime() >= every)) {
            await this.prisma.supportTicket.update({ where: { id }, data: { userMessageNotifiedAt: new Date() } });
            await this.queueNotify(l, 'user_message', effects, `💬 Neue Nachricht des Nutzers in Ticket **${this.ref(l.t.number, l.settings)}**`);
        }
        await this.dispatch(effects, false);
    }
    /** Kategoriewechsel aus vertraulich heraus: nur die Leitung (ticket.manage) – sonst würde der bisherige Verlauf für ein größeres Team sichtbar. */
    async assertConfidentialMove(actor, l, to) {
        if (!l.cat.confidential || to.confidential || actor.system)
            return;
        if (actor.userId && (await this.perms.has(actor.userId, 'ticket.manage')))
            return;
        await this.auditTicket(actor, 'access_denied', l.t, { permission: 'ticket.manage', reason: 'confidential_move' }, 'DENIED');
        throw new errors_1.AppError('PERMISSION_DENIED', 'Ein vertrauliches Ticket kann nur die Leitung (ticket.manage) in eine nicht vertrauliche Kategorie verschieben.');
    }
    // ================= Benachrichtigungen =================
    /**
     * Benachrichtigung nach den Regeln unter Allgemein → Benachrichtigungen. Empfänger sind nur Berechtigte: der interne Kanal der
     * Abteilung, die Bearbeiter (DM) und deren verknüpfte Dashboard-Konten. Vertrauliche Tickets: nur Ticket-ID, keine Details.
     * `to`: Discord-IDs statt der Bearbeiter (z. B. die zugewiesene Person); `leads`: zusätzlich die Leitung im Kanal erwähnen.
     */
    async queueNotify(l, event, effects, text, to, leads = false) {
        const rule = l.settings.notifications[event];
        if (!rule)
            return;
        const ref = this.ref(l.t.number, l.settings);
        const safe = l.cat.confidential ? `🔒 Vertrauliches Ticket **${ref}** · ${NOTIFY_LABEL[event] ?? event}` : text;
        const link = (0, web_url_1.webUrl)(`/support-tickets/${l.t.id}`);
        const recipients = (to ?? l.t.claimers).filter(Boolean);
        if (rule.channel && l.dept?.notifyChannelId) {
            const leadRoles = leads ? (l.dept.leadRoleIds.length ? l.dept.leadRoleIds : l.settings.leadRoleIds) : [];
            effects.push({ type: 'post', channelId: l.dept.notifyChannelId, message: { content: leadRoles.map((r) => `<@&${r}>`).join(' ') || undefined, mentionRoles: leadRoles, embeds: [{ description: safe, color: 0x3b82f6 }], buttons: [{ id: `tk-open-${l.t.id}`, label: 'Im Dashboard öffnen', style: 'secondary', url: link }] } });
        }
        if (rule.dm)
            for (const id of recipients)
                if ((await this.staffWithAccess(id, l.cat, l.dept)))
                    effects.push({ type: 'dm', userId: id, message: { embeds: [{ description: safe, color: 0x3b82f6 }], buttons: [{ id: `tk-open-${l.t.id}`, label: 'Im Dashboard öffnen', style: 'secondary', url: link }] } });
        if (rule.dashboard && recipients.length) {
            const users = [];
            for (const id of recipients) {
                const u = await this.staffWithAccess(id, l.cat, l.dept);
                if (u)
                    users.push(u);
            }
            if (users.length)
                await this.notify.notify(users, { type: 'TICKET_EVENT', title: safe.replace(/\*\*/g, '').slice(0, 200), body: l.cat.name, entityType: 'SupportTicket', entityId: l.t.id }).catch((e) => this.log.warn(`notify: ${e.message}`));
        }
    }
    /** Transkript fertig bzw. endgültig fehlgeschlagen → Benachrichtigung (fehlgeschlagen zusätzlich im Log-Kanal). */
    async transcriptFinished(tr, ok) {
        const l = await this.load(tr.ticketId).catch(() => null);
        if (!l)
            return;
        const effects = [];
        const ref = this.ref(l.t.number, l.settings);
        if (!ok && l.settings.logChannelId)
            effects.push({ type: 'post', channelId: l.settings.logChannelId, message: { embeds: [{ title: '⚠️ Transkript fehlgeschlagen', description: `${ref} · Version ${tr.version}: Die Erstellung ist nach mehreren Versuchen fehlgeschlagen. Die Nachrichten sind gespeichert – im Dashboard „Erneut versuchen“.`, color: 0xef4444 }] } });
        await this.queueNotify(l, ok ? 'transcript_ready' : 'transcript_failed', effects, ok ? `📋 Transkript **${ref}** (Version ${tr.version}) ist fertig.` : `⚠️ Transkript **${ref}** (Version ${tr.version}) fehlgeschlagen.`);
        await this.dispatch(effects, false);
    }
    async storeAttachment(url, size, name) {
        if (size > MAX_ATTACHMENT || !/^https:\/\/(cdn|media)\.discordapp\.(com|net)\//.test(url))
            return null;
        try {
            const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
            if (!r.ok)
                return null;
            const buf = Buffer.from(await r.arrayBuffer());
            if (buf.length > MAX_ATTACHMENT)
                return null;
            const ext = (node_path_1.default.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin').slice(0, 10);
            const key = `${(0, node_crypto_1.randomUUID)()}${ext}`;
            await (0, promises_1.mkdir)(this.dir, { recursive: true });
            await (0, promises_1.writeFile)(node_path_1.default.join(this.dir, key), buf);
            return key;
        }
        catch (e) {
            this.log.warn(`attachment not stored: ${e instanceof Error ? e.message : e}`);
            return null;
        }
    }
    /** Anhang ausliefern (nur mit Zugriff auf das Ticket). Nur Bilder inline, alles andere als Download. */
    async attachment(userId, key) {
        if (!/^[0-9a-f-]{36}\.[a-z0-9]{1,9}$/.test(key))
            throw new errors_1.AppError('NOT_FOUND', 'Anhang nicht gefunden.');
        const msg = await this.prisma.ticketMessage.findFirst({ where: { attachments: { array_contains: [{ storageKey: key }] } } });
        if (!msg)
            throw new errors_1.AppError('NOT_FOUND', 'Anhang nicht gefunden.');
        const t = await this.prisma.supportTicket.findUniqueOrThrow({ where: { id: msg.ticketId } });
        await this.assertCan({ userId, discordId: null, name: '', viaBot: false }, 'ticket.view', await this.config.category(t.categoryId));
        const meta = msg.attachments.find((a) => a.storageKey === key);
        const data = await (0, promises_1.readFile)(node_path_1.default.join(this.dir, key)).catch(() => { throw new errors_1.AppError('NOT_FOUND', 'Die Datei des Anhangs fehlt.'); });
        const image = !!meta.contentType && IMAGE_TYPES.includes(meta.contentType);
        return { data, name: meta.name, contentType: image ? meta.contentType : 'application/octet-stream', inline: image };
    }
    // ================= Abfragen fürs Dashboard =================
    /** Anzeigenamen zu Discord-IDs (verknüpfte Konten, sonst zuletzt gesehener Name in Tickets). */
    async discordNames(ids) {
        const uniq = [...new Set(ids)].filter(Boolean);
        if (!uniq.length)
            return {};
        const [links, msgs] = await Promise.all([
            this.prisma.discordLink.findMany({ where: { discordId: { in: uniq } } }),
            this.prisma.ticketMessage.findMany({ where: { authorId: { in: uniq } }, orderBy: { createdAt: 'desc' }, distinct: ['authorId'], select: { authorId: true, authorName: true } }),
        ]);
        const out = {};
        for (const m of msgs)
            out[m.authorId] = m.authorName;
        const users = await this.prisma.user.findMany({ where: { id: { in: links.map((l) => l.userId) } }, select: { id: true, displayName: true } });
        for (const l of links) {
            const u = users.find((x) => x.id === l.userId);
            if (u)
                out[l.discordId] = u.displayName;
        }
        return out;
    }
    summary(l) {
        return { id: l.t.id, number: (0, shared_1.ticketNumber)(l.t.number), ref: this.ref(l.t.number, l.settings), subject: l.t.subject, name: l.t.name, channelId: l.t.channelId, category: { id: l.cat.id, name: l.cat.name, emoji: l.cat.emoji }, department: l.dept ? { id: l.dept.id, name: l.dept.name } : null, status: l.status, priority: l.priority, claimers: l.t.claimers, creatorId: l.t.creatorId, creatorName: l.t.creatorName, locked: l.t.locked, closedAt: l.t.closedAt, createdAt: l.t.createdAt };
    }
    /** Warteschlangen (offen, unzugewiesen, …) als Abfrage; Status-IDs nach Art bzw. fester Bedeutung. */
    async queueWhere(queue, now = new Date()) {
        if (!queue)
            return {};
        const statuses = await this.prisma.ticketStatus.findMany();
        const ids = (f) => statuses.filter(f).map((s) => s.id);
        const open = { statusId: { in: ids((s) => s.kind === 'OPEN') }, deletedAt: null };
        switch (queue) {
            case 'unassigned': return { ...open, claimers: { isEmpty: true } };
            case 'in_progress': return { ...open, claimers: { isEmpty: false }, statusId: { in: ids((s) => s.kind === 'OPEN' && s.key !== 'WAITING_USER' && s.key !== 'WAITING_INTERNAL') } };
            case 'waiting': return { deletedAt: null, statusId: { in: ids((s) => s.key === 'WAITING_USER' || s.key === 'WAITING_INTERNAL') } };
            case 'overdue': return { ...open, OR: [{ firstResponseAt: null, firstResponseDueAt: { lt: now } }, { waitingSince: null, resolveDueAt: { lt: now } }] };
            default: return {};
        }
    }
    async list(userId, f) {
        const visible = await this.visibleWhere(userId);
        let claimer = f.claimer;
        if (claimer === 'me')
            claimer = (await this.prisma.discordLink.findUnique({ where: { userId } }))?.discordId ?? '__none__';
        const statuses = await this.prisma.ticketStatus.findMany();
        const kindIds = (k) => statuses.filter((s) => s.kind === k).map((s) => s.id);
        const num = f.q ? (0, shared_1.parseTicketRef)(f.q) : null;
        const and = [
            ...(visible ? [visible] : []), await this.queueWhere(f.queue),
            ...(f.creator ? [{ OR: [{ creatorId: f.creator }, { creatorName: { contains: f.creator, mode: 'insensitive' } }] }] : []),
            ...(f.q ? [{ OR: [{ name: { contains: f.q, mode: 'insensitive' } }, { subject: { contains: f.q, mode: 'insensitive' } }, { creatorName: { contains: f.q, mode: 'insensitive' } }, ...(num ? [{ number: num }] : [])] }] : []),
        ];
        const where = {
            deletedAt: f.kind === 'deleted' ? { not: null } : undefined,
            ...(f.categoryId ? { categoryId: f.categoryId } : {}), ...(f.departmentId ? { departmentId: f.departmentId } : {}),
            ...(f.kind === 'open' ? { statusId: { in: kindIds('OPEN') } } : f.kind === 'closed' ? { statusId: { in: kindIds('CLOSED') } } : f.kind === 'archived' ? { statusId: { in: kindIds('ARCHIVED') } } : f.kind === 'escalated' ? { escalatedAt: { not: null }, statusId: { in: kindIds('OPEN') } } : {}),
            ...(f.statusId ? { statusId: f.statusId } : {}), ...(f.priorityId ? { priorityId: f.priorityId } : {}), ...(f.guildId ? { guildId: f.guildId } : {}),
            ...(claimer ? { claimers: { has: claimer } } : {}),
            ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
            ...(f.closedFrom || f.closedTo ? { closedAt: { ...(f.closedFrom ? { gte: f.closedFrom } : {}), ...(f.closedTo ? { lte: f.closedTo } : {}) } } : {}),
            AND: and,
        };
        const [rows, total, cats, prios, deps, settings] = await Promise.all([
            this.prisma.supportTicket.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
            this.prisma.supportTicket.count({ where }), this.prisma.ticketCategory.findMany({ select: { id: true, name: true, emoji: true, confidential: true } }), this.prisma.ticketPriority.findMany(),
            this.prisma.ticketDepartment.findMany({ select: { id: true, name: true, emoji: true } }), this.config.settings(),
        ]);
        const now = new Date();
        return { total, page: f.page, pageSize: f.pageSize, items: rows.map((t) => {
                const prio = prios.find((p) => p.id === t.priorityId) ?? null;
                const sla = (0, shared_1.slaState)({ ...t, firstResponseMinutes: prio?.firstResponseMinutes ?? null, resolutionMinutes: prio?.resolutionMinutes ?? null }, now);
                return {
                    id: t.id, number: (0, shared_1.ticketNumber)(t.number), ref: this.ref(t.number, settings), subject: t.subject, name: t.name, guildId: t.guildId, creatorId: t.creatorId, creatorName: t.creatorName, claimers: t.claimers, locked: t.locked,
                    createdAt: t.createdAt, closedAt: t.closedAt, deletedAt: t.deletedAt, escalatedAt: t.escalatedAt, waitingSince: t.waitingSince,
                    category: cats.find((c) => c.id === t.categoryId) ?? null, department: deps.find((d) => d.id === t.departmentId) ?? null, status: statuses.find((s) => s.id === t.statusId) ?? null, priority: prio,
                    sla: { firstDueAt: sla.firstDueAt, resolveDueAt: sla.resolveDueAt, overdue: sla.firstOverdue || sla.resolveOverdue, paused: sla.paused },
                };
            }) };
    }
    /** Zahlen für die Übersicht im Ticket-Center (nur sichtbare Tickets). */
    async overview(userId, guildId) {
        const visible = await this.visibleWhere(userId);
        const base = { deletedAt: null, ...(guildId ? { guildId } : {}), ...(visible ? { AND: [visible] } : {}) };
        const statuses = await this.prisma.ticketStatus.findMany();
        const kind = (k) => ({ statusId: { in: statuses.filter((s) => s.kind === k).map((s) => s.id) } });
        const count = async (q) => this.prisma.supportTicket.count({ where: { AND: [base, q] } });
        const [open, unassigned, inProgress, waiting, overdue, closed, archived] = await Promise.all([
            count(kind('OPEN')), count(await this.queueWhere('unassigned')), count(await this.queueWhere('in_progress')), count(await this.queueWhere('waiting')),
            count(await this.queueWhere('overdue')), count(kind('CLOSED')), count(kind('ARCHIVED')),
        ]);
        return { open, unassigned, inProgress, waiting, overdue, closed, archived };
    }
    async detail(userId, id) {
        const t = await this.prisma.supportTicket.findUnique({ where: { id } });
        if (!t)
            throw new errors_1.AppError('NOT_FOUND', 'Ticket nicht gefunden.');
        const [cat, dept] = await Promise.all([this.config.category(t.categoryId), this.config.department(t.departmentId)]);
        await this.assertCan({ userId, discordId: null, name: '', viaBot: false }, 'ticket.view', cat, dept, t);
        const [canNotes, canTranscripts] = await Promise.all([this.perms.has(userId, 'ticket.internal_notes'), this.perms.has(userId, 'ticket.transcript')]);
        const [status, priority, access, messages, notes, logs, transcripts, rating, settings, formVersion] = await Promise.all([
            this.prisma.ticketStatus.findUnique({ where: { id: t.statusId } }), t.priorityId ? this.prisma.ticketPriority.findUnique({ where: { id: t.priorityId } }) : null,
            this.prisma.ticketAccess.findMany({ where: { ticketId: id } }), this.prisma.ticketMessage.findMany({ where: { ticketId: id }, orderBy: { createdAt: 'asc' }, take: 1000 }),
            canNotes ? this.prisma.ticketNote.findMany({ where: { ticketId: id }, orderBy: { createdAt: 'asc' } }) : Promise.resolve(null),
            this.prisma.ticketLog.findMany({ where: { ticketId: id, ...(canNotes ? {} : { action: { not: 'note_added' } }) }, orderBy: { createdAt: 'asc' } }),
            canTranscripts ? this.prisma.ticketTranscript.findMany({ where: { ticketId: id }, orderBy: { version: 'desc' }, select: { id: true, version: true, status: true, trigger: true, attempts: true, lastError: true, createdAt: true, completedAt: true, createdByName: true, sizeBytes: true, sha256: true } }) : Promise.resolve(null),
            this.prisma.ticketRating.findUnique({ where: { ticketId: id } }), this.settingsFor(t.guildId),
            t.formVersion ? this.prisma.ticketFormVersion.findUnique({ where: { categoryId_version: { categoryId: t.categoryId, version: t.formVersion } }, select: { version: true, createdAt: true } }) : null,
        ]);
        const names = await this.discordNames([...t.claimers, ...access.filter((a) => a.kind === 'USER').map((a) => a.targetId)]);
        const sla = (0, shared_1.slaState)({ ...t, firstResponseMinutes: priority?.firstResponseMinutes ?? null, resolutionMinutes: priority?.resolutionMinutes ?? null });
        return {
            ...t, number: (0, shared_1.ticketNumber)(t.number), ref: this.ref(t.number, settings), transcriptUrl: (0, web_url_1.webUrl)(`/transcript/${this.ref(t.number, settings)}`),
            category: { id: cat.id, name: cat.name, emoji: cat.emoji, claimMode: cat.claimMode, closeReasonMode: cat.closeReasonMode, closeReasonSource: cat.closeReasonSource, allowReopen: cat.allowReopen, confidential: cat.confidential, active: cat.active && !cat.archivedAt },
            department: dept ? { id: dept.id, name: dept.name, emoji: dept.emoji } : null, formVersion, sla,
            status, priority, access, messages, notes, logs, transcripts, rating, names,
        };
    }
    /** Auswahllisten für Discord-Menüs (Priorität, Status, Kategorie, Gründe, Zugriff). */
    async options(actor, id) {
        const l = await this.load(id);
        await this.assertCan(actor, 'ticket.view', l.cat, l.dept, l.t);
        const [statuses, priorities, categories, reasons, access, departments] = await Promise.all([
            this.config.statuses(), this.config.priorities(), this.prisma.ticketCategory.findMany({ where: { active: true, archivedAt: null }, orderBy: { position: 'asc' }, select: { id: true, name: true, emoji: true } }),
            this.config.reasons(), this.prisma.ticketAccess.findMany({ where: { ticketId: id } }), this.prisma.ticketDepartment.findMany({ where: { active: true }, orderBy: { position: 'asc' }, select: { id: true, name: true, emoji: true } }),
        ]);
        const closed = this.isClosed(l);
        return {
            // nur erlaubte Statuswechsel anbieten (zentrale Regel)
            closed, statuses: statuses.filter((s) => s.id !== l.status.id && !(0, shared_1.checkStatusChange)(l.status, s, 'status')), priorities, categories: categories.filter((c) => c.id !== l.cat.id), reasons, access,
            departments: departments.filter((d) => d.id !== l.t.departmentId),
            close: { mode: l.cat.closeReasonMode, source: l.cat.closeReasonSource },
        };
    }
    /** Schließen-Auswahl für den Bot (auch für Ersteller ohne Konto). */
    async closeOptions(id) {
        const l = await this.load(id);
        return { mode: l.cat.closeReasonMode, source: l.cat.closeReasonSource, reasons: (await this.config.reasons()).map((r) => r.text), closed: this.isClosed(l) };
    }
    async transcripts(userId, f) {
        const num = f.q ? (0, shared_1.parseTicketRef)(f.q) : null;
        const where = {
            ...(f.number ? { ticketNumber: f.number } : {}), ...(f.categoryName ? { categoryName: f.categoryName } : {}), ...(f.status ? { statusName: f.status } : {}),
            ...(f.creator ? { OR: [{ creatorId: f.creator }, { creatorName: { contains: f.creator, mode: 'insensitive' } }] } : {}),
            ...(f.staff ? { claimers: { has: f.staff } } : {}),
            ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
            ...(f.q ? { AND: [{ OR: [{ creatorName: { contains: f.q, mode: 'insensitive' } }, { categoryName: { contains: f.q, mode: 'insensitive' } }, ...(num ? [{ ticketNumber: num }] : [])] }] } : {}),
        };
        const visible = await this.visibleWhere(userId);
        if (visible)
            where.ticketId = { in: (await this.prisma.supportTicket.findMany({ where: visible, select: { id: true } })).map((t) => t.id) };
        const settings = await this.config.settings();
        const [items, total] = await Promise.all([
            this.prisma.ticketTranscript.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize, select: { id: true, ticketId: true, ticketNumber: true, categoryName: true, creatorId: true, creatorName: true, claimers: true, statusName: true, sizeBytes: true, createdAt: true, createdByName: true, version: true, status: true, attempts: true, lastError: true, completedAt: true } }),
            this.prisma.ticketTranscript.count({ where }),
        ]);
        return { total, page: f.page, pageSize: f.pageSize, items: items.map((x) => ({ ...x, ref: this.ref(x.ticketNumber, settings), ticketNumber: (0, shared_1.ticketNumber)(x.ticketNumber) })) };
    }
    /**
     * Zugriff auf ein Transkript – bei JEDEM Abruf serverseitig geprüft (ein Link allein reicht nie):
     * Mitarbeiter mit ticket.transcript (Export: ticket.transcript_export) und Zugriff auf das Ticket, oder der Ersteller selbst
     * (verknüpftes Discord-Konto; nur Ansicht/Text, kein JSON). Alles andere: einheitlich „nicht gefunden“ (keine Rückschlüsse) + Audit.
     */
    async transcriptAccess(userId, ticketId, need) {
        const t = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
        const actor = { userId, discordId: null, name: '', viaBot: false };
        if (await this.perms.has(userId, 'ticket.manage'))
            return 'staff';
        if (t) {
            const [cat, dept] = await Promise.all([this.config.category(t.categoryId), this.config.department(t.departmentId)]);
            const perms = need === 'view' ? ['ticket.transcript'] : ['ticket.transcript', 'ticket.transcript_export'];
            let staff = await this.categoryVisible(userId, cat, dept);
            for (const p of perms)
                staff = staff && (await this.perms.has(userId, p));
            if (staff)
                return 'staff';
            const link = await this.prisma.discordLink.findUnique({ where: { userId } });
            if (link?.discordId === t.creatorId && need !== 'json')
                return 'creator';
            await this.auditTicket(actor, 'transcript_denied', t, { ref: this.ref(t.number, await this.settingsFor(t.guildId)), need }, 'DENIED');
        }
        throw new errors_1.AppError('NOT_FOUND', 'Transkript nicht gefunden oder kein Zugriff.');
    }
    /** Ein Transkript (Version) für Ansicht/Download; `userId` null = Bot-Dienst (Zustellung in Discord). */
    async transcript(userId, id, need = 'view') {
        const tr = await this.prisma.ticketTranscript.findUnique({ where: { id } });
        if (!tr)
            throw new errors_1.AppError('NOT_FOUND', 'Transkript nicht gefunden oder kein Zugriff.');
        if (userId) {
            const who = await this.transcriptAccess(userId, tr.ticketId, need);
            const t = await this.prisma.supportTicket.findUnique({ where: { id: tr.ticketId }, select: { id: true, guildId: true, number: true } });
            if (t)
                await this.auditTicket({ userId, discordId: null, name: '', viaBot: false }, need === 'view' ? 'transcript_viewed' : 'transcript_exported', t, { ref: this.ref(t.number, await this.settingsFor(t.guildId)), transcriptId: tr.id, version: tr.version, as: who, format: need });
        }
        if (tr.status !== 'DONE')
            throw new errors_1.AppError('CONFLICT', tr.status === 'FAILED' ? 'Die Erstellung dieses Transkripts ist fehlgeschlagen – bitte erneut versuchen.' : 'Das Transkript wird noch erstellt. Bitte in einem Moment erneut versuchen.');
        return tr;
    }
    /** Versionen eines Tickets für die Transkript-Seite `/transcript/EMD-000123`. */
    async transcriptsByRef(userId, ref) {
        const n = (0, shared_1.parseTicketRef)(ref);
        const t = n ? await this.prisma.supportTicket.findUnique({ where: { number: n } }) : null;
        if (!t)
            throw new errors_1.AppError('NOT_FOUND', 'Transkript nicht gefunden oder kein Zugriff.');
        const settings = await this.settingsFor(t.guildId);
        // die angefragte Kennung muss zum Präfix passen (keine Mehrdeutigkeit) – Zahl/#Zahl bleibt erlaubt
        if (/^[A-Za-z]/.test(ref) && !ref.toUpperCase().startsWith(`${settings.refPrefix}-`))
            throw new errors_1.AppError('NOT_FOUND', 'Transkript nicht gefunden oder kein Zugriff.');
        const who = await this.transcriptAccess(userId, t.id, 'view');
        const [cat, versions, canExport, canManage] = await Promise.all([
            this.prisma.ticketCategory.findUnique({ where: { id: t.categoryId }, select: { name: true, emoji: true } }),
            this.prisma.ticketTranscript.findMany({ where: { ticketId: t.id }, orderBy: { version: 'desc' }, select: { id: true, version: true, status: true, trigger: true, createdAt: true, completedAt: true, createdByName: true, sizeBytes: true, sha256: true, attempts: true, lastError: true } }),
            who === 'staff' ? this.perms.has(userId, 'ticket.transcript_export') : Promise.resolve(false),
            who === 'staff' ? this.perms.has(userId, 'ticket.transcript_manage') : Promise.resolve(false),
        ]);
        return {
            ticketId: who === 'staff' ? t.id : null, ref: this.ref(t.number, settings), subject: t.subject, category: cat, createdAt: t.createdAt, closedAt: t.closedAt, as: who,
            canExport: who === 'staff' ? canExport : true, canJson: who === 'staff' && canExport, canManage,
            // Fehlertexte nur für Mitarbeiter
            versions: versions.map((v) => ({ ...v, lastError: who === 'staff' ? v.lastError : null, createdByName: who === 'staff' ? v.createdByName : null })),
        };
    }
    /** Audit-Protokoll des Ticket-Systems (nur Metadaten; Recht ticket.audit). */
    async auditLog(f) {
        const where = { module: 'tickets', ...(f.ticketId ? { entityId: f.ticketId } : {}), ...(f.action ? { action: { contains: f.action } } : {}), ...(f.result ? { result: f.result } : {}) };
        const [items, total] = await Promise.all([
            this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize, select: { id: true, actorUserId: true, action: true, entityType: true, entityId: true, after: true, result: true, requestId: true, createdAt: true } }),
            this.prisma.auditLog.count({ where }),
        ]);
        const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(items.map((i) => i.actorUserId).filter((x) => !!x))] } }, select: { id: true, displayName: true } });
        return { total, page: f.page, pageSize: f.pageSize, items: items.map((i) => ({ ...i, actorName: users.find((u) => u.id === i.actorUserId)?.displayName ?? (i.actorUserId ? null : 'System / Discord') })) };
    }
    async deleteTranscript(actor, id) {
        const tr = await this.prisma.ticketTranscript.findUnique({ where: { id } });
        if (!tr)
            throw new errors_1.AppError('NOT_FOUND', 'Transkript nicht gefunden oder kein Zugriff.');
        if (actor.userId && (await this.transcriptAccess(actor.userId, tr.ticketId, 'view')) !== 'staff')
            throw new errors_1.AppError('NOT_FOUND', 'Transkript nicht gefunden oder kein Zugriff.');
        await this.prisma.ticketTranscript.delete({ where: { id } });
        await this.prisma.ticketLog.create({ data: { ticketId: tr.ticketId, action: 'transcript_deleted', actorId: actor.discordId, actorName: actor.name, detail: { transcriptId: id, version: tr.version } } });
        const t = await this.prisma.supportTicket.findUnique({ where: { id: tr.ticketId }, select: { id: true, guildId: true } });
        if (t)
            await this.auditTicket(actor, 'transcript_deleted', t, { transcriptId: id, version: tr.version });
        return { ok: true };
    }
    async stats(userId) {
        const [visibleTickets, visible] = await Promise.all([this.visibleWhere(userId), this.visibleCategoryIds(userId)]);
        const where = visibleTickets ?? {};
        const now = new Date();
        const day = new Date(now);
        day.setHours(0, 0, 0, 0);
        const week = new Date(day);
        week.setDate(day.getDate() - ((day.getDay() + 6) % 7));
        const month = new Date(day.getFullYear(), day.getMonth(), 1);
        const [statuses, cats, tickets, ratings] = await Promise.all([
            this.prisma.ticketStatus.findMany(), this.prisma.ticketCategory.findMany({ select: { id: true, name: true } }),
            this.prisma.supportTicket.findMany({ where, select: { categoryId: true, statusId: true, claimers: true, createdAt: true, closedAt: true, firstResponseAt: true, escalatedAt: true } }),
            this.prisma.ticketRating.findMany({ where: visible ? { categoryId: { in: visible } } : {} }),
        ]);
        const kind = new Map(statuses.map((s) => [s.id, s.kind]));
        const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
        const perCategory = cats.map((c) => ({ id: c.id, name: c.name, total: tickets.filter((t) => t.categoryId === c.id).length, open: tickets.filter((t) => t.categoryId === c.id && kind.get(t.statusId) === 'OPEN').length })).filter((c) => c.total);
        const staff = new Map();
        for (const t of tickets)
            for (const s of t.claimers) {
                const e = staff.get(s) ?? { tickets: 0, closed: 0 };
                e.tickets++;
                if (t.closedAt)
                    e.closed++;
                staff.set(s, e);
            }
        const ratingSummary = this.ratingSummary(ratings, cats);
        const names = await this.discordNames([...staff.keys(), ...ratingSummary.perStaff.map((s) => s.discordId)]);
        return {
            names, total: tickets.length, open: tickets.filter((t) => kind.get(t.statusId) === 'OPEN').length, closed: tickets.filter((t) => kind.get(t.statusId) === 'CLOSED').length, archived: tickets.filter((t) => kind.get(t.statusId) === 'ARCHIVED').length,
            today: tickets.filter((t) => t.createdAt >= day).length, week: tickets.filter((t) => t.createdAt >= week).length, month: tickets.filter((t) => t.createdAt >= month).length,
            avgFirstResponseMinutes: avg(tickets.filter((t) => t.firstResponseAt).map((t) => (t.firstResponseAt.getTime() - t.createdAt.getTime()) / 60_000)),
            avgCloseMinutes: avg(tickets.filter((t) => t.closedAt).map((t) => (t.closedAt.getTime() - t.createdAt.getTime()) / 60_000)),
            escalations: tickets.filter((t) => t.escalatedAt).length,
            perCategory, perStaff: [...staff.entries()].map(([discordId, v]) => ({ discordId, ...v })).sort((a, b) => b.tickets - a.tickets),
            ratings: ratingSummary,
        };
    }
    ratingSummary(ratings, cats) {
        const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
        const staff = new Map();
        for (const r of ratings)
            for (const s of r.staffIds)
                staff.set(s, [...(staff.get(s) ?? []), r.stars]);
        return {
            count: ratings.length, average: avg(ratings.map((r) => r.stars)), positive: ratings.filter((r) => r.stars >= 4).length, negative: ratings.filter((r) => r.stars <= 2).length,
            perStaff: [...staff.entries()].map(([discordId, xs]) => ({ discordId, count: xs.length, average: avg(xs) })).sort((a, b) => (b.average ?? 0) - (a.average ?? 0)),
            perCategory: cats.map((c) => { const xs = ratings.filter((r) => r.categoryId === c.id).map((r) => r.stars); return { id: c.id, name: c.name, count: xs.length, average: avg(xs) }; }).filter((c) => c.count),
        };
    }
    async ratings(userId, f) {
        const visible = await this.visibleCategoryIds(userId);
        const where = { ...(visible ? { categoryId: { in: f.categoryId ? visible.filter((c) => c === f.categoryId) : visible } } : f.categoryId ? { categoryId: f.categoryId } : {}), ...(f.stars ? { stars: f.stars } : {}) };
        const [items, total, all, cats] = await Promise.all([
            this.prisma.ticketRating.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }), this.prisma.ticketRating.count({ where }),
            this.prisma.ticketRating.findMany({ where: visible ? { categoryId: { in: visible } } : {} }), this.prisma.ticketCategory.findMany({ select: { id: true, name: true } }),
        ]);
        const tickets = await this.prisma.supportTicket.findMany({ where: { id: { in: items.map((i) => i.ticketId) } }, select: { id: true, number: true, creatorName: true } });
        const summary = this.ratingSummary(all, cats);
        return { total, summary, names: await this.discordNames(summary.perStaff.map((s) => s.discordId)), items: items.map((r) => ({ ...r, ticket: tickets.find((t) => t.id === r.ticketId) ? { number: (0, shared_1.ticketNumber)(tickets.find((t) => t.id === r.ticketId).number), creatorName: tickets.find((t) => t.id === r.ticketId).creatorName } : null, category: cats.find((c) => c.id === r.categoryId)?.name ?? '—' })) };
    }
    /** Offene Ticket-Channels (der Bot schneidet nur dort Nachrichten mit). */
    async channels() {
        return (await this.prisma.supportTicket.findMany({ where: { deletedAt: null, channelId: { not: null } }, select: { channelId: true } })).map((t) => t.channelId);
    }
    // ================= Panels =================
    async panelMessage(id) {
        const p = await this.prisma.ticketPanel.findUnique({ where: { id } });
        if (!p)
            throw new errors_1.AppError('NOT_FOUND', 'Panel nicht gefunden.');
        const cats = (await this.prisma.ticketCategory.findMany({ where: { id: { in: p.categoryIds }, active: true, archivedAt: null } })).sort((a, b) => p.categoryIds.indexOf(a.id) - p.categoryIds.indexOf(b.id));
        const embed = { title: [p.emoji, p.title].filter(Boolean).join(' ') || undefined, description: p.description || undefined, color: p.color, thumbnail: p.thumbnailUrl ?? undefined, image: p.bannerUrl ?? p.imageUrl ?? undefined, footer: p.footer ?? undefined, footerIcon: p.footerIconUrl ?? undefined, author: p.authorName ?? undefined, authorIcon: p.authorIconUrl ?? undefined };
        if (p.showLoad && cats.length) {
            // offene Tickets je Kategorie (🟢 frei · 🟡 ab 75 % · 🔴 voll)
            const counts = await this.prisma.supportTicket.groupBy({ by: ['categoryId'], where: { categoryId: { in: cats.map((c) => c.id) }, closedAt: null, deletedAt: null }, _count: { _all: true } });
            const n = new Map(counts.map((c) => [c.categoryId, c._count._all]));
            embed.fields = [{ name: '📊 Ticketauslastung', value: cats.slice(0, 25).map((c) => {
                        const open = n.get(c.id) ?? 0, cap = c.capacity;
                        const dot = !cap ? '🔵' : open >= cap ? '🔴' : open >= cap * 0.75 ? '🟡' : '🟢';
                        return `${dot} ${c.emoji ? `${c.emoji} ` : ''}**${c.name}** – ${open}${cap ? `/${cap}` : ''} offen`;
                    }).join('\n').slice(0, 1024) }];
        }
        // Kategorien mit Formular: Kennzeichen „:f“, damit der Bot das Discord-Formular sofort öffnen kann (erste Antwort)
        const form = (c) => c.formMode === 'MODAL' && (0, shared_1.activeFields)(c.questions).length > 0;
        if (p.style === 'DROPDOWN') {
            // Discord: höchstens 25 Einträge je Menü → mehrere Menüs (eindeutige IDs), höchstens 4 (die 5. Reihe bleibt frei)
            const selects = [];
            for (let i = 0; i < Math.min(cats.length, 100); i += 25) {
                const chunk = cats.slice(i, i + 25);
                selects.push({ id: i ? `tk:open:${p.id}:~${i / 25}` : `tk:open:${p.id}`, placeholder: (cats.length > 25 ? `${p.placeholder} (${i + 1}–${i + chunk.length})` : p.placeholder).slice(0, 150),
                    options: chunk.map((c) => ({ label: c.name.slice(0, 100), value: form(c) ? `${c.id}:f` : c.id, description: c.description.slice(0, 100) || undefined, emoji: c.emoji ?? undefined })) });
            }
            return { embeds: [embed], select: selects[0], selects: selects.slice(1) };
        }
        return { embeds: [embed], buttons: cats.slice(0, 25).map((c) => ({ id: `tk:open:${p.id}:${c.id}${form(c) ? ':f' : ''}`, label: c.name.slice(0, 80), emoji: c.emoji ?? undefined, style: (['primary', 'secondary', 'success', 'danger'].includes(c.buttonStyle) ? c.buttonStyle : 'secondary') })) };
    }
    /** Panel in Discord senden bzw. vorhandenes Panel aktualisieren. */
    async publishPanel(actor, id, channelId) {
        if (actor.userId)
            await this.perms.assert(actor.userId, 'ticket.settings');
        const p = await this.prisma.ticketPanel.findUnique({ where: { id } });
        if (!p)
            throw new errors_1.AppError('NOT_FOUND', 'Panel nicht gefunden.');
        const target = channelId ?? p.channelId;
        if (!target)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Wähle zuerst einen Discord-Kanal für dieses Panel.');
        const message = await this.panelMessage(id);
        if (!message.buttons?.length && !message.select?.options?.length)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Füge dem Panel mindestens eine aktive Ticket-Art hinzu.');
        const update = p.messageId && p.messageChannelId === target ? p.messageId : null;
        await this.discord.enqueue('tickets', 'ticket.effects', { effects: [{ type: 'panel', panelId: id, channelId: target, messageId: update, message }] }, { always: true });
        return { ok: true, updating: !!update };
    }
    async panelPosted(id, channelId, messageId) {
        await this.prisma.ticketPanel.update({ where: { id }, data: { messageChannelId: channelId, messageId, publishedAt: new Date(), publishError: null } }).catch(() => undefined);
        return { ok: true };
    }
    /** Bot meldet: Panel konnte nicht gesendet/aktualisiert werden (Kanal fehlt, Rechte fehlen …) – im Dashboard sichtbar. */
    async panelFailed(id, error) {
        await this.prisma.ticketPanel.update({ where: { id }, data: { publishError: error.slice(0, 300) } }).catch(() => undefined);
        return { ok: true };
    }
    // ================= Formular vor dem Erstellen (Discord-Formulare, mehrstufig) =================
    async formFields(categoryId, version) {
        const v = await this.prisma.ticketFormVersion.findUnique({ where: { categoryId_version: { categoryId, version } } });
        if (v)
            return v.fields;
        return (await this.config.category(categoryId)).questions;
    }
    formTitle(name, step, steps) { return `${name}${steps > 1 ? ` (${step + 1}/${steps})` : ''}`; }
    /**
     * Klick auf eine Kategorie mit Formular: Voraussetzungen prüfen (bevor jemand umsonst ausfüllt), Entwurf anlegen und Schritt 1 liefern.
     * `open: true`: die Kategorie braucht (inzwischen) kein Formular – direkt öffnen.
     */
    async formStart(d) {
        const cat = await this.config.category(d.categoryId);
        await this.checkOpenable(cat, d.guildId);
        const fields = cat.questions;
        if (cat.formMode !== 'MODAL' || !(0, shared_1.activeFields)(fields).length)
            return { open: true };
        await this.checkCanOpen(cat, d);
        const steps = (0, shared_1.planFormSteps)(fields);
        const draft = await this.prisma.ticketDraft.create({ data: {
                categoryId: cat.id, panelId: d.panelId ?? null, guildId: d.guildId, discordId: d.discordId, discordName: d.discordName.slice(0, 100), memberRoleIds: d.memberRoleIds,
                formVersion: cat.formVersion, expiresAt: new Date(Date.now() + DRAFT_MINUTES * 60_000),
            } });
        return { draftId: draft.id, steps: steps.length, modal: (0, shared_1.formModal)(`tk:formsub:${draft.id}:0`, this.formTitle(cat.name, 0, steps.length), fields.filter((f) => steps[0].includes(f.id))) };
    }
    async draftOf(draftId, discordId) {
        const draft = await this.prisma.ticketDraft.findUnique({ where: { id: draftId } });
        // fremde Entwürfe wie nicht vorhandene behandeln
        if (!draft || draft.discordId !== discordId)
            throw new errors_1.AppError('NOT_FOUND', 'Dieses Formular gibt es nicht (mehr). Bitte wähle die Kategorie erneut.');
        return draft;
    }
    /** Formular (erneut) für einen Schritt – z. B. nach „Weiter“ oder nach einem Prüffehler mit den zuletzt eingegebenen Werten. */
    async formModalFor(draftId, discordId, step) {
        const draft = await this.draftOf(draftId, discordId);
        if (draft.ticketId)
            throw new errors_1.AppError('CONFLICT', 'Dieses Formular wurde bereits abgeschickt.');
        if (draft.expiresAt < new Date())
            throw new errors_1.AppError('CONFLICT', 'Das Formular ist abgelaufen. Bitte wähle die Kategorie erneut.');
        if (step > draft.step)
            throw new errors_1.AppError('CONFLICT', 'Bitte zuerst die vorherigen Schritte ausfüllen.');
        const [cat, fields] = await Promise.all([this.config.category(draft.categoryId), this.formFields(draft.categoryId, draft.formVersion)]);
        const steps = (0, shared_1.planFormSteps)(fields);
        if (!steps[step])
            throw new errors_1.AppError('NOT_FOUND', 'Diesen Schritt gibt es nicht.');
        return { modal: (0, shared_1.formModal)(`tk:formsub:${draft.id}:${step}`, this.formTitle(cat.name, step, steps.length), fields.filter((f) => steps[step].includes(f.id)), draft.values) };
    }
    /**
     * Schritt absenden: serverseitig prüfen (dieselbe Prüfung wie im Dashboard), Werte am Entwurf speichern; im letzten Schritt
     * das Ticket anlegen. Ein Entwurf erzeugt höchstens ein Ticket (erneutes Absenden liefert dasselbe Ticket).
     */
    async formSubmit(draftId, discordId, step, values, files) {
        const draft = await this.draftOf(draftId, discordId);
        if (draft.ticketId) {
            const l = await this.load(draft.ticketId).catch(() => null);
            if (l)
                return { ticket: this.summary(l), effects: [], existing: true };
        }
        if (draft.expiresAt < new Date())
            throw new errors_1.AppError('CONFLICT', 'Das Formular ist abgelaufen. Bitte wähle die Kategorie erneut.');
        if (step > draft.step)
            throw new errors_1.AppError('CONFLICT', 'Bitte zuerst die vorherigen Schritte ausfüllen.');
        const fields = await this.formFields(draft.categoryId, draft.formVersion);
        const steps = (0, shared_1.planFormSteps)(fields);
        const ids = steps[step];
        if (!ids)
            throw new errors_1.AppError('NOT_FOUND', 'Diesen Schritt gibt es nicht.');
        // nur Felder dieses Schritts übernehmen (manipulierte Zusatzfelder werden verworfen)
        const pick = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => ids.includes(k)));
        const allValues = { ...draft.values, ...pick(values) };
        const allFiles = { ...draft.files, ...pick(files) };
        const check = (0, shared_1.validateForm)(fields, allValues, allFiles, { only: ids });
        await this.prisma.ticketDraft.update({ where: { id: draft.id }, data: {
                values: allValues, files: allFiles,
                ...(check.ok && step === draft.step && step + 1 < steps.length ? { step: step + 1 } : {}),
            } });
        if (!check.ok) {
            const label = new Map(fields.map((f) => [f.id, f.label]));
            return { errors: Object.entries(check.errors).map(([id, msg]) => ({ field: label.get(id) ?? id, message: msg })), step };
        }
        if (step + 1 < steps.length)
            return { next: step + 1, steps: steps.length };
        const full = (0, shared_1.validateForm)(fields, allValues, allFiles);
        if (!full.ok)
            return { errors: Object.entries(full.errors).map(([id, msg]) => ({ field: fields.find((f) => f.id === id)?.label ?? id, message: msg })), step: steps.findIndex((s) => s.some((id) => full.errors[id])) };
        const r = await this.open({
            categoryId: draft.categoryId, panelId: draft.panelId, guildId: draft.guildId, discordId: draft.discordId, discordName: draft.discordName, memberRoleIds: draft.memberRoleIds,
            openKey: `draft:${draft.id}`, form: { version: draft.formVersion, answers: full.answers, subject: full.answers.find((a) => a.questionId === 'subject')?.value ?? null },
        }, { userId: null, discordId: draft.discordId, name: draft.discordName, viaBot: true });
        if ('form' in r)
            throw new errors_1.AppError('CONFLICT', 'Das Formular konnte nicht verarbeitet werden.');
        await this.prisma.ticketDraft.update({ where: { id: draft.id }, data: { ticketId: r.ticket.id, values: {}, files: {} } });
        return r;
    }
    /** Dashboard-Vorschau: Formular prüfen, ohne ein Ticket anzulegen. */
    previewForm(fields, values) {
        const r = (0, shared_1.validateForm)(fields, values, Object.fromEntries(fields.filter((f) => f.type === 'FILE').map((f) => [f.id, []])), { allowedFileTypes: shared_1.FORM_FILE_TYPES });
        return { ...r, steps: (0, shared_1.planFormSteps)(fields) };
    }
    // ================= Automatik (läuft jede Minute) =================
    /** Ersteller hat den Discord-Server verlassen: offene Tickets dort schließen (Einstellung unter Tickets → General). */
    async memberLeft(guildId, discordId) {
        const settings = await this.config.settings();
        if (settings.memberLeaveAction !== 'CLOSE')
            return { closed: 0 };
        const sys = { userId: null, discordId: null, name: 'Automatik', viaBot: false, system: true };
        const effects = [];
        let closed = 0;
        for (const t of await this.prisma.supportTicket.findMany({ where: { guildId, creatorId: discordId, closedAt: null, deletedAt: null }, select: { id: true } })) {
            await this.close(await this.load(t.id), sys, settings.memberLeaveReason, effects).then(() => closed++, (e) => this.log.warn(`member-left close ${t.id}: ${e.message}`));
        }
        await this.dispatch(effects, false);
        return { closed };
    }
    async runAutomation(now = new Date()) {
        const sys = { userId: null, discordId: null, name: 'Automatik', viaBot: false, system: true };
        const effects = [];
        let closed = 0, warned = 0, deleted = 0, expired = 0;
        for (const a of await this.prisma.ticketAccess.findMany({ where: { expiresAt: { lte: now } } })) {
            await this.prisma.ticketAccess.delete({ where: { id: a.id } });
            const t = await this.prisma.supportTicket.findUnique({ where: { id: a.ticketId } });
            if (t?.channelId && !t.deletedAt)
                effects.push({ type: 'access', channelId: t.channelId, targetId: a.targetId, kind: a.kind === 'USER' ? 'user' : 'role', view: null });
            if (t)
                await this.prisma.ticketLog.create({ data: { ticketId: t.id, action: 'access_expired', actorName: sys.name, detail: { target: a.targetId } } });
            expired++;
        }
        const openIds = (await this.prisma.ticketStatus.findMany({ where: { kind: 'OPEN' } })).map((s) => s.id);
        const cats = await this.prisma.ticketCategory.findMany({ where: { autoCloseMinutes: { gt: 0 } } });
        for (const c of cats) {
            const idleSince = new Date(now.getTime() - (c.autoCloseMinutes - Math.min(c.autoCloseWarnMinutes, c.autoCloseMinutes)) * 60_000);
            for (const t of await this.prisma.supportTicket.findMany({ where: { categoryId: c.id, statusId: { in: openIds }, deletedAt: null, closedAt: null, channelId: { not: null }, lastActivityAt: { lte: idleSince } } })) {
                const idle = (now.getTime() - t.lastActivityAt.getTime()) / 60_000;
                const l = await this.load(t.id);
                if (idle >= c.autoCloseMinutes) {
                    await this.close(l, sys, 'Automatisch geschlossen (keine Aktivität)', effects);
                    closed++;
                }
                else if (c.autoCloseWarnMinutes > 0 && !t.warnedAt) {
                    await this.prisma.supportTicket.update({ where: { id: t.id }, data: { warnedAt: now } });
                    effects.push({ type: 'post', channelId: t.channelId, message: { content: mention(t.creatorId), mentionUsers: [t.creatorId], embeds: [{ description: (0, shared_1.renderTicketText)(c.autoCloseMessage || '⏰ Dieses Ticket wird bald wegen Inaktivität geschlossen.', this.vars(l)), color: 0xf59e0b }] } });
                    await this.prisma.ticketLog.create({ data: { ticketId: t.id, action: 'auto_warning', actorName: sys.name } });
                    warned++;
                }
            }
        }
        // Auto-Team-Alert (Bearbeiter markieren, nach derselben Zeit freigeben) und Auto-Unclaim
        let alerted = 0, unclaimed = 0;
        for (const c of await this.prisma.ticketCategory.findMany({ where: { OR: [{ staffAlertMinutes: { gt: 0 } }, { autoUnclaimMinutes: { gt: 0 } }] } })) {
            const first = Math.min(...[c.staffAlertMinutes, c.autoUnclaimMinutes].filter((m) => m > 0));
            for (const t of await this.prisma.supportTicket.findMany({ where: { categoryId: c.id, statusId: { in: openIds }, deletedAt: null, closedAt: null, channelId: { not: null }, claimers: { isEmpty: false }, lastActivityAt: { lte: new Date(now.getTime() - first * 60_000) } } })) {
                const idle = (now.getTime() - t.lastActivityAt.getTime()) / 60_000;
                const alertedFor = t.staffAlertedAt ? (now.getTime() - t.staffAlertedAt.getTime()) / 60_000 : 0;
                const unclaim = (c.autoUnclaimMinutes > 0 && idle >= c.autoUnclaimMinutes) || (c.staffAlertMinutes > 0 && !!t.staffAlertedAt && alertedFor >= c.staffAlertMinutes);
                if (unclaim) {
                    for (const target of t.claimers)
                        await this.perform(await this.load(t.id), sys, { action: 'unclaim', targetId: target }, effects).catch((e) => this.log.warn(`auto-unclaim ${t.id}: ${e.message}`));
                    await this.prisma.supportTicket.update({ where: { id: t.id }, data: { staffAlertedAt: null } });
                    unclaimed++;
                }
                else if (c.staffAlertMinutes > 0 && !t.staffAlertedAt && idle >= c.staffAlertMinutes) {
                    await this.prisma.supportTicket.update({ where: { id: t.id }, data: { staffAlertedAt: now } });
                    effects.push({ type: 'post', channelId: t.channelId, message: { content: t.claimers.map(mention).join(' '), mentionUsers: t.claimers, embeds: [{ description: `⏰ Dieses Ticket wartet seit ${Math.round(idle)} Minuten. Bitte kümmere dich darum – sonst wird es in ${c.staffAlertMinutes} Minuten automatisch freigegeben.`, color: 0xf59e0b }] } });
                    await this.prisma.ticketLog.create({ data: { ticketId: t.id, action: 'staff_alert', actorName: sys.name } });
                    alerted++;
                }
            }
        }
        for (const t of await this.prisma.supportTicket.findMany({ where: { deleteAt: { lte: now }, deletedAt: null } })) {
            const l = await this.load(t.id);
            await this.perform(l, sys, { action: 'delete' }, effects);
            deleted++;
        }
        const sla = await this.runSla(now, effects);
        // abgelaufene, nie abgeschickte Formular-Entwürfe (keine Tickets) nach einem Tag entfernen
        await this.prisma.ticketDraft.deleteMany({ where: { ticketId: null, expiresAt: { lt: new Date(now.getTime() - 86_400_000) } } });
        const settings = await this.config.settings();
        if (sla.reminded || sla.escalated)
            this.log.log(JSON.stringify(sla));
        if (settings.transcriptRetentionDays > 0)
            await this.prisma.ticketTranscript.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - settings.transcriptRetentionDays * 86_400_000) } } });
        await this.dispatch(effects, false);
        return { closed, warned, deleted, expired, alerted, unclaimed, ...sla };
    }
    /**
     * SLA und Eskalation (nur mit eingestellten Zielzeiten): Erinnerung an die Zuständigen (wiederholt nach Einstellung),
     * danach einmalige Meldung an die Leitung; unzugewiesene Tickets nach der Wartezeit der Kategorie. Eskalationen geben
     * NIEMANDEM zusätzlichen Zugriff – die Leitung wird nur benachrichtigt.
     */
    async runSla(now, effects) {
        const sys = { userId: null, discordId: null, name: 'Automatik', viaBot: false, system: true, requestId: `sla-${now.toISOString()}` };
        let reminded = 0, escalated = 0;
        const openIds = (await this.prisma.ticketStatus.findMany({ where: { kind: 'OPEN' } })).map((s) => s.id);
        const due = await this.prisma.supportTicket.findMany({ where: { statusId: { in: openIds }, deletedAt: null, closedAt: null, OR: [{ firstResponseAt: null, firstResponseDueAt: { lt: now } }, { waitingSince: null, resolveDueAt: { lt: now } }] }, take: 200 });
        for (const row of due) {
            const l = await this.load(row.id).catch(() => null);
            if (!l)
                continue;
            const t = l.t, s = l.settings, ref = this.ref(t.number, s);
            const first = !t.firstResponseAt && !!t.firstResponseDueAt && t.firstResponseDueAt < now;
            const dueAt = first ? t.firstResponseDueAt : t.resolveDueAt;
            const warnedAt = first ? t.slaFirstWarnedAt : t.slaResolveWarnedAt;
            const what = first ? 'erste Antwort' : 'Lösung';
            if (!warnedAt || (s.slaReminderMinutes > 0 && now.getTime() - warnedAt.getTime() >= s.slaReminderMinutes * 60_000)) {
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: first ? { slaFirstWarnedAt: now } : { slaResolveWarnedAt: now } });
                const text = `⏰ SLA überschritten (${what}) – Ticket **${ref}** seit ${this.fmt(dueAt, l.tz)} fällig.`;
                const safe = l.cat.confidential ? `⏰ SLA überschritten (${what}) – vertrauliches Ticket **${ref}**.` : text;
                let sent = false;
                for (const c of t.claimers)
                    if (await this.staffWithAccess(c, l.cat, l.dept)) {
                        effects.push({ type: 'dm', userId: c, message: { embeds: [{ description: safe, color: 0xf59e0b }], buttons: [{ id: `tk-open-${t.id}`, label: 'Im Dashboard öffnen', style: 'secondary', url: (0, web_url_1.webUrl)(`/support-tickets/${t.id}`) }] } });
                        sent = true;
                    }
                if (!sent) {
                    const roles = (await this.routing(l.cat, l.dept, s)).responsible;
                    const target = l.dept?.notifyChannelId ?? t.channelId;
                    // im Ticket-Kanal sieht der Ersteller mit: dort nur ein Hinweis an die zuständigen Rollen
                    if (target)
                        effects.push({ type: 'post', channelId: target, message: { content: roles.map((r) => `<@&${r}>`).join(' ') || undefined, mentionRoles: roles, embeds: [{ description: target === t.channelId ? `⏰ Dieses Ticket wartet auf das Team (${what} fällig seit ${this.fmt(dueAt, l.tz)}).` : safe, color: 0xf59e0b }] } });
                }
                await this.prisma.ticketLog.create({ data: { ticketId: t.id, action: 'sla_reminder', actorName: sys.name, detail: { kind: first ? 'first_response' : 'resolution' } } });
                reminded++;
            }
            if (!t.slaEscalatedAt && now.getTime() - dueAt.getTime() >= s.slaEscalateAfterMinutes * 60_000) {
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { slaEscalatedAt: now } });
                await this.leadAlert(l, `🔺 SLA-Eskalation: Ticket **${ref}** (${l.cat.confidential ? 'vertraulich' : l.cat.name}) – ${what} seit ${this.fmt(dueAt, l.tz)} überfällig.`, effects);
                await this.logAction(l, 'sla_escalated', sys, { kind: first ? 'first_response' : 'resolution' }, effects);
                escalated++;
            }
        }
        for (const c of await this.prisma.ticketCategory.findMany({ where: { escalateUnassignedMinutes: { gt: 0 } } })) {
            const rows = await this.prisma.supportTicket.findMany({ where: { categoryId: c.id, statusId: { in: openIds }, deletedAt: null, closedAt: null, claimers: { isEmpty: true }, unassignedEscalatedAt: null, createdAt: { lte: new Date(now.getTime() - c.escalateUnassignedMinutes * 60_000) } }, take: 100 });
            for (const row of rows) {
                const l = await this.load(row.id).catch(() => null);
                if (!l)
                    continue;
                await this.prisma.supportTicket.update({ where: { id: row.id }, data: { unassignedEscalatedAt: now } });
                await this.leadAlert(l, `🔺 Ticket **${this.ref(row.number, l.settings)}** (${c.confidential ? 'vertraulich' : c.name}) ist seit ${c.escalateUnassignedMinutes} Minuten niemandem zugewiesen.`, effects);
                await this.logAction(l, 'unassigned_escalated', sys, {}, effects);
                escalated++;
            }
        }
        return { reminded, escalated };
    }
    /** Meldung an die Leitung im internen Kanal der Abteilung (sonst Log-Kanal) + Benachrichtigungsregel „Eskalation“. */
    async leadAlert(l, text, effects) {
        const leads = l.dept?.leadRoleIds.length ? l.dept.leadRoleIds : l.settings.leadRoleIds;
        const channel = l.dept?.notifyChannelId ?? l.settings.logChannelId;
        if (channel)
            effects.push({ type: 'post', channelId: channel, message: { content: leads.map((r) => `<@&${r}>`).join(' ') || undefined, mentionRoles: leads, embeds: [{ description: text, color: 0xef4444 }], buttons: [{ id: `tk-open-${l.t.id}`, label: 'Im Dashboard öffnen', style: 'secondary', url: (0, web_url_1.webUrl)(`/support-tickets/${l.t.id}`) }] } });
        else
            this.log.warn(`escalation for ticket ${l.t.id}: no channel configured`);
        if (!l.dept?.notifyChannelId)
            return;
        const rule = l.settings.notifications.escalated;
        if (rule.dashboard || rule.dm)
            await this.queueNotify(l, 'escalated', effects, text);
    }
};
exports.SupportTicketsService = SupportTicketsService;
exports.SupportTicketsService = SupportTicketsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, permission_service_1.PermissionService, discord_service_1.DiscordService, config_service_1.TicketConfigService,
        notify_service_1.NotifyService, audit_service_1.AuditService, transcript_service_1.TicketTranscriptService])
], SupportTicketsService);
//# sourceMappingURL=tickets.service.js.map