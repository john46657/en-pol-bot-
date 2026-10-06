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
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const discord_service_1 = require("../discord/discord.service");
const errors_1 = require("../common/errors");
const numbering_1 = require("../common/numbering");
const web_url_1 = require("../common/web-url");
const qualifications_config_1 = require("./qualifications.config");
const applications_service_1 = require("../applications/applications.service");
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
    constructor(prisma, audit, discord) {
        this.prisma = prisma;
        this.audit = audit;
        this.discord = discord;
    }
    async config() {
        const row = await this.prisma.systemSetting.findUnique({ where: { key: KEY } });
        const parsed = row ? qualifications_config_1.configSchema.safeParse(row.value) : null;
        return parsed?.success ? parsed.data : qualifications_config_1.DEFAULT_CONFIG;
    }
    /** Fragen der Polizei-Bewerbung (dasselbe Formular wie /apply und Studio). */
    async policeForm() {
        return (await this.prisma.systemSetting.findUnique({ where: { key: FORM_KEY } }))?.value ?? applications_service_1.DEFAULT_FORM;
    }
    /** Alles für „Qualifications → Setup“ an einem Ort. */
    async setup() { return { ...(await this.config()), policeForm: await this.policeForm() }; }
    async saveConfig(actor, input) {
        const { policeForm, ...c } = input;
        await this.prisma.$transaction(async (tx) => {
            await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: c }, update: { value: c } });
            await this.audit.record(actor, { action: 'qualifications.config', module: 'qualifications', entityType: 'SystemSetting', entityId: KEY, after: { units: c.units.map((u) => u.key) } }, tx);
            if (policeForm) {
                await tx.systemSetting.upsert({ where: { key: FORM_KEY }, create: { key: FORM_KEY, value: policeForm }, update: { value: policeForm } });
                await this.audit.record(actor, { action: 'studio.config.changed', module: 'settings', entityType: 'SystemSetting', entityId: FORM_KEY, after: policeForm }, tx);
            }
        });
        return this.setup();
    }
    /** Für den Bot: läuft für diese Discord-ID schon eine offene Bewerbung (je Einheit)? */
    async openFor(discordId, unit) {
        const open = await this.prisma.qualificationApplication.findFirst({ where: { discordId, status: 'OPEN', ...(unit ? { unit } : {}) }, select: { number: true, unitName: true } });
        return { open: !!open, number: open?.number ?? null, unitName: open?.unitName ?? null };
    }
    async submit(d) {
        const cfg = await this.config();
        const unit = cfg.units.find((u) => u.key === d.unit);
        if (!unit)
            throw new errors_1.AppError('NOT_FOUND', 'Unknown unit.');
        if (d.answers.length !== unit.questions.length)
            throw new errors_1.AppError('VALIDATION_FAILED', `Expected ${unit.questions.length} answers.`);
        if ((await this.openFor(d.discordId, unit.key)).open)
            throw new errors_1.AppError('CONFLICT', `There is already an open application for ${unit.name}.`);
        const user = await this.discord.resolveUser(d.discordId);
        const a = await this.prisma.$transaction(async (tx) => {
            const row = await tx.qualificationApplication.create({ data: { number: (0, numbering_1.makeNumber)('Q'), unit: unit.key, unitName: unit.name, discordId: d.discordId, discordName: d.discordName, userId: user?.id, answers: d.answers, durationSec: d.durationSec, joinedAt: d.joinedAt } });
            await this.audit.record({ userId: user?.id ?? null }, { action: 'qualifications.application.submit', module: 'qualifications', entityType: 'QualificationApplication', entityId: row.id, after: { number: row.number, unit: unit.key, discordId: d.discordId } }, tx);
            return row;
        });
        // Eigener Channel der Einheit (falls eingestellt) – sonst der allgemeine Qualifications-Channel
        await this.discord.enqueue('qualifications', 'qualification.submitted', {
            id: a.id, number: a.number, unitName: a.unitName, discordId: a.discordId, discordName: a.discordName, linkedName: user?.displayName ?? null, answers: d.answers,
            durationSec: a.durationSec, joinedAt: a.joinedAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString(), dashboardUrl: (0, web_url_1.webUrl)(`/qualifications?id=${a.id}`),
            ...(unit.channelId ? { channelId: unit.channelId } : {}),
        }, { always: !!unit.channelId });
        return { id: a.id, number: a.number, unitName: a.unitName };
    }
    async list(f) {
        const rows = await this.prisma.qualificationApplication.findMany({ where: { ...(f.unit ? { unit: f.unit } : {}), ...(f.status ? { status: f.status } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
        const ids = [...new Set(rows.flatMap((r) => [r.userId, r.decidedById]).filter((x) => !!x))];
        const users = new Map((await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
        return rows.map((r) => ({ ...r, linkedName: r.userId ? users.get(r.userId) ?? null : null, decidedByName: r.decidedById ? users.get(r.decidedById) ?? '—' : null }));
    }
    async get(id) {
        const a = await this.prisma.qualificationApplication.findUnique({ where: { id } });
        if (!a)
            throw new errors_1.AppError('NOT_FOUND', 'Application not found.');
        return a;
    }
    /** Bisherige Qualifikations-Bewerbungen einer Discord-ID (Button „Verlauf“). */
    history(discordId) {
        return this.prisma.qualificationApplication.findMany({ where: { discordId }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, number: true, unitName: true, status: true, createdAt: true, decisionReason: true } });
    }
    async decide(actor, id, status, reason) {
        const a = await this.prisma.qualificationApplication.findUnique({ where: { id } });
        if (!a)
            throw new errors_1.AppError('NOT_FOUND', 'Application not found.');
        if (a.status !== 'OPEN')
            throw new errors_1.AppError('CONFLICT', 'This application has already been decided.');
        const ownLink = actor.userId ? await this.prisma.discordLink.findUnique({ where: { userId: actor.userId } }) : null;
        if ((a.userId && a.userId === actor.userId) || ownLink?.discordId === a.discordId)
            throw new errors_1.AppError('PERMISSION_DENIED', 'You cannot decide on your own application.');
        const unit = (await this.config()).units.find((u) => u.key === a.unit);
        let addedToSek = false;
        await this.prisma.$transaction(async (tx) => {
            const claimed = await tx.qualificationApplication.updateMany({ where: { id, status: 'OPEN' }, data: { status, decidedById: actor.userId, decidedAt: new Date(), decisionReason: reason || null } });
            if (claimed.count === 0)
                throw new errors_1.AppError('CONFLICT', 'This application has already been decided.');
            if (status === 'ACCEPTED' && a.unit === 'sek' && a.userId) {
                await tx.sekMember.upsert({ where: { userId: a.userId }, create: { userId: a.userId, addedById: actor.userId }, update: {} });
                // System-Rolle „SEK“ (Einsatzberichte schreiben), falls vorhanden
                const role = await tx.role.findUnique({ where: { name: 'SEK' } });
                if (role)
                    await tx.userRole.upsert({ where: { userId_roleId: { userId: a.userId, roleId: role.id } }, create: { userId: a.userId, roleId: role.id }, update: {} });
                addedToSek = true;
            }
            if (a.userId)
                await tx.notification.create({ data: { userId: a.userId, type: 'QUALIFICATION', title: `Your ${a.unitName} application ${a.number} was ${status === 'ACCEPTED' ? 'accepted' : 'not accepted'}` } });
            await this.audit.record(actor, { action: `qualifications.application.${status === 'ACCEPTED' ? 'accept' : 'reject'}`, module: 'qualifications', entityType: 'QualificationApplication', entityId: id, before: { status: 'OPEN' }, after: { status }, reason }, tx);
        });
        await this.discord.enqueue('qualifications', 'qualification.decided', { discordId: a.discordId, status, number: a.number, unitName: a.unitName, roleId: status === 'ACCEPTED' ? unit?.roleId || null : null, reason: reason || null }, { always: true });
        const by = actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
        return { id, number: a.number, unitName: a.unitName, status, addedToSek, decidedByName: by?.displayName ?? null, reason: reason || null };
    }
};
exports.QualificationsService = QualificationsService;
exports.QualificationsService = QualificationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, discord_service_1.DiscordService])
], QualificationsService);
//# sourceMappingURL=qualifications.service.js.map