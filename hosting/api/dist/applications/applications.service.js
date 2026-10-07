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
    constructor(prisma, audit, discord, notify, teamchance, roblox) {
        this.prisma = prisma;
        this.audit = audit;
        this.discord = discord;
        this.notify = notify;
        this.teamchance = teamchance;
        this.roblox = roblox;
    }
    /** Formular eines Servers (`application.form@<guildId>`), sonst das gemeinsame. */
    async form(guildId) {
        const own = guildId ? await this.prisma.systemSetting.findUnique({ where: { key: `application.form@${guildId}` } }) : null;
        const s = own ?? await this.prisma.systemSetting.findUnique({ where: { key: 'application.form' } });
        return s?.value ?? exports.DEFAULT_FORM;
    }
    /** Öffentliche Bewerbung (kein Account nötig). Antworten werden strikt gegen das konfigurierte Formular validiert. */
    async submit(d, meta = {}) {
        if (d.robloxUserId && !(0, shared_1.isValidRobloxUserId)(d.robloxUserId))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Invalid Roblox user id.');
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
        if (d.robloxUserId && (await this.prisma.application.count({ where: { robloxUserId: d.robloxUserId, status: { in: OPEN_STATUSES } } }))) {
            throw new errors_1.AppError('CONFLICT', 'An open application already exists for this Roblox user.');
        }
        if (meta.discordId && (await this.openForDiscord(meta.discordId)).open)
            throw new errors_1.AppError('CONFLICT', 'An open application already exists for this Discord account.');
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
        const own = guildId ? await this.prisma.systemSetting.findUnique({ where: { key: `qualifications.config@${guildId}` } }) : null;
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
    /** Wie bei Appy: entschiedene Bewerbung in den Channel für angenommene/abgelehnte Bewerbungen posten. */
    async archive(a, to, reason, decidedByName) {
        const police = await this.police(a.guildId);
        const channelId = to === 'ACCEPTED' ? police.acceptedChannelId : police.deniedChannelId;
        if (!channelId)
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
                throw new errors_1.AppError('NOT_FOUND', 'Application not found.');
            if (!OPEN_STATUSES.includes(a.status))
                throw new errors_1.AppError('CONFLICT', 'This application has already been decided.');
            const claimed = await tx.application.updateMany({ where: { id, status: a.status, version: a.version }, data: { status: to, decidedById: actor.userId, decidedAt: new Date(), decisionReason: reason || null, version: { increment: 1 } } });
            if (claimed.count === 0)
                throw new errors_1.AppError('CONFLICT', 'This application has already been decided.');
            await this.audit.record(actor, { action: `application.${to.toLowerCase()}`, module: 'applications', entityType: 'Application', entityId: id, before: { status: a.status }, after: { status: to }, reason: reason || 'Entschieden über Discord' }, tx);
            return { ...a, status: to };
        });
        await this.decided(actor, after, to, reason || null);
        const by = actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
        await this.archive(after, to, reason || null, by?.displayName ?? null);
        return { id, number: after.number, status: to, decidedByName: by?.displayName ?? null, reason: reason || null };
    }
    async list(p, status, guildId) {
        const where = { ...(guildId ? { guildId } : {}), ...(status === 'OPEN' ? { status: { in: OPEN_STATUSES } } : status ? { status } : {}), ...(p.q ? { OR: [{ number: { contains: p.q.toUpperCase() } }, { robloxUsername: { contains: p.q, mode: 'insensitive' } }] } : {}) };
        const [items, total] = await Promise.all([this.prisma.application.findMany({ where, orderBy: { createdAt: 'desc' }, ...(0, pagination_1.skipTake)(p) }), this.prisma.application.count({ where })]);
        // wer entschieden hat (Name) – für die Karten-Ansicht
        const ids = [...new Set(items.map((a) => a.decidedById).filter((x) => !!x))];
        const users = new Map((await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
        return (0, pagination_1.pageResult)(items.map((a) => ({ ...a, decidedByName: a.decidedById ? users.get(a.decidedById) ?? '—' : null })), total, p);
    }
    async get(id) {
        const a = await this.prisma.application.findUnique({ where: { id } });
        if (!a)
            throw new errors_1.AppError('NOT_FOUND', 'Application not found.');
        return a;
    }
    async transition(actor, id, to, reason) {
        return this.prisma.$transaction(async (tx) => {
            const a = await tx.application.findUnique({ where: { id } });
            if (!a)
                throw new errors_1.AppError('NOT_FOUND', 'Application not found.');
            (0, transition_1.nextStatus)(shared_1.APPLICATION_TRANSITIONS, a.status, to);
            if ((to === 'ACCEPTED' || to === 'REJECTED') && !reason)
                throw new errors_1.AppError('VALIDATION_FAILED', 'A reason is required.');
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
            return after;
        });
    }
};
exports.ApplicationsService = ApplicationsService;
exports.ApplicationsService = ApplicationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, discord_service_1.DiscordService, notify_service_1.NotifyService, teamchance_service_1.TeamChanceService, roblox_service_1.RobloxService])
], ApplicationsService);
//# sourceMappingURL=applications.service.js.map