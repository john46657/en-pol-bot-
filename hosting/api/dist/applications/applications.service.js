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
exports.ApplicationsService = exports.DEFAULT_FORM = void 0;
const application_bans_service_1 = require("../application-bans/application-bans.service");
const hire_events_1 = require("../common/hire-events");
const guild_context_1 = require("../common/guild-context");
const teamchance_service_1 = require("../teamchance/teamchance.service");
const notify_service_1 = require("../notifications/notify.service");
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
const discord_service_1 = require("../discord/discord.service");
const numbering_1 = require("../common/numbering");
const transition_1 = require("../common/transition");
const pagination_1 = require("../common/pagination");
const web_url_1 = require("../common/web-url");
const qualifications_config_1 = require("../qualifications/qualifications.config");
const decision_1 = require("../qualifications/decision");
const roblox_service_1 = require("../persons/roblox.service");
const shared_2 = require("@enrp/shared");
const discord_access_service_1 = require("../authz/discord-access.service");
const discord_live_service_1 = require("../discord/discord-live.service");
/** Die Beschriftungen sind zugleich die Fragen, die der Discord-Bot per Direktnachricht stellt. */
exports.DEFAULT_FORM = [
    { key: 'experience', label: 'Welche Erfahrung hast du im Polizei-Roleplay (auch auf anderen Servern)?', required: true, maxLength: 2000 },
    { key: 'availability', label: 'Wann und wie oft kannst du aktiv sein?', required: true, maxLength: 500 },
    { key: 'motivation', label: 'Warum möchtest du zur EN Polizei?', required: true, maxLength: 3000 },
    { key: 'roleplayKnowledge', label: 'Was bedeutet für dich gutes Roleplay?', required: true, maxLength: 3000 },
    { key: 'erlcKnowledge', label: 'Wie gut kennst du ER:LC (Steuerung, Fahrzeuge, Regeln)?', required: false, maxLength: 3000 },
    { key: 'communication', label: 'Wie gehst du im Funk und mit Kollegen mit Konflikten um?', required: false, maxLength: 2000 },
];
const OPEN_STATUSES = ['SUBMITTED', 'SCREENING', 'INTERVIEW', 'PENDING_DECISION'];
let ApplicationsService = class ApplicationsService {
    prisma;
    audit;
    discord;
    notify;
    teamchance;
    roblox;
    bans;
    access;
    live;
    constructor(prisma, audit, discord, notify, teamchance, roblox, bans, access, live) {
        this.prisma = prisma;
        this.audit = audit;
        this.discord = discord;
        this.notify = notify;
        this.teamchance = teamchance;
        this.roblox = roblox;
        this.bans = bans;
        this.access = access;
        this.live = live;
    }
    /** Formular eines Servers (`application.form@<guildId>`), sonst das gemeinsame. */
    async form(guildId) {
        const g = (0, guild_context_1.settingsGuild)(guildId);
        const own = g ? await this.prisma.systemSetting.findUnique({ where: { key: `application.form@${g}` } }) : null;
        const s = own ?? await this.prisma.systemSetting.findUnique({ where: { key: 'application.form' } });
        return s?.value ?? exports.DEFAULT_FORM;
    }
    /** Öffentliche Bewerbung (kein Account nötig). Antworten werden strikt gegen das konfigurierte Formular validiert. */
    async submit(d, meta = {}) {
        if (d.robloxUserId && !(0, shared_1.isValidRobloxUserId)(d.robloxUserId))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Ungültige Roblox-Benutzer-ID.');
        const [form, police] = await Promise.all([this.form(meta.guildId), this.police(meta.guildId)]);
        if (!police.enabled)
            throw new errors_1.AppError('CONFLICT', 'Bewerbungen sind derzeit geschlossen.');
        await this.teamchance.assertApplicationsAllowed(meta.guildId ?? null); // Team-Chance: ggf. nur während offener Phase
        const answers = {};
        const grantRoleIds = new Set();
        for (const f of form) {
            const r = (0, shared_1.checkAnswer)(f, d.answers[f.key]);
            if (!r.ok)
                throw new errors_1.AppError('VALIDATION_FAILED', r.error);
            let text = r.text;
            // Frage „Roblox User“: Konto muss es bei Roblox geben; gespeichert mit richtiger Schreibweise + ID
            if (f.type === 'ROBLOX' && text) {
                const rb = await this.roblox.verifyName(text);
                if (rb === null)
                    throw new errors_1.AppError('VALIDATION_FAILED', `Den Roblox-Benutzer „${text}“ gibt es nicht.`);
                if (rb) {
                    text = `${rb.name} (ID ${rb.id})`;
                    if (!d.robloxUserId)
                        d = { ...d, robloxUsername: rb.name, robloxUserId: rb.id };
                }
            }
            if (text)
                answers[f.key] = text;
            r.roleIds.forEach((x) => grantRoleIds.add(x));
        }
        // Bewerbungssperre (Discord-ID oder Roblox-ID)
        await this.bans.assertAllowed({ discordId: meta.discordId, robloxUserId: d.robloxUserId }, application_bans_service_1.BAN_POLICE, 'die Polizei-Bewerbung', meta.guildId ?? null);
        if (d.robloxUserId && (await this.prisma.application.count({ where: { robloxUserId: d.robloxUserId, status: { in: OPEN_STATUSES } } }))) {
            throw new errors_1.AppError('CONFLICT', 'Für diesen Roblox-Benutzer gibt es schon eine offene Bewerbung.');
        }
        if (meta.discordId && (await this.openForDiscord(meta.discordId)).open)
            throw new errors_1.AppError('CONFLICT', 'Für dieses Discord-Konto gibt es schon eine offene Bewerbung.');
        if (meta.discordId) {
            const last = await this.prisma.application.findFirst({ where: { discordId: meta.discordId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
            const wait = (0, decision_1.cooldownLeft)(police.settings, last?.createdAt);
            if (wait)
                throw new errors_1.AppError('CONFLICT', `Du kannst dich erst in ${(0, shared_2.formatMinutes)(wait)} erneut bewerben.`);
        }
        const a = await this.prisma.application.create({ data: { number: (0, numbering_1.makeNumber)('APP'), robloxUsername: d.robloxUsername, robloxUserId: d.robloxUserId, answers, grantRoleIds: [...grantRoleIds], guildId: meta.guildId ?? null, discordId: meta.discordId, discordName: meta.discordName, durationSec: meta.durationSec, joinedAt: meta.joinedAt, source: meta.discordId ? 'DISCORD' : 'WEB' } });
        // 🔔 Neue Bewerbung → alle, die Bewerbungen prüfen dürfen (im Server der Bewerbung)
        await this.notify.notifyPermission('applications.review', { type: 'APPLICATION', title: `🔔 Neue Bewerbung ${a.number}`, body: `${d.robloxUsername}${meta.discordName ? ` · ${meta.discordName}` : ''}`, entityType: 'Application', entityId: a.id }, { guildId: meta.guildId ?? null });
        await this.audit.record({ userId: null }, { action: 'application.submit', module: 'applications', entityType: 'Application', entityId: a.id, after: { source: a.source } });
        await this.discord.enqueue('applications', 'application.submitted', {
            id: a.id, pingRoleIds: police.pingRoleIds, ...(police.channelId ? { channelId: police.channelId } : {}), guildName: meta.guildId ? (await this.discord.guilds()).find((g) => g.id === meta.guildId)?.name ?? null : null, number: a.number, robloxUsername: a.robloxUsername, robloxUserId: a.robloxUserId ?? null, discordId: meta.discordId ?? null, discordName: meta.discordName ?? null, source: a.source,
            answers: form.filter((f) => answers[f.key]).map((f) => ({ question: f.label, answer: answers[f.key] })),
            durationSec: a.durationSec, joinedAt: a.joinedAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString(), dashboardUrl: (0, web_url_1.webUrl)(`/applications/${a.id}`),
            ...(police.settings.staffThreads ? { thread: true } : {}),
        }, { always: !!police.channelId });
        const roles = (0, decision_1.submitRoles)(police.settings);
        if (meta.discordId && (roles.add.length || roles.remove.length))
            await this.discord.enqueue('applications', 'member.roles', { discordId: meta.discordId, ...roles, reason: `Bewerbung ${a.number}` }, { always: true });
        return { number: a.number, status: a.status };
    }
    /** Einstellungen der Polizei-Bewerbung (Qualifications/Applications → Setup). */
    async police(guildId) {
        const g = (0, guild_context_1.settingsGuild)(guildId);
        const own = g ? await this.prisma.systemSetting.findUnique({ where: { key: `qualifications.config@${g}` } }) : null;
        const v = (own ?? await this.prisma.systemSetting.findUnique({ where: { key: 'qualifications.config' } }))?.value;
        const p = qualifications_config_1.policeSchema.safeParse(v?.police ?? {});
        return p.success ? p.data : qualifications_config_1.policeSchema.parse({});
    }
    /** Entscheidungs-DM mit Text und Rollen aus den Einstellungen. */
    async decided(actor, a, to, reason) {
        if (!a.discordId)
            return;
        const police = await this.police(a.guildId);
        const roles = (0, decision_1.decisionRoles)(police.settings, to === 'ACCEPTED', a.grantRoleIds);
        const link = actor.userId ? await this.prisma.discordLink.findUnique({ where: { userId: actor.userId } }) : null;
        const by = !link && actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
        const decider = link ? `<@${link.discordId}>` : by?.displayName ?? 'dem Team';
        await this.discord.enqueue('applications', 'application.decided', {
            discordId: a.discordId, status: to, number: a.number, reason, roleIds: roles.add, removeRoleIds: roles.remove,
            message: (0, decision_1.decisionMessage)(police.settings, to === 'ACCEPTED', { applicationName: police.name, number: a.number, decider, applicantId: a.discordId, reason }),
        }, { always: true });
    }
    /** Wie bei Appy: entschiedene Bewerbung in den Channel für angenommene/abgelehnte Bewerbungen posten (nur ohne Original-Nachricht in Discord). */
    async archive(a, to, reason, decidedByName) {
        const police = await this.police(a.guildId);
        const channelId = to === 'ACCEPTED' ? police.acceptedChannelId : police.deniedChannelId;
        if (!channelId)
            return;
        // Gibt es die Bewerbungs-Nachricht in Discord, wird nur sie aktualisiert (markDecided) – keine zweite Nachricht
        if (await this.discord.hasTrackedMessage(`msg-a-${a.id}`))
            return;
        const form = await this.form(a.guildId);
        const answers = (a.answers ?? {});
        await this.discord.enqueue('applications', 'application.archived', {
            id: a.id, number: a.number, robloxUsername: a.robloxUsername, robloxUserId: a.robloxUserId, discordId: a.discordId, discordName: a.discordName, source: a.source,
            answers: form.filter((f) => answers[f.key]).map((f) => ({ question: f.label, answer: answers[f.key] })), durationSec: a.durationSec, joinedAt: a.joinedAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString(),
            status: to, reason, decidedByName, channelId, guildName: a.guildId ? (await this.discord.guilds()).find((g) => g.id === a.guildId)?.name ?? null : null,
        }, { always: true });
    }
    /** Für den Bot: hat dieses Discord-Konto schon eine offene Bewerbung? */
    async openForDiscord(discordId) {
        const a = await this.prisma.application.findFirst({ where: { discordId, status: { in: OPEN_STATUSES } }, select: { number: true } });
        return { open: !!a, number: a?.number ?? null };
    }
    async openTicket(actor, id) {
        return this.discord.applicantTicket(actor, { ...(await this.get(id)), unitName: 'EN Polizei' }, 'Application');
    }
    /** Bisherige Bewerbungen einer Discord-ID (Button „Verlauf“). */
    history(discordId) {
        return this.prisma.application.findMany({ where: { discordId }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, number: true, status: true, createdAt: true, decisionReason: true } });
    }
    /**
     * Schnell-Entscheidung aus Discord (Buttons Annehmen/Ablehnen): aus jedem offenen Status direkt angenommen/abgelehnt.
     * `reason` geht – anders als der interne Grund im Web-Workflow – per DM an die Person.
     */
    async discordDecide(actor, id, to, reason) {
        const after = await this.prisma.$transaction(async (tx) => {
            const a = await tx.application.findUnique({ where: { id } });
            if (!a)
                throw new errors_1.AppError('NOT_FOUND', 'Bewerbung nicht gefunden.');
            if (!OPEN_STATUSES.includes(a.status))
                throw new errors_1.AppError('CONFLICT', 'Über diese Bewerbung wurde schon entschieden.');
            const claimed = await tx.application.updateMany({ where: { id, status: a.status, version: a.version }, data: { status: to, decidedById: actor.userId, decidedAt: new Date(), decisionReason: reason || null, version: { increment: 1 } } });
            if (claimed.count === 0)
                throw new errors_1.AppError('CONFLICT', 'Über diese Bewerbung wurde schon entschieden.');
            await this.audit.record(actor, { action: `application.${to.toLowerCase()}`, module: 'applications', entityType: 'Application', entityId: id, before: { status: a.status }, after: { status: to }, reason: reason || 'Entschieden über Discord' }, tx);
            return { ...a, status: to };
        });
        await this.decided(actor, after, to, reason || null);
        const by = actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
        await this.archive(after, to, reason || null, by?.displayName ?? null);
        await this.discord.markDecided('application', id, actor, to, reason || null);
        if (to === 'ACCEPTED')
            await this.hire(actor, after);
        return { id, number: after.number, status: to, decidedByName: by?.displayName ?? null, reason: reason || null };
    }
    /** Angenommen → Personal-/Dienstnummern-Automatik (Einstellungen → Dienstnummern). */
    hire(actor, a) {
        return hire_events_1.hireEvents.accepted(actor, { applicationId: a.id, number: a.number, kind: 'police', discordId: a.discordId, name: a.discordName || a.robloxUsername, robloxUsername: a.robloxUsername, robloxUserId: a.robloxUserId });
    }
    /** „Action On User Leave“ der Polizei-Bewerbung: offene Bewerbungen einer Person, die den Discord-Server verlassen hat. */
    async memberLeft(guildId, discordId) {
        const open = await this.prisma.application.findMany({ where: { discordId, status: { in: OPEN_STATUSES }, OR: [{ guildId }, { guildId: null }] }, select: { id: true, guildId: true } });
        let denied = 0, withdrawn = 0;
        for (const a of open) {
            const action = (await this.police(a.guildId)).settings.onLeave;
            if (action === 'DENY')
                await this.discordDecide(decision_1.LEFT_ACTOR, a.id, 'REJECTED', decision_1.LEFT_REASON).then(() => denied++, () => undefined);
            else if (action === 'WITHDRAW')
                await this.transition(decision_1.LEFT_ACTOR, a.id, 'WITHDRAWN', decision_1.LEFT_REASON).then(() => withdrawn++, () => undefined);
        }
        return { denied, withdrawn };
    }
    async list(p, status, guildId, order = 'newest') {
        const where = { ...(guildId ? { guildId } : {}), ...(status === 'OPEN' ? { status: { in: OPEN_STATUSES } } : status ? { status } : {}), ...(p.q ? { OR: [{ number: { contains: p.q.toUpperCase() } }, { robloxUsername: { contains: p.q, mode: 'insensitive' } }] } : {}) };
        const [items, total] = await Promise.all([this.prisma.application.findMany({ where, orderBy: { createdAt: order === 'oldest' ? 'asc' : 'desc' }, ...(0, pagination_1.skipTake)(p) }), this.prisma.application.count({ where })]);
        // wer entschieden hat (Name) – für die Karten-Ansicht
        const ids = [...new Set(items.map((a) => a.decidedById).filter((x) => !!x))];
        const users = new Map((await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
        return (0, pagination_1.pageResult)(items.map((a) => ({ ...a, decidedByName: a.decidedById ? users.get(a.decidedById) ?? '—' : null })), total, p);
    }
    /**
     * Alle Bewerbungen in einer Liste (wie bei Appy): Polizei-Bewerbungen und – mit qualifications.view – Bewerbungen
     * für Einheiten (Flugstaffel, GSG9 …). Filter: Art (`police` / `q:<einheit>`), Status, Suche, Sortierung; mit Profilbildern.
     */
    async inbox(f, allowed) {
        const asc = f.order === 'oldest';
        const take = Math.min(f.page * f.pageSize, 5000);
        const q = f.q?.trim();
        const wantPolice = allowed.police && (!f.type || f.type === 'police');
        const wantQuali = allowed.quali && (!f.type || f.type.startsWith('q:'));
        const unit = f.type?.startsWith('q:') ? f.type.slice(2) : undefined;
        const guild = f.guildId ? { guildId: f.guildId } : {};
        const pWhere = { ...guild, ...(f.status === 'OPEN' ? { status: { in: OPEN_STATUSES } } : f.status ? { status: f.status } : {}),
            ...(q ? { OR: [{ number: { contains: q.toUpperCase() } }, { robloxUsername: { contains: q, mode: 'insensitive' } }, { discordName: { contains: q, mode: 'insensitive' } }, { discordId: q }] } : {}) };
        const qWhere = { ...guild, ...(unit ? { unit } : {}), ...(f.status ? { status: f.status } : {}),
            ...(q ? { OR: [{ number: { contains: q.toUpperCase() } }, { discordName: { contains: q, mode: 'insensitive' } }, { discordId: q }] } : {}) };
        const order = { createdAt: asc ? 'asc' : 'desc' };
        const [police, pTotal, quali, qTotal, units, pName] = await Promise.all([
            wantPolice ? this.prisma.application.findMany({ where: pWhere, orderBy: order, take }) : [],
            wantPolice ? this.prisma.application.count({ where: pWhere }) : 0,
            wantQuali ? this.prisma.qualificationApplication.findMany({ where: qWhere, orderBy: order, take }) : [],
            wantQuali ? this.prisma.qualificationApplication.count({ where: qWhere }) : 0,
            allowed.quali ? this.prisma.qualificationApplication.groupBy({ by: ['unit', 'unitName'], orderBy: { unitName: 'asc' } }) : [],
            this.police(f.guildId ?? null).then((p) => p.name),
        ]);
        const forms = new Map();
        const labels = async (g) => {
            const k = g ?? '';
            if (!forms.has(k))
                forms.set(k, new Map((await this.form(g)).map((x) => [x.key, x.label])));
            return forms.get(k);
        };
        const rows = [
            ...await Promise.all(police.map(async (a) => {
                const l = await labels(a.guildId);
                return { kind: 'police', id: a.id, number: a.number, typeKey: 'police', typeName: pName, status: a.status, discordId: a.discordId, discordName: a.discordName, robloxUsername: a.robloxUsername, robloxUserId: a.robloxUserId,
                    answers: Object.entries((a.answers ?? {})).map(([k, v]) => ({ label: l.get(k) ?? k, value: String(v ?? '') })), createdAt: a.createdAt, durationSec: a.durationSec, decisionReason: a.decisionReason, decidedById: a.decidedById, guildId: a.guildId };
            })),
            ...quali.map((a) => ({ kind: 'qualification', id: a.id, number: a.number, typeKey: `q:${a.unit}`, typeName: a.unitName, status: a.status, discordId: a.discordId, discordName: a.discordName, robloxUsername: null, robloxUserId: null,
                answers: (Array.isArray(a.answers) ? a.answers : []).map((x) => ({ label: String(x.question ?? ''), value: String(x.answer ?? '') })), createdAt: a.createdAt, durationSec: a.durationSec, decisionReason: a.decisionReason, decidedById: a.decidedById, guildId: a.guildId })),
        ].sort((x, y) => (asc ? 1 : -1) * (x.createdAt.getTime() - y.createdAt.getTime()));
        const page = rows.slice((f.page - 1) * f.pageSize, f.page * f.pageSize);
        const ids = [...new Set(page.map((r) => r.decidedById).filter((x) => !!x))];
        const deciders = new Map((await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
        const discordIds = page.map((r) => r.discordId).filter((x) => !!x);
        const known = new Map(this.live.getMembers().members.filter((m) => m.avatar).map((m) => [m.id, m.avatar]));
        const fetched = await this.access.avatars(discordIds.filter((id) => !known.has(id)));
        return {
            items: page.map(({ decidedById, ...r }) => ({ ...r, decidedByName: decidedById ? deciders.get(decidedById) ?? '—' : null, avatar: r.discordId ? known.get(r.discordId) ?? fetched.get(r.discordId) ?? null : null })),
            total: pTotal + qTotal, page: f.page, pageSize: f.pageSize,
            types: [...(allowed.police ? [{ key: 'police', name: pName }] : []), ...units.map((u) => ({ key: `q:${u.unit}`, name: u.unitName }))].filter((t, i, all) => all.findIndex((x) => x.key === t.key) === i),
        };
    }
    /** Bewerbung endgültig löschen (applications.delete) – im Audit-Log bleibt festgehalten, was gelöscht wurde. */
    async remove(actor, id) {
        const a = await this.get(id);
        await this.prisma.$transaction(async (tx) => {
            await tx.hireQueue.deleteMany({ where: { applicationId: id } });
            await tx.application.delete({ where: { id } });
            await this.audit.record(actor, { action: 'application.delete', module: 'applications', entityType: 'Application', entityId: id, before: { number: a.number, status: a.status, robloxUsername: a.robloxUsername, discordId: a.discordId, discordName: a.discordName } }, tx);
        });
    }
    async get(id) {
        const a = await this.prisma.application.findUnique({ where: { id } });
        if (!a)
            throw new errors_1.AppError('NOT_FOUND', 'Bewerbung nicht gefunden.');
        return a;
    }
    async transition(actor, id, to, reason) {
        return this.prisma.$transaction(async (tx) => {
            const a = await tx.application.findUnique({ where: { id } });
            if (!a)
                throw new errors_1.AppError('NOT_FOUND', 'Bewerbung nicht gefunden.');
            (0, transition_1.nextStatus)(shared_1.APPLICATION_TRANSITIONS, a.status, to);
            if ((to === 'ACCEPTED' || to === 'REJECTED') && !reason)
                throw new errors_1.AppError('VALIDATION_FAILED', 'Bitte eine Begründung angeben.');
            const after = await tx.application.update({ where: { id }, data: { status: to, decidedById: to === 'ACCEPTED' || to === 'REJECTED' ? actor.userId : a.decidedById, ...(to === 'ACCEPTED' || to === 'REJECTED' ? { decidedAt: new Date() } : {}), version: { increment: 1 } } });
            await this.audit.record(actor, { action: `application.${to.toLowerCase()}`, module: 'applications', entityType: 'Application', entityId: id, before: { status: a.status }, after: { status: to }, reason }, tx);
            return after;
        }).then(async (after) => {
            // Entscheidung per Direktnachricht (nur bei Bewerbung über Discord). Der interne Grund wird NICHT mitgeschickt.
            if (to === 'ACCEPTED' || to === 'REJECTED') {
                await this.decided(actor, after, to, null); // der interne Grund aus dem Web bleibt intern
                const by = actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
                await this.archive(after, to, null, by?.displayName ?? null); // der interne Grund aus dem Web bleibt intern
            }
            // Discord-Nachricht anpassen (der interne Grund aus dem Web bleibt intern)
            if (to === 'ACCEPTED' || to === 'REJECTED' || to === 'WITHDRAWN')
                await this.discord.markDecided('application', id, actor, to, to === 'WITHDRAWN' ? reason ?? null : null);
            if (to === 'ACCEPTED')
                await this.hire(actor, after);
            return after;
        });
    }
};
exports.ApplicationsService = ApplicationsService;
exports.ApplicationsService = ApplicationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, discord_service_1.DiscordService, notify_service_1.NotifyService, teamchance_service_1.TeamChanceService, roblox_service_1.RobloxService, application_bans_service_1.ApplicationBansService, discord_access_service_1.DiscordAccessService, discord_live_service_1.DiscordLiveService])
], ApplicationsService);
//# sourceMappingURL=applications.service.js.map