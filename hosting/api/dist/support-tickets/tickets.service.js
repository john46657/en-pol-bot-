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
exports.SupportTicketsService = void 0;
const notify_service_1 = require("../notifications/notify.service");
const common_1 = require("@nestjs/common");
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
const config_service_1 = require("./config.service");
const transcript_1 = require("./transcript");
const MAX_ATTACHMENT = 8 * 1024 * 1024;
const INLINE_IMAGE = 2 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const mention = (id) => `<@${id}>`;
/** Welches Recht welche API-Aktion braucht (Katalog in @enrp/shared). */
const PERM = {
    close: 'close', close_request: 'close_request', reopen: 'reopen', claim: 'claim', unclaim: 'unclaim', add_access: 'add_user', remove_access: 'remove_user', priority: 'priority', status: 'status',
    category: 'category', rename: 'rename', move: 'move', transcript: 'transcript', lock: 'lock', unlock: 'unlock', escalate: 'escalate', note: 'note', rating: 'rating', delete: 'delete',
};
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
    log = new common_1.Logger('Tickets');
    dir = node_path_1.default.resolve((0, env_1.loadEnv)().STORAGE_DIR, 'tickets');
    constructor(prisma, perms, discord, config, notify) {
        this.prisma = prisma;
        this.perms = perms;
        this.discord = discord;
        this.config = config;
        this.notify = notify;
    }
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
            throw new errors_1.AppError('NOT_FOUND', 'Ticket not found.');
        const [cat, status, priority, settings, tz] = await Promise.all([
            this.config.category(t.categoryId), this.prisma.ticketStatus.findUniqueOrThrow({ where: { id: t.statusId } }),
            t.priorityId ? this.prisma.ticketPriority.findUnique({ where: { id: t.priorityId } }) : Promise.resolve(null), this.config.settings(), this.timezone(),
        ]);
        return { t, cat, status, priority, settings, tz };
    }
    vars(l, extra = {}) {
        const { t, cat, status, priority, tz } = l;
        return {
            '{user}': mention(t.creatorId), '{username}': t.creatorName, '{user_id}': t.creatorId, '{ticket_id}': (0, shared_1.ticketNumber)(t.number), '{category}': cat.name,
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
        for (const b of l.cat.buttons) {
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
            { name: 'Status', value: v['{status}'], inline: true }, { name: 'Priorität', value: v['{priority}'], inline: true },
            { name: l.cat.claimMode === 'PRIMARY' && l.t.claimers.length > 1 ? 'Bearbeiter (Haupt + Helfer)' : 'Bearbeiter', value: v['{staff}'], inline: true },
            ...(l.t.locked ? [{ name: 'Gesperrt', value: '⛔ Der Ersteller kann nicht schreiben.', inline: false }] : []),
        ];
        const embed = {
            title: (0, shared_1.renderTicketText)(l.cat.welcomeTitle || '🎫 {category}', v).slice(0, 256),
            description: (0, shared_1.renderTicketText)(l.cat.welcomeMessage || 'Hallo {user}!', v).slice(0, 4000),
            color: closed ? l.settings.closedColor : l.priority?.color ?? l.cat.color, fields, footer: `Ticket #${(0, shared_1.ticketNumber)(l.t.number)} · erstellt ${this.fmt(l.t.createdAt, l.tz)}`,
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
        const qs = cat.questions;
        const q = qs[idx];
        if (!q)
            return null;
        const buttons = [];
        let select;
        // Zeichenlimit im Button (das Formular in Discord kennt die Frage sonst nicht): …:l:min-max
        const lim = q.minLength || q.maxLength ? `:${q.minLength ?? 0}-${q.maxLength ?? (q.type === 'LONG' ? 2000 : 200)}` : '';
        if (q.type === 'SHORT' || q.type === 'LONG')
            buttons.push({ id: `tk:ans:${t.id}:${q.id}:${q.type === 'LONG' ? 'l' : 's'}${lim}`, label: 'Antworten', emoji: '✍️', style: 'primary' });
        if (q.type === 'YESNO')
            buttons.push({ id: `tk:ansv:${t.id}:${q.id}:Ja`, label: 'Ja', style: 'success' }, { id: `tk:ansv:${t.id}:${q.id}:Nein`, label: 'Nein', style: 'danger' });
        if (q.type === 'SELECT' || q.type === 'MULTI')
            select = { id: `tk:anss:${t.id}:${q.id}`, placeholder: q.placeholder || 'Bitte auswählen …', min: q.required ? 1 : 0, max: q.type === 'MULTI' ? q.options.length : 1, options: q.options.slice(0, 25).map((o) => ({ label: o.slice(0, 100), value: o.slice(0, 100) })) };
        if (!q.required)
            buttons.push({ id: `tk:skip:${t.id}:${q.id}`, label: 'Überspringen', style: 'secondary' });
        return { embeds: [{ title: `Frage ${idx + 1}/${qs.length}`, description: `${q.label}${q.description ? `\n-# ${q.description}` : ''}${q.required ? '' : '\n\n*(optional)*'}`, color: cat.color, footer: 'Nur der Ticket-Ersteller kann antworten.' }], buttons, select };
    }
    async logAction(l, action, actor, detail, effects, text) {
        await this.prisma.ticketLog.create({ data: { ticketId: l.t.id, action, actorId: actor.discordId, actorName: actor.name, detail: detail } });
        if (l.settings.logChannelId && text)
            effects.push({ type: 'post', channelId: l.settings.logChannelId, message: { embeds: [{ description: `**#${(0, shared_1.ticketNumber)(l.t.number)}** (${l.t.name}) · ${text}`, color: 0x64748b, footer: actor.name }] } });
    }
    async dispatch(effects, viaBot) {
        if (!effects.length)
            return [];
        if (viaBot)
            return effects;
        await this.discord.enqueue('tickets', 'ticket.effects', { effects }, { always: true });
        return [];
    }
    /** Darf der Mitarbeiter diese Kategorie sehen / dieses Recht ausüben? (ticket.manage darf alles) */
    async assertCan(actor, perm, cat) {
        if (actor.system)
            return;
        if (!actor.userId)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Your Discord account is not linked to a staff account.');
        if (await this.perms.has(actor.userId, 'ticket.manage'))
            return;
        if (!(await this.perms.has(actor.userId, perm)))
            throw new errors_1.AppError('PERMISSION_DENIED', 'You do not have permission to perform this action.');
        if (!(await this.categoryVisible(actor.userId, cat)))
            throw new errors_1.AppError('PERMISSION_DENIED', 'You have no access to tickets of this category.');
    }
    async categoryVisible(userId, cat) {
        if (!cat.accessRoleNames.length)
            return true;
        const roles = await this.prisma.userRole.findMany({ where: { userId }, include: { role: { select: { name: true } } } });
        return roles.some((r) => cat.accessRoleNames.includes(r.role.name));
    }
    /** IDs der Kategorien, deren Tickets der Benutzer sehen darf (null = alle). */
    async visibleCategoryIds(userId) {
        if (await this.perms.has(userId, 'ticket.manage'))
            return null;
        const [cats, roles] = await Promise.all([
            this.prisma.ticketCategory.findMany({ select: { id: true, accessRoleNames: true } }),
            this.prisma.userRole.findMany({ where: { userId }, include: { role: { select: { name: true } } } }),
        ]);
        const mine = new Set(roles.map((r) => r.role.name));
        return cats.filter((c) => !c.accessRoleNames.length || c.accessRoleNames.some((n) => mine.has(n))).map((c) => c.id);
    }
    // ================= Öffnen =================
    /** Prüft alle Voraussetzungen, legt das Ticket an und liefert den „create“-Effekt (Channel, Rechte, Ticket-Embed, erste Frage). */
    /** `byStaff`: vom Team für ein Mitglied geöffnet (Recht ticket.create) – ohne Rollen-, Limit- und Cooldown-Prüfung. */
    async open(d, actor, byStaff = false) {
        const cat = await this.config.category(d.categoryId);
        if (!cat.active)
            throw new errors_1.AppError('CONFLICT', 'Diese Ticket-Art ist derzeit deaktiviert.');
        if (cat.guildId && cat.guildId !== d.guildId)
            throw new errors_1.AppError('CONFLICT', 'Diese Ticket-Art gibt es auf diesem Server nicht.');
        if (!byStaff)
            await this.checkCanOpen(cat, d);
        return this.create(cat, d, actor);
    }
    async checkCanOpen(cat, d) {
        if (d.panelId) {
            const panel = await this.prisma.ticketPanel.findUnique({ where: { id: d.panelId } });
            if (panel?.allowedRoleIds.length && !panel.allowedRoleIds.some((r) => d.memberRoleIds.includes(r)))
                throw new errors_1.AppError('PERMISSION_DENIED', 'Du darfst dieses Ticket-Panel nicht benutzen.');
        }
        if (cat.requiredRoleIds.length && !cat.requiredRoleIds.some((r) => d.memberRoleIds.includes(r)))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Dir fehlt die nötige Rolle für diese Ticket-Art.');
        if (cat.allowedUserIds.length && !cat.allowedUserIds.includes(d.discordId))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Du darfst diese Ticket-Art nicht öffnen.');
        if (cat.maxOpen > 0) {
            const open = await this.prisma.supportTicket.findMany({ where: { creatorId: d.discordId, categoryId: cat.id, closedAt: null, deletedAt: null }, select: { channelId: true } });
            if (open.length >= cat.maxOpen)
                throw new errors_1.AppError('CONFLICT', `Du hast bereits ${open.length} offene${open.length === 1 ? 's' : ''} Ticket${open.length === 1 ? '' : 's'} dieser Art${open[0]?.channelId ? `: <#${open[0].channelId}>` : ''}.`);
        }
        if (cat.cooldownMinutes > 0) {
            const last = await this.prisma.supportTicket.findFirst({ where: { creatorId: d.discordId, categoryId: cat.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
            const wait = last ? last.createdAt.getTime() + cat.cooldownMinutes * 60_000 - Date.now() : 0;
            if (wait > 0)
                throw new errors_1.AppError('CONFLICT', `Bitte warte noch ${Math.ceil(wait / 60_000)} Minute(n), bevor du ein neues Ticket dieser Art öffnest.`);
        }
    }
    async create(cat, d, actor) {
        const status = await this.prisma.ticketStatus.findFirst({ where: { isDefault: true } }) ?? await this.prisma.ticketStatus.findFirst({ where: { kind: 'OPEN' }, orderBy: { position: 'asc' } });
        if (!status)
            throw new errors_1.AppError('CONFLICT', 'Kein offener Ticket-Status eingerichtet (Dashboard → Tickets → Einstellungen).');
        const priority = cat.defaultPriorityId ? await this.prisma.ticketPriority.findUnique({ where: { id: cat.defaultPriorityId } }) : await this.prisma.ticketPriority.findFirst({ where: { isDefault: true } });
        const link = await this.prisma.discordLink.findUnique({ where: { discordId: d.discordId } });
        let t = await this.prisma.supportTicket.create({ data: { categoryId: cat.id, panelId: d.panelId ?? null, guildId: d.guildId, name: 'ticket', creatorId: d.discordId, creatorName: d.discordName, creatorUserId: link?.userId, statusId: status.id, priorityId: priority?.id } });
        const [settings, tz] = await Promise.all([this.config.settings(), this.timezone()]);
        const name = (0, shared_1.ticketChannelName)(cat.channelNameFormat, this.vars({ t, cat, status, priority, tz }));
        t = await this.prisma.supportTicket.update({ where: { id: t.id }, data: { name } });
        const l = { t, cat, status, priority, settings, tz };
        const effects = [];
        await this.logAction(l, 'created', actor, { category: cat.name, by: actor.discordId === d.discordId ? 'creator' : actor.name }, effects, `🎫 Ticket erstellt von ${mention(d.discordId)} (${cat.name})`);
        const control = this.control(l);
        // Zuständige Rollen: die der Kategorie – ohne eigene die allgemeine Staff-Rolle (Einstellungen → Discord-Bot-Channels)
        const fallback = cat.staffRoleIds.length ? [] : ((await this.discord.channels()).staffRole ?? '').split(/[\s,;]+/).filter((r) => /^\d{15,25}$/.test(r));
        const responsible = cat.staffRoleIds.length ? cat.staffRoleIds : fallback;
        const staffRoles = [...new Set([...responsible, ...cat.extraRoleIds])];
        const mentionText = (0, shared_1.renderTicketText)(cat.mentionText || '', this.vars(l)).trim();
        // neues Ticket: Ersteller und zuständige Rollen werden gepingt
        control.content = [mention(d.discordId), ...(cat.mentionStaff ? responsible.map((r) => `<@&${r}>`) : []), mentionText].filter(Boolean).join(' ');
        control.mentionUsers = [d.discordId];
        control.mentionRoles = cat.mentionStaff ? responsible : [];
        const first = this.questionMessage(t, cat, 0);
        effects.unshift({
            type: 'create', ticketId: t.id, guildId: d.guildId, name, parentId: cat.discordCategoryId, topic: `Ticket #${(0, shared_1.ticketNumber)(t.number)} · ${cat.name} · ${d.discordName} (${d.discordId})`,
            viewers: [{ id: d.discordId, kind: 'user', send: true }, ...staffRoles.map((id) => ({ id, kind: 'role', send: true }))], control, messages: first ? [first] : [],
        });
        await this.panelLoad(cat.id, effects);
        return { ticket: this.summary(l), effects: await this.dispatch(effects, actor.viaBot) };
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
            throw new errors_1.AppError('VALIDATION_FAILED', 'Set the Discord server (guild) ID in Settings → Discord bot channels first.');
        return this.open({ categoryId: d.categoryId, guildId, discordId: d.discordId, discordName: d.discordName || d.discordId, memberRoleIds: [] }, actor, true);
    }
    /** Für /ticket im Discord: aktive Ticket-Arten (Voraussetzungen prüft der Bot vorab, das System beim Öffnen erneut). */
    async openableCategories(guildId) {
        const cats = await this.prisma.ticketCategory.findMany({ where: { active: true, ...(guildId ? { OR: [{ guildId }, { guildId: null }] } : {}) }, orderBy: [{ position: 'asc' }, { name: 'asc' }] });
        return cats.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, description: c.description, requiredRoleIds: c.requiredRoleIds, allowedUserIds: c.allowedUserIds }));
    }
    /** Bot meldet: Channel und Ticket-Embed sind angelegt. */
    async attachChannel(id, channelId, controlMessageId) {
        await this.prisma.supportTicket.update({ where: { id }, data: { channelId, controlMessageId, lastActivityAt: new Date() } }).catch(() => { throw new errors_1.AppError('NOT_FOUND', 'Ticket not found.'); });
        return { ok: true };
    }
    /** Bot meldet: Channel konnte nicht angelegt werden → Ticket verwerfen. */
    async abort(id, reason) {
        const t = await this.prisma.supportTicket.findUnique({ where: { id } });
        if (t && !t.channelId)
            await this.prisma.supportTicket.update({ where: { id }, data: { deletedAt: new Date(), closedAt: new Date(), closeReason: `Channel konnte nicht erstellt werden: ${reason}`.slice(0, 300) } });
        return { ok: true };
    }
    // ================= Fragen =================
    async answer(id, discordId, questionId, values) {
        const l = await this.load(id);
        if (l.t.creatorId !== discordId)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Nur der Ticket-Ersteller kann die Fragen beantworten.');
        if (this.isClosed(l))
            throw new errors_1.AppError('CONFLICT', 'Das Ticket ist geschlossen.');
        const qs = l.cat.questions;
        const q = qs[l.t.questionIndex];
        if (!q || q.id !== questionId)
            throw new errors_1.AppError('CONFLICT', 'Diese Frage wurde bereits beantwortet.');
        if (values === null && q.required)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Diese Frage ist Pflicht.');
        const clean = (values ?? []).map((v) => v.trim()).filter(Boolean);
        if (q.required && !clean.length)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Bitte eine Antwort angeben.');
        if ((q.type === 'SELECT' || q.type === 'MULTI') && clean.some((v) => !q.options.includes(v)))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Ungültige Auswahl.');
        if ((q.type === 'SHORT' || q.type === 'LONG') && clean.length) {
            const len = clean.join(', ').length;
            if (q.minLength && len < q.minLength)
                throw new errors_1.AppError('VALIDATION_FAILED', `Die Antwort ist zu kurz (mindestens ${q.minLength} Zeichen).`);
            if (q.maxLength && len > q.maxLength)
                throw new errors_1.AppError('VALIDATION_FAILED', `Die Antwort ist zu lang (höchstens ${q.maxLength} Zeichen).`);
        }
        const value = values === null ? '— (übersprungen)' : clean.join(', ').slice(0, 2000);
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
        const perm = shared_1.TICKET_ACTIONS[PERM[input.action]].permission;
        await this.assertCan(actor, perm, l.cat);
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
                const status = await this.prisma.ticketStatus.findFirst({ where: { isDefault: true } }) ?? await this.prisma.ticketStatus.findFirstOrThrow({ where: { kind: 'OPEN' } });
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { statusId: status.id, closedAt: null, closedById: null, closedByName: null, closeReason: null, deleteAt: null, warnedAt: null, lastActivityAt: new Date() } });
                if (ch)
                    for (const u of await users())
                        effects.push({ type: 'access', channelId: ch, targetId: u, kind: 'user', view: true, send: !t.locked });
                post({ embeds: [{ description: (0, shared_1.renderTicketText)(l.settings.reopenedMessage, this.vars(l, { '{actor}': this.actorTag(actor) })), color: 0x22c55e }] });
                await refresh();
                await this.logAction(l, 'reopened', actor, {}, effects, `🔓 Wieder geöffnet von ${this.actorTag(actor)}`);
                await this.panelLoad(l.cat.id, effects);
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
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { claimers, ...(claimedStatus ? { statusId: claimedStatus.id } : {}), firstResponseAt: t.firstResponseAt ?? new Date() } });
                const fresh = await refresh();
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
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { priorityId: p.id } });
                await refresh();
                post({ content: p.notifyRoleIds.map((r) => `<@&${r}>`).join(' ') || undefined, mentionRoles: p.notifyRoleIds, embeds: [{ description: `🔔 Priorität: **${`${p.emoji} ${p.name}`.trim()}** (von ${this.actorTag(actor)})`, color: p.color }] });
                await this.logAction(l, 'priority_changed', actor, { from: l.priority?.name ?? null, to: p.name }, effects, `🔔 Priorität → ${p.name}`);
                return `Priorität: ${p.name}`;
            }
            case 'status': {
                const s = await this.prisma.ticketStatus.findUnique({ where: { id: input.statusId } });
                if (!s)
                    throw new errors_1.AppError('NOT_FOUND', 'Status nicht gefunden.');
                const closed = this.isClosed(l);
                if (closed !== (s.kind !== 'OPEN'))
                    throw new errors_1.AppError('CONFLICT', closed ? 'Geschlossene Tickets: zuerst wieder öffnen (oder Status „Archiviert“).' : 'Zum Schließen bitte „Schließen“ benutzen.');
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { statusId: s.id } });
                await refresh();
                post({ embeds: [{ description: `🏷️ Status: **${`${s.emoji} ${s.name}`.trim()}** (von ${this.actorTag(actor)})`, color: s.color }] });
                await this.logAction(l, 'status_changed', actor, { from: l.status.name, to: s.name }, effects, `🏷️ Status → ${s.name}`);
                return `Status: ${s.name}`;
            }
            case 'category': {
                const to = await this.config.category(input.categoryId);
                if (to.id === l.cat.id)
                    throw new errors_1.AppError('CONFLICT', 'Das Ticket ist bereits in dieser Kategorie.');
                await this.assertCan(actor, 'ticket.change_category', to);
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { categoryId: to.id } });
                if (ch) {
                    const before = new Set([...l.cat.staffRoleIds, ...l.cat.extraRoleIds]), after = new Set([...to.staffRoleIds, ...to.extraRoleIds]);
                    for (const r of before)
                        if (!after.has(r))
                            effects.push({ type: 'access', channelId: ch, targetId: r, kind: 'role', view: null });
                    for (const r of after)
                        if (!before.has(r))
                            effects.push({ type: 'access', channelId: ch, targetId: r, kind: 'role', view: true, send: true });
                    if (to.discordCategoryId && to.discordCategoryId !== l.cat.discordCategoryId)
                        effects.push({ type: 'move', channelId: ch, parentId: to.discordCategoryId });
                }
                await refresh();
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
                const tr = await this.createTranscript(l.t.id, actor);
                const targets = [...new Set([ch, l.cat.transcriptChannelId ?? l.settings.transcriptChannelId].filter((x) => !!x))];
                effects.push({ type: 'transcript', transcriptId: tr.id, channelIds: targets, filename: `transcript-${(0, shared_1.ticketNumber)(t.number)}.html`, message: { embeds: [{ description: `📋 Transcript für Ticket **#${(0, shared_1.ticketNumber)(t.number)}** (${t.name}) erstellt von ${this.actorTag(actor)}.`, color: 0x5865f2 }] } });
                await this.logAction(l, 'transcript_created', actor, { transcriptId: tr.id }, effects, '📋 Transcript erstellt');
                return 'Transcript erstellt.';
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
                await this.prisma.supportTicket.update({ where: { id: t.id }, data: { escalatedAt: new Date(), ...(status ? { statusId: status.id } : {}), ...(prio && (!l.priority || prio.position > l.priority.position) ? { priorityId: prio.id } : {}) } });
                const fresh = await refresh();
                const roles = [...new Set([...l.cat.escalationRoleIds, ...l.cat.staffRoleIds])];
                post({ content: roles.map((r) => `<@&${r}>`).join(' ') || undefined, mentionRoles: roles, embeds: [{ title: '🟠 Ticket eskaliert', description: (0, shared_1.renderTicketText)(l.cat.escalationMessage || 'Dieses Ticket wurde eskaliert. {staff}', this.vars(fresh, { '{actor}': this.actorTag(actor) })), color: 0xf97316 }] });
                await this.logAction(l, 'escalated', actor, { status: status?.name ?? null, priority: prio?.name ?? null }, effects, `🟠 Eskaliert von ${this.actorTag(actor)}`);
                return 'Ticket eskaliert.';
            }
            case 'note': {
                await this.prisma.ticketNote.create({ data: { ticketId: t.id, authorId: actor.discordId, authorUserId: actor.userId, authorName: actor.name, text: input.text } });
                await this.logAction(l, 'note_added', actor, {}, effects); // Inhalt bleibt intern (nicht im Log-Channel)
                return 'Interne Notiz gespeichert (nur für berechtigte Mitarbeiter sichtbar).';
            }
            case 'rating': {
                effects.push(this.ratingRequest(l));
                await this.logAction(l, 'rating_requested', actor, {}, effects);
                return 'Bewertungsanfrage an den Ersteller gesendet.';
            }
            case 'delete': {
                if (l.cat.transcriptOnClose && !(await this.prisma.ticketTranscript.count({ where: { ticketId: t.id } }))) {
                    const tr = await this.createTranscript(t.id, actor);
                    const target = l.cat.transcriptChannelId ?? l.settings.transcriptChannelId;
                    if (target)
                        effects.push({ type: 'transcript', transcriptId: tr.id, channelIds: [target], filename: `transcript-${(0, shared_1.ticketNumber)(t.number)}.html` });
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
        const updated = await this.prisma.supportTicket.update({ where: { id: t.id }, data: {
                statusId: status.id, closedAt: now, closedById: actor.discordId, closedByName: actor.name, closeReason: reason, deleteAt: del > 0 ? new Date(now.getTime() + del * 60_000) : null,
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
            const tr = await this.createTranscript(t.id, actor);
            const targets = [l.cat.transcriptChannelId ?? l.settings.transcriptChannelId].filter((x) => !!x);
            if (targets.length || l.cat.transcriptToUser)
                effects.push({ type: 'transcript', transcriptId: tr.id, channelIds: targets, userId: l.cat.transcriptToUser ? t.creatorId : null, filename: `transcript-${(0, shared_1.ticketNumber)(t.number)}.html`, message: { embeds: [{ description: `📋 Transcript – Ticket **#${(0, shared_1.ticketNumber)(t.number)}** (${l.cat.name}) · ${reason ?? 'ohne Grund'}`, color: 0x5865f2 }] } });
        }
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
            throw new errors_1.AppError('NOT_FOUND', 'Attachment not found.');
        const msg = await this.prisma.ticketMessage.findFirst({ where: { attachments: { array_contains: [{ storageKey: key }] } } });
        if (!msg)
            throw new errors_1.AppError('NOT_FOUND', 'Attachment not found.');
        const t = await this.prisma.supportTicket.findUniqueOrThrow({ where: { id: msg.ticketId } });
        await this.assertCan({ userId, discordId: null, name: '', viaBot: false }, 'ticket.view', await this.config.category(t.categoryId));
        const meta = msg.attachments.find((a) => a.storageKey === key);
        const data = await (0, promises_1.readFile)(node_path_1.default.join(this.dir, key)).catch(() => { throw new errors_1.AppError('NOT_FOUND', 'Attachment file missing.'); });
        const image = !!meta.contentType && IMAGE_TYPES.includes(meta.contentType);
        return { data, name: meta.name, contentType: image ? meta.contentType : 'application/octet-stream', inline: image };
    }
    // ================= Transcripts =================
    async createTranscript(id, actor) {
        const t = await this.prisma.supportTicket.findUniqueOrThrow({ where: { id } });
        const [cat, status, priority, messages, logs, access, tz] = await Promise.all([
            this.prisma.ticketCategory.findUnique({ where: { id: t.categoryId } }), this.prisma.ticketStatus.findUnique({ where: { id: t.statusId } }),
            t.priorityId ? this.prisma.ticketPriority.findUnique({ where: { id: t.priorityId } }) : null,
            this.prisma.ticketMessage.findMany({ where: { ticketId: id }, orderBy: { createdAt: 'asc' }, take: 10_000 }),
            this.prisma.ticketLog.findMany({ where: { ticketId: id }, orderBy: { createdAt: 'asc' } }),
            this.prisma.ticketAccess.findMany({ where: { ticketId: id } }), this.timezone(),
        ]);
        const names = new Map([[t.creatorId, t.creatorName], ...messages.map((m) => [m.authorId, m.authorName])]);
        const entries = [];
        for (const m of messages) {
            const atts = [];
            for (const a of m.attachments ?? []) {
                let dataUri = null;
                if (a.storageKey && a.contentType && IMAGE_TYPES.includes(a.contentType) && a.size <= INLINE_IMAGE) {
                    const buf = await (0, promises_1.readFile)(node_path_1.default.join(this.dir, a.storageKey)).catch(() => null);
                    if (buf)
                        dataUri = `data:${a.contentType};base64,${buf.toString('base64')}`;
                }
                atts.push({ name: a.name, size: a.size, contentType: a.contentType ?? undefined, dataUri, href: a.storageKey ? (0, web_url_1.webUrl)(`/api/v1/support-tickets/attachments/${a.storageKey}`) : null });
            }
            entries.push({ kind: 'message', at: m.createdAt, author: m.authorName, authorId: m.authorId, avatar: m.authorAvatar, staff: m.isStaff, bot: m.isBot, content: m.content, attachments: atts, embeds: m.embeds ?? [] });
        }
        const LABEL = { created: 'Ticket erstellt', answers: 'Fragen beantwortet', claimed: 'Übernommen', claim_transferred: 'Bearbeiter gewechselt', unclaimed: 'Freigegeben', user_added: 'Benutzer hinzugefügt', user_removed: 'Benutzer entfernt', role_added: 'Rolle hinzugefügt', role_removed: 'Rolle entfernt', priority_changed: 'Priorität geändert', status_changed: 'Status geändert', category_changed: 'Kategorie geändert', renamed: 'Umbenannt', moved: 'Verschoben', locked: 'Gesperrt', unlocked: 'Entsperrt', escalated: 'Eskaliert', closed: 'Geschlossen', reopened: 'Wieder geöffnet', transcript_created: 'Transcript erstellt', note_added: 'Interne Notiz', rating_requested: 'Bewertung angefragt', rated: 'Bewertet', access_expired: 'Zugriff abgelaufen', auto_warning: 'Inaktivitäts-Warnung', deleted: 'Gelöscht' };
        for (const g of logs) {
            const det = g.detail;
            const extra = det.to ? `: ${String(det.from ?? '—')} → ${String(det.to)}` : det.reason ? `: ${String(det.reason)}` : det.target ? `: ${names.get(String(det.target)) ?? String(det.target)}` : '';
            entries.push({ kind: 'event', at: g.createdAt, text: `${LABEL[g.action] ?? g.action}${extra} · ${g.actorName ?? 'System'}` });
        }
        entries.sort((a, b) => a.at.getTime() - b.at.getTime());
        const html = (0, transcript_1.renderTranscript)({
            number: (0, shared_1.ticketNumber)(t.number), name: t.name, category: cat?.name ?? '—', status: status ? `${status.emoji} ${status.name}`.trim() : '—', priority: priority ? `${priority.emoji} ${priority.name}`.trim() : '—',
            creator: { id: t.creatorId, name: t.creatorName }, claimers: t.claimers.map((id) => ({ id, name: names.get(id) ?? id })), participants: access.map((a) => (a.kind === 'USER' ? names.get(a.targetId) ?? a.targetId : `Rolle ${a.targetId}`)),
            createdAt: t.createdAt, closedAt: t.closedAt, closedBy: t.closedByName, closeReason: t.closeReason, generatedAt: new Date(), timezone: tz,
            answers: (t.answers ?? []).map((a) => ({ label: a.label, value: a.value })), entries,
        });
        return this.prisma.ticketTranscript.create({ data: {
                ticketId: id, ticketNumber: t.number, categoryName: cat?.name ?? '—', creatorId: t.creatorId, creatorName: t.creatorName, claimers: t.claimers, statusName: status?.name ?? '—',
                html, sizeBytes: Buffer.byteLength(html), createdById: actor.discordId ?? actor.userId, createdByName: actor.name,
            } });
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
        return { id: l.t.id, number: (0, shared_1.ticketNumber)(l.t.number), name: l.t.name, channelId: l.t.channelId, category: { id: l.cat.id, name: l.cat.name, emoji: l.cat.emoji }, status: l.status, priority: l.priority, claimers: l.t.claimers, creatorId: l.t.creatorId, creatorName: l.t.creatorName, locked: l.t.locked, closedAt: l.t.closedAt, createdAt: l.t.createdAt };
    }
    async list(userId, f) {
        const visible = await this.visibleCategoryIds(userId);
        let claimer = f.claimer;
        if (claimer === 'me')
            claimer = (await this.prisma.discordLink.findUnique({ where: { userId } }))?.discordId ?? '__none__';
        const statuses = await this.prisma.ticketStatus.findMany();
        const kindIds = (k) => statuses.filter((s) => s.kind === k).map((s) => s.id);
        const where = {
            deletedAt: f.kind === 'deleted' ? { not: null } : undefined,
            ...(visible ? { categoryId: { in: f.categoryId ? visible.filter((c) => c === f.categoryId) : visible } } : f.categoryId ? { categoryId: f.categoryId } : {}),
            ...(f.kind === 'open' ? { statusId: { in: kindIds('OPEN') } } : f.kind === 'closed' ? { statusId: { in: kindIds('CLOSED') } } : f.kind === 'archived' ? { statusId: { in: kindIds('ARCHIVED') } } : f.kind === 'escalated' ? { escalatedAt: { not: null }, statusId: { in: kindIds('OPEN') } } : {}),
            ...(f.statusId ? { statusId: f.statusId } : {}), ...(f.priorityId ? { priorityId: f.priorityId } : {}), ...(f.guildId ? { guildId: f.guildId } : {}),
            ...(claimer ? { claimers: { has: claimer } } : {}),
            ...(f.creator ? { OR: [{ creatorId: f.creator }, { creatorName: { contains: f.creator, mode: 'insensitive' } }] } : {}),
            ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
            ...(f.q ? { AND: [{ OR: [{ name: { contains: f.q, mode: 'insensitive' } }, { creatorName: { contains: f.q, mode: 'insensitive' } }, ...(/^#?\d+$/.test(f.q) ? [{ number: Number(f.q.replace('#', '')) }] : [])] }] } : {}),
        };
        const [rows, total, cats, prios] = await Promise.all([
            this.prisma.supportTicket.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
            this.prisma.supportTicket.count({ where }), this.prisma.ticketCategory.findMany({ select: { id: true, name: true, emoji: true } }), this.prisma.ticketPriority.findMany(),
        ]);
        return { total, page: f.page, pageSize: f.pageSize, items: rows.map((t) => ({
                id: t.id, number: (0, shared_1.ticketNumber)(t.number), name: t.name, guildId: t.guildId, creatorId: t.creatorId, creatorName: t.creatorName, claimers: t.claimers, locked: t.locked, createdAt: t.createdAt, closedAt: t.closedAt, deletedAt: t.deletedAt, escalatedAt: t.escalatedAt,
                category: cats.find((c) => c.id === t.categoryId) ?? null, status: statuses.find((s) => s.id === t.statusId) ?? null, priority: prios.find((p) => p.id === t.priorityId) ?? null,
            })) };
    }
    async detail(userId, id) {
        const t = await this.prisma.supportTicket.findUnique({ where: { id } });
        if (!t)
            throw new errors_1.AppError('NOT_FOUND', 'Ticket not found.');
        const cat = await this.config.category(t.categoryId);
        await this.assertCan({ userId, discordId: null, name: '', viaBot: false }, 'ticket.view', cat);
        const [canNotes, canTranscripts] = await Promise.all([this.perms.has(userId, 'ticket.internal_notes'), this.perms.has(userId, 'ticket.transcript')]);
        const [status, priority, access, messages, notes, logs, transcripts, rating] = await Promise.all([
            this.prisma.ticketStatus.findUnique({ where: { id: t.statusId } }), t.priorityId ? this.prisma.ticketPriority.findUnique({ where: { id: t.priorityId } }) : null,
            this.prisma.ticketAccess.findMany({ where: { ticketId: id } }), this.prisma.ticketMessage.findMany({ where: { ticketId: id }, orderBy: { createdAt: 'asc' }, take: 1000 }),
            canNotes ? this.prisma.ticketNote.findMany({ where: { ticketId: id }, orderBy: { createdAt: 'asc' } }) : Promise.resolve(null),
            this.prisma.ticketLog.findMany({ where: { ticketId: id }, orderBy: { createdAt: 'asc' } }),
            canTranscripts ? this.prisma.ticketTranscript.findMany({ where: { ticketId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, createdByName: true, sizeBytes: true } }) : Promise.resolve(null),
            this.prisma.ticketRating.findUnique({ where: { ticketId: id } }),
        ]);
        const names = await this.discordNames([...t.claimers, ...access.filter((a) => a.kind === 'USER').map((a) => a.targetId)]);
        return { ...t, number: (0, shared_1.ticketNumber)(t.number), category: { id: cat.id, name: cat.name, emoji: cat.emoji, claimMode: cat.claimMode, closeReasonMode: cat.closeReasonMode, closeReasonSource: cat.closeReasonSource, allowReopen: cat.allowReopen }, status, priority, access, messages, notes, logs, transcripts, rating, names };
    }
    /** Auswahllisten für Discord-Menüs (Priorität, Status, Kategorie, Gründe, Zugriff). */
    async options(actor, id) {
        const l = await this.load(id);
        await this.assertCan(actor, 'ticket.view', l.cat);
        const [statuses, priorities, categories, reasons, access] = await Promise.all([
            this.config.statuses(), this.config.priorities(), this.prisma.ticketCategory.findMany({ where: { active: true }, orderBy: { position: 'asc' }, select: { id: true, name: true, emoji: true } }),
            this.config.reasons(), this.prisma.ticketAccess.findMany({ where: { ticketId: id } }),
        ]);
        const closed = this.isClosed(l);
        return {
            closed, statuses: statuses.filter((s) => (closed ? s.kind !== 'OPEN' : s.kind === 'OPEN')), priorities, categories: categories.filter((c) => c.id !== l.cat.id), reasons, access,
            close: { mode: l.cat.closeReasonMode, source: l.cat.closeReasonSource },
        };
    }
    /** Schließen-Auswahl für den Bot (auch für Ersteller ohne Konto). */
    async closeOptions(id) {
        const l = await this.load(id);
        return { mode: l.cat.closeReasonMode, source: l.cat.closeReasonSource, reasons: (await this.config.reasons()).map((r) => r.text), closed: this.isClosed(l) };
    }
    async transcripts(userId, f) {
        const where = {
            ...(f.number ? { ticketNumber: f.number } : {}), ...(f.categoryName ? { categoryName: f.categoryName } : {}), ...(f.status ? { statusName: f.status } : {}),
            ...(f.creator ? { OR: [{ creatorId: f.creator }, { creatorName: { contains: f.creator, mode: 'insensitive' } }] } : {}),
            ...(f.staff ? { claimers: { has: f.staff } } : {}),
            ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
            ...(f.q ? { OR: [{ creatorName: { contains: f.q, mode: 'insensitive' } }, { categoryName: { contains: f.q, mode: 'insensitive' } }, ...(/^#?\d+$/.test(f.q) ? [{ ticketNumber: Number(f.q.replace('#', '')) }] : [])] } : {}),
        };
        const visible = await this.visibleCategoryIds(userId);
        if (visible)
            where.ticketId = { in: (await this.prisma.supportTicket.findMany({ where: { categoryId: { in: visible } }, select: { id: true } })).map((t) => t.id) };
        const [items, total] = await Promise.all([
            this.prisma.ticketTranscript.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize, select: { id: true, ticketId: true, ticketNumber: true, categoryName: true, creatorId: true, creatorName: true, claimers: true, statusName: true, sizeBytes: true, createdAt: true, createdByName: true } }),
            this.prisma.ticketTranscript.count({ where }),
        ]);
        return { total, page: f.page, pageSize: f.pageSize, items: items.map((x) => ({ ...x, ticketNumber: (0, shared_1.ticketNumber)(x.ticketNumber) })) };
    }
    async transcript(userId, id) {
        const tr = await this.prisma.ticketTranscript.findUnique({ where: { id } });
        if (!tr)
            throw new errors_1.AppError('NOT_FOUND', 'Transcript not found.');
        if (userId) {
            const t = await this.prisma.supportTicket.findUnique({ where: { id: tr.ticketId } });
            if (t)
                await this.assertCan({ userId, discordId: null, name: '', viaBot: false }, 'ticket.transcript', await this.config.category(t.categoryId));
        }
        return tr;
    }
    async deleteTranscript(actor, id) {
        const tr = await this.transcript(actor.userId, id);
        await this.prisma.ticketTranscript.delete({ where: { id } });
        await this.prisma.ticketLog.create({ data: { ticketId: tr.ticketId, action: 'transcript_deleted', actorId: actor.discordId, actorName: actor.name, detail: { transcriptId: id } } });
        return { ok: true };
    }
    async stats(userId) {
        const visible = await this.visibleCategoryIds(userId);
        const where = visible ? { categoryId: { in: visible } } : {};
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
            throw new errors_1.AppError('NOT_FOUND', 'Panel not found.');
        const cats = (await this.prisma.ticketCategory.findMany({ where: { id: { in: p.categoryIds }, active: true } })).sort((a, b) => p.categoryIds.indexOf(a.id) - p.categoryIds.indexOf(b.id));
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
        if (p.style === 'DROPDOWN')
            return { embeds: [embed], select: { id: `tk:open:${p.id}`, placeholder: p.placeholder, options: cats.slice(0, 25).map((c) => ({ label: c.name.slice(0, 100), value: c.id, description: c.description.slice(0, 100) || undefined, emoji: c.emoji ?? undefined })) } };
        return { embeds: [embed], buttons: cats.slice(0, 25).map((c) => ({ id: `tk:open:${p.id}:${c.id}`, label: c.name.slice(0, 80), emoji: c.emoji ?? undefined, style: (['primary', 'secondary', 'success', 'danger'].includes(c.buttonStyle) ? c.buttonStyle : 'secondary') })) };
    }
    /** Panel in Discord senden bzw. vorhandenes Panel aktualisieren. */
    async publishPanel(actor, id, channelId) {
        if (actor.userId)
            await this.perms.assert(actor.userId, 'ticket.settings');
        const p = await this.prisma.ticketPanel.findUnique({ where: { id } });
        if (!p)
            throw new errors_1.AppError('NOT_FOUND', 'Panel not found.');
        const target = channelId ?? p.channelId;
        if (!target)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Choose a Discord channel for this panel first.');
        const message = await this.panelMessage(id);
        if (!message.buttons?.length && !message.select?.options?.length)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Add at least one active ticket category to the panel.');
        const update = p.messageId && p.messageChannelId === target ? p.messageId : null;
        await this.discord.enqueue('tickets', 'ticket.effects', { effects: [{ type: 'panel', panelId: id, channelId: target, messageId: update, message }] }, { always: true });
        return { ok: true, updating: !!update };
    }
    async panelPosted(id, channelId, messageId) {
        await this.prisma.ticketPanel.update({ where: { id }, data: { messageChannelId: channelId, messageId } }).catch(() => undefined);
        return { ok: true };
    }
    // ================= Automatik (läuft jede Minute) =================
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
        const settings = await this.config.settings();
        if (settings.transcriptRetentionDays > 0)
            await this.prisma.ticketTranscript.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - settings.transcriptRetentionDays * 86_400_000) } } });
        await this.dispatch(effects, false);
        return { closed, warned, deleted, expired, alerted, unclaimed };
    }
};
exports.SupportTicketsService = SupportTicketsService;
exports.SupportTicketsService = SupportTicketsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, permission_service_1.PermissionService, discord_service_1.DiscordService, config_service_1.TicketConfigService, notify_service_1.NotifyService])
], SupportTicketsService);
//# sourceMappingURL=tickets.service.js.map