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
exports.QualificationsService = void 0;
const application_bans_service_1 = require("../application-bans/application-bans.service");
const hire_events_1 = require("../common/hire-events");
const guild_context_1 = require("../common/guild-context");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const discord_service_1 = require("../discord/discord.service");
const errors_1 = require("../common/errors");
const numbering_1 = require("../common/numbering");
const web_url_1 = require("../common/web-url");
const qualifications_config_1 = require("./qualifications.config");
const shared_1 = require("@enrp/shared");
const applications_service_1 = require("../applications/applications.service");
const decision_1 = require("./decision");
const roblox_service_1 = require("../persons/roblox.service");
const shared_2 = require("@enrp/shared");
const KEY = 'qualifications.config';
const FORM_KEY = 'application.form';
/**
 * Qualifikations-Bewerbungen (SEK, Flugstaffel, Ausbilder …): Discord-Panel → Fragen per DM → Team entscheidet (Web oder Button im Team-Channel).
 * Bei Annahme: Direktnachricht, optionale Discord-Rolle; für die Einheit `sek` zusätzlich SEK-Roster + System-Rolle „SEK“ (bei verknüpftem Konto).
 */
let QualificationsService = class QualificationsService {
    prisma;
    audit;
    discord;
    roblox;
    bans;
    constructor(prisma, audit, discord, roblox, bans) {
        this.prisma = prisma;
        this.audit = audit;
        this.discord = discord;
        this.roblox = roblox;
        this.bans = bans;
    }
    /** Einstellungen eines Servers (`@<guildId>`) – ohne eigene gilt die gemeinsame Grundeinstellung. */
    keyOf(base, guildId) { const g = (0, guild_context_1.settingsGuild)(guildId); return g ? `${base}@${g}` : base; } // Gruppe mit geteilten Einstellungen → Haupt-Server
    async read(base, guildId) {
        if (guildId) {
            const own = await this.prisma.systemSetting.findUnique({ where: { key: this.keyOf(base, guildId) } });
            if (own)
                return { value: own.value, own: true };
        }
        return { value: (await this.prisma.systemSetting.findUnique({ where: { key: base } }))?.value, own: false };
    }
    async config(guildId) {
        const row = await this.read(KEY, guildId);
        const parsed = row.value ? qualifications_config_1.configSchema.safeParse(row.value) : null;
        return parsed?.success ? parsed.data : qualifications_config_1.DEFAULT_CONFIG;
    }
    /** Fragen der Polizei-Bewerbung (dasselbe Formular wie /apply und Studio). */
    async policeForm(guildId) {
        return (await this.read(FORM_KEY, guildId)).value ?? applications_service_1.DEFAULT_FORM;
    }
    /** Alles für „Setup“ an einem Ort; `own` = dieser Server hat eigene Einstellungen. */
    async setup(guildId) {
        const own = guildId ? (await this.read(KEY, guildId)).own : true;
        return { ...(await this.config(guildId)), policeForm: await this.policeForm(guildId), own };
    }
    async saveConfig(actor, input, guildId) {
        const { policeForm, ...c } = input;
        const key = this.keyOf(KEY, guildId), formKey = this.keyOf(FORM_KEY, guildId);
        // eigener Server ohne eigenes Formular: das gemeinsame Formular übernehmen, damit Server-Einstellungen vollständig sind
        const form = policeForm ?? (guildId && !(await this.prisma.systemSetting.findUnique({ where: { key: formKey } })) ? await this.policeForm(null) : undefined);
        await this.prisma.$transaction(async (tx) => {
            await tx.systemSetting.upsert({ where: { key }, create: { key, value: c }, update: { value: c } });
            await this.audit.record(actor, { action: 'qualifications.config', module: 'qualifications', entityType: 'SystemSetting', entityId: key, after: { units: c.units.map((u) => u.key), guildId: guildId ?? null } }, tx);
            if (form) {
                await tx.systemSetting.upsert({ where: { key: formKey }, create: { key: formKey, value: form }, update: { value: form } });
                await this.audit.record(actor, { action: 'studio.config.changed', module: 'settings', entityType: 'SystemSetting', entityId: formKey, after: form }, tx);
            }
        });
        return this.setup(guildId);
    }
    /** Eigene Einstellungen eines Servers löschen – danach gilt wieder die gemeinsame Grundeinstellung. */
    async resetGuild(actor, guildId) {
        await this.prisma.systemSetting.deleteMany({ where: { key: { in: [this.keyOf(KEY, guildId), this.keyOf(FORM_KEY, guildId)] } } });
        await this.audit.record(actor, { action: 'qualifications.config.reset', module: 'qualifications', entityType: 'SystemSetting', entityId: this.keyOf(KEY, guildId) });
        return this.setup(guildId);
    }
    /** Für den Bot: läuft für diese Discord-ID schon eine offene Bewerbung (je Einheit)? */
    async openFor(discordId, unit) {
        const open = await this.prisma.qualificationApplication.findFirst({ where: { discordId, status: 'OPEN', ...(unit ? { unit } : {}) }, select: { number: true, unitName: true } });
        return { open: !!open, number: open?.number ?? null, unitName: open?.unitName ?? null };
    }
    async submit(d) {
        const cfg = await this.config(d.guildId);
        const unit = cfg.units.find((u) => u.key === d.unit);
        if (!unit)
            throw new errors_1.AppError('NOT_FOUND', 'Unbekannte Einheit.');
        if (!unit.enabled)
            throw new errors_1.AppError('CONFLICT', `Bewerbungen für ${unit.name} sind derzeit geschlossen.`);
        if (d.answers.length !== unit.questions.length)
            throw new errors_1.AppError('VALIDATION_FAILED', `Es werden ${unit.questions.length} Antworten erwartet.`);
        // jede Antwort gegen ihre Frage prüfen (Pflicht, Länge, gültige Auswahl); gewählte Rollen merken
        const answers = [];
        const grantRoleIds = new Set();
        for (const [i, q] of unit.questions.entries()) {
            const r = (0, shared_1.checkAnswer)(q, d.answers[i]?.answer);
            if (!r.ok)
                throw new errors_1.AppError('VALIDATION_FAILED', r.error);
            let text = r.text;
            if (q.type === 'ROBLOX' && text) {
                const rb = await this.roblox.verifyName(text);
                if (rb === null)
                    throw new errors_1.AppError('VALIDATION_FAILED', `Den Roblox-Benutzer „${text}“ gibt es nicht.`);
                if (rb)
                    text = `${rb.name} (ID ${rb.id})`;
            }
            answers.push({ question: q.label, answer: text || '—' });
            r.roleIds.forEach((x) => grantRoleIds.add(x));
        }
        await this.bans.assertAllowed({ discordId: d.discordId }, unit.key, unit.name, d.guildId ?? null);
        if ((await this.openFor(d.discordId, unit.key)).open)
            throw new errors_1.AppError('CONFLICT', `Für ${unit.name} gibt es schon eine offene Bewerbung.`);
        const last = await this.prisma.qualificationApplication.findFirst({ where: { discordId: d.discordId, unit: unit.key }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
        const wait = (0, decision_1.cooldownLeft)(unit.settings, last?.createdAt);
        if (wait)
            throw new errors_1.AppError('CONFLICT', `Du kannst dich für ${unit.name} erst in ${(0, shared_2.formatMinutes)(wait)} erneut bewerben.`);
        const user = await this.discord.resolveUser(d.discordId);
        const a = await this.prisma.$transaction(async (tx) => {
            const row = await tx.qualificationApplication.create({ data: { number: (0, numbering_1.makeNumber)('Q'), unit: unit.key, unitName: unit.name, discordId: d.discordId, discordName: d.discordName, userId: user?.id, answers: answers, grantRoleIds: [...grantRoleIds], guildId: d.guildId ?? null, durationSec: d.durationSec, joinedAt: d.joinedAt } });
            await this.audit.record({ userId: user?.id ?? null }, { action: 'qualifications.application.submit', module: 'qualifications', entityType: 'QualificationApplication', entityId: row.id, after: { number: row.number, unit: unit.key, discordId: d.discordId } }, tx);
            return row;
        });
        // Eigener Channel der Einheit (falls eingestellt) – sonst der allgemeine Qualifications-Channel
        await this.discord.enqueue('qualifications', 'qualification.submitted', {
            id: a.id, number: a.number, unitName: a.unitName, discordId: a.discordId, discordName: a.discordName, linkedName: user?.displayName ?? null, answers, pingRoleIds: unit.pingRoleIds, guildName: d.guildId ? (await this.discord.guilds()).find((g) => g.id === d.guildId)?.name ?? null : null,
            durationSec: a.durationSec, joinedAt: a.joinedAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString(), dashboardUrl: (0, web_url_1.webUrl)(`/qualifications?id=${a.id}`),
            ...(unit.channelId ? { channelId: unit.channelId } : {}), ...(unit.settings.staffThreads ? { thread: true } : {}),
        }, { always: !!unit.channelId });
        const roles = (0, decision_1.submitRoles)(unit.settings);
        if (roles.add.length || roles.remove.length)
            await this.discord.enqueue('qualifications', 'member.roles', { discordId: d.discordId, ...roles, reason: `Bewerbung ${a.number}` }, { always: true });
        return { id: a.id, number: a.number, unitName: a.unitName };
    }
    async list(f) {
        const rows = await this.prisma.qualificationApplication.findMany({ where: { ...(f.unit ? { unit: f.unit } : {}), ...(f.status ? { status: f.status } : {}), ...(f.guildId ? { guildId: f.guildId } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
        const ids = [...new Set(rows.flatMap((r) => [r.userId, r.decidedById]).filter((x) => !!x))];
        const users = new Map((await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
        return rows.map((r) => ({ ...r, linkedName: r.userId ? users.get(r.userId) ?? null : null, decidedByName: r.decidedById ? users.get(r.decidedById) ?? '—' : null }));
    }
    async get(id) {
        const a = await this.prisma.qualificationApplication.findUnique({ where: { id } });
        if (!a)
            throw new errors_1.AppError('NOT_FOUND', 'Bewerbung nicht gefunden.');
        return a;
    }
    /** Bewerbung endgültig löschen (qualifications.delete) – im Audit-Log bleibt festgehalten, was gelöscht wurde. */
    async remove(actor, id) {
        const a = await this.get(id);
        await this.prisma.$transaction(async (tx) => {
            await tx.qualificationApplication.delete({ where: { id } });
            await this.audit.record(actor, { action: 'qualifications.application.delete', module: 'qualifications', entityType: 'QualificationApplication', entityId: id, before: { number: a.number, unit: a.unitName, status: a.status, discordId: a.discordId, discordName: a.discordName } }, tx);
        });
    }
    async openTicket(actor, id) {
        return this.discord.applicantTicket(actor, await this.get(id), 'QualificationApplication');
    }
    /** Bisherige Qualifikations-Bewerbungen einer Discord-ID (Button „Verlauf“). */
    history(discordId) {
        return this.prisma.qualificationApplication.findMany({ where: { discordId }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, number: true, unitName: true, status: true, createdAt: true, decisionReason: true } });
    }
    /** „Action On User Leave“: offene Bewerbungen einer Person, die den Discord-Server verlassen hat (Einstellung je Einheit). */
    async memberLeft(guildId, discordId) {
        const open = await this.prisma.qualificationApplication.findMany({ where: { discordId, status: 'OPEN', OR: [{ guildId }, { guildId: null }] } });
        let denied = 0, withdrawn = 0;
        for (const a of open) {
            const action = (await this.config(a.guildId)).units.find((u) => u.key === a.unit)?.settings.onLeave ?? 'NONE';
            if (action === 'DENY') {
                await this.decide(decision_1.LEFT_ACTOR, a.id, 'REJECTED', decision_1.LEFT_REASON).then(() => denied++, () => undefined);
                continue;
            }
            if (action !== 'WITHDRAW')
                continue;
            const claimed = await this.prisma.$transaction(async (tx) => {
                const r = await tx.qualificationApplication.updateMany({ where: { id: a.id, status: 'OPEN' }, data: { status: 'WITHDRAWN', decidedAt: new Date(), decisionReason: decision_1.LEFT_REASON } });
                if (r.count)
                    await this.audit.record(decision_1.LEFT_ACTOR, { action: 'qualifications.application.withdraw', module: 'qualifications', entityType: 'QualificationApplication', entityId: a.id, before: { status: 'OPEN' }, after: { status: 'WITHDRAWN' }, reason: decision_1.LEFT_REASON }, tx);
                return r.count;
            });
            if (claimed)
                await this.discord.markDecided('qualification', a.id, decision_1.LEFT_ACTOR, 'WITHDRAWN', decision_1.LEFT_REASON);
            withdrawn += claimed;
        }
        return { denied, withdrawn };
    }
    async decide(actor, id, status, reason) {
        const a = await this.prisma.qualificationApplication.findUnique({ where: { id } });
        if (!a)
            throw new errors_1.AppError('NOT_FOUND', 'Bewerbung nicht gefunden.');
        if (a.status !== 'OPEN')
            throw new errors_1.AppError('CONFLICT', 'Über diese Bewerbung wurde schon entschieden.');
        const ownLink = actor.userId ? await this.prisma.discordLink.findUnique({ where: { userId: actor.userId } }) : null;
        if ((a.userId && a.userId === actor.userId) || ownLink?.discordId === a.discordId)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Über deine eigene Bewerbung kannst du nicht entscheiden.');
        const unit = (await this.config(a.guildId)).units.find((u) => u.key === a.unit);
        let addedToSek = false;
        await this.prisma.$transaction(async (tx) => {
            const claimed = await tx.qualificationApplication.updateMany({ where: { id, status: 'OPEN' }, data: { status, decidedById: actor.userId, decidedAt: new Date(), decisionReason: reason || null } });
            if (claimed.count === 0)
                throw new errors_1.AppError('CONFLICT', 'Über diese Bewerbung wurde schon entschieden.');
            if (status === 'ACCEPTED' && a.unit === 'sek' && a.userId) {
                await tx.sekMember.upsert({ where: { userId: a.userId }, create: { userId: a.userId, addedById: actor.userId }, update: {} });
                // System-Rolle „SEK“ (Einsatzberichte schreiben), falls vorhanden
                const role = await tx.role.findUnique({ where: { name: 'SEK' } });
                if (role)
                    await tx.userRole.upsert({ where: { userId_roleId: { userId: a.userId, roleId: role.id } }, create: { userId: a.userId, roleId: role.id }, update: {} });
                addedToSek = true;
            }
            if (a.userId)
                await tx.notification.create({ data: { userId: a.userId, type: 'QUALIFICATION', title: `Deine Bewerbung ${a.number} (${a.unitName}) wurde ${status === 'ACCEPTED' ? 'angenommen' : 'nicht angenommen'}` } });
            await this.audit.record(actor, { action: `qualifications.application.${status === 'ACCEPTED' ? 'accept' : 'reject'}`, module: 'qualifications', entityType: 'QualificationApplication', entityId: id, before: { status: 'OPEN' }, after: { status }, reason }, tx);
        });
        // wie bei Appy: entschiedene Bewerbung in den Channel für angenommene/abgelehnte Bewerbungen posten –
        // aber nur, wenn es keine Original-Nachricht in Discord gibt (die wird dann nur aktualisiert)
        const archive = status === 'ACCEPTED' ? unit?.acceptedChannelId : unit?.deniedChannelId;
        if (archive && !(await this.discord.hasTrackedMessage(`msg-q-${a.id}`))) {
            const by = actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
            await this.discord.enqueue('qualifications', 'qualification.archived', {
                id: a.id, number: a.number, unitName: a.unitName, discordId: a.discordId, discordName: a.discordName, answers: a.answers, durationSec: a.durationSec, joinedAt: a.joinedAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString(),
                status, reason: reason || null, decidedByName: by?.displayName ?? null, channelId: archive, guildName: a.guildId ? (await this.discord.guilds()).find((g) => g.id === a.guildId)?.name ?? null : null,
            }, { always: true });
        }
        const by = actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
        const settings = unit?.settings ?? qualifications_config_1.appSettingsSchema.parse({});
        const roles = (0, decision_1.decisionRoles)(settings, status === 'ACCEPTED', [unit?.roleId, ...a.grantRoleIds]);
        const decider = ownLink ? `<@${ownLink.discordId}>` : by?.displayName ?? 'dem Team';
        await this.discord.enqueue('qualifications', 'qualification.decided', {
            discordId: a.discordId, status, number: a.number, unitName: a.unitName, roleIds: roles.add, removeRoleIds: roles.remove, reason: reason || null,
            message: (0, decision_1.decisionMessage)(settings, status === 'ACCEPTED', { applicationName: a.unitName, number: a.number, decider, applicantId: a.discordId, reason }),
        }, { always: true });
        await this.discord.markDecided('qualification', id, actor, status, reason || null);
        // Personal/Dienstnummer-Automatik (falls für diese Einheit eingerichtet)
        if (status === 'ACCEPTED')
            await hire_events_1.hireEvents.accepted(actor, { applicationId: a.id, number: a.number, kind: a.unitName, discordId: a.discordId, name: a.discordName });
        return { id, number: a.number, unitName: a.unitName, status, addedToSek, decidedByName: by?.displayName ?? null, reason: reason || null };
    }
};
exports.QualificationsService = QualificationsService;
exports.QualificationsService = QualificationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, discord_service_1.DiscordService, roblox_service_1.RobloxService, application_bans_service_1.ApplicationBansService])
], QualificationsService);
//# sourceMappingURL=qualifications.service.js.map