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
    constructor(prisma, audit, discord) {
        this.prisma = prisma;
        this.audit = audit;
        this.discord = discord;
    }
    async form() {
        const s = await this.prisma.systemSetting.findUnique({ where: { key: 'application.form' } });
        return s?.value ?? exports.DEFAULT_FORM;
    }
    /** Öffentliche Bewerbung (kein Account nötig). Antworten werden strikt gegen das konfigurierte Formular validiert. */
    async submit(d, meta = {}) {
        if (d.robloxUserId && !(0, shared_1.isValidRobloxUserId)(d.robloxUserId))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Invalid Roblox user id.');
        const form = await this.form();
        const answers = {};
        for (const f of form) {
            const v = (d.answers[f.key] ?? '').trim();
            if (f.required && !v)
                throw new errors_1.AppError('VALIDATION_FAILED', `"${f.label}" is required.`);
            if (v.length > f.maxLength)
                throw new errors_1.AppError('VALIDATION_FAILED', `"${f.label}" is too long.`);
            if (v)
                answers[f.key] = v;
        }
        if (d.robloxUserId && (await this.prisma.application.count({ where: { robloxUserId: d.robloxUserId, status: { in: OPEN_STATUSES } } }))) {
            throw new errors_1.AppError('CONFLICT', 'An open application already exists for this Roblox user.');
        }
        if (meta.discordId && (await this.openForDiscord(meta.discordId)).open)
            throw new errors_1.AppError('CONFLICT', 'An open application already exists for this Discord account.');
        const a = await this.prisma.application.create({ data: { number: (0, numbering_1.makeNumber)('APP'), robloxUsername: d.robloxUsername, robloxUserId: d.robloxUserId, answers, discordId: meta.discordId, discordName: meta.discordName, durationSec: meta.durationSec, joinedAt: meta.joinedAt, source: meta.discordId ? 'DISCORD' : 'WEB' } });
        await this.audit.record({ userId: null }, { action: 'application.submit', module: 'applications', entityType: 'Application', entityId: a.id, after: { source: a.source } });
        await this.discord.enqueue('applications', 'application.submitted', {
            id: a.id, number: a.number, robloxUsername: a.robloxUsername, robloxUserId: a.robloxUserId ?? null, discordId: meta.discordId ?? null, discordName: meta.discordName ?? null, source: a.source,
            answers: form.filter((f) => answers[f.key]).map((f) => ({ question: f.label, answer: answers[f.key] })),
            durationSec: a.durationSec, joinedAt: a.joinedAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString(), dashboardUrl: (0, web_url_1.webUrl)(`/applications/${a.id}`),
        });
        return { number: a.number, status: a.status };
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
            const claimed = await tx.application.updateMany({ where: { id, status: a.status, version: a.version }, data: { status: to, decidedById: actor.userId, decisionReason: reason || null, version: { increment: 1 } } });
            if (claimed.count === 0)
                throw new errors_1.AppError('CONFLICT', 'This application has already been decided.');
            await this.audit.record(actor, { action: `application.${to.toLowerCase()}`, module: 'applications', entityType: 'Application', entityId: id, before: { status: a.status }, after: { status: to }, reason: reason || 'Entschieden über Discord' }, tx);
            return { ...a, status: to };
        });
        if (after.discordId)
            await this.discord.enqueue('applications', 'application.decided', { discordId: after.discordId, status: to, number: after.number, reason: reason || null }, { always: true });
        const by = actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
        return { id, number: after.number, status: to, decidedByName: by?.displayName ?? null, reason: reason || null };
    }
    async list(p, status) {
        const where = { ...(status ? { status } : {}), ...(p.q ? { OR: [{ number: { contains: p.q.toUpperCase() } }, { robloxUsername: { contains: p.q, mode: 'insensitive' } }] } : {}) };
        const [items, total] = await Promise.all([this.prisma.application.findMany({ where, orderBy: { createdAt: 'desc' }, ...(0, pagination_1.skipTake)(p) }), this.prisma.application.count({ where })]);
        return (0, pagination_1.pageResult)(items, total, p);
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
            const after = await tx.application.update({ where: { id }, data: { status: to, decidedById: to === 'ACCEPTED' || to === 'REJECTED' ? actor.userId : a.decidedById, version: { increment: 1 } } });
            await this.audit.record(actor, { action: `application.${to.toLowerCase()}`, module: 'applications', entityType: 'Application', entityId: id, before: { status: a.status }, after: { status: to }, reason }, tx);
            return after;
        }).then(async (after) => {
            // Entscheidung per Direktnachricht (nur bei Bewerbung über Discord). Der interne Grund wird NICHT mitgeschickt.
            if (after.discordId && (to === 'ACCEPTED' || to === 'REJECTED'))
                await this.discord.enqueue('applications', 'application.decided', { discordId: after.discordId, status: to, number: after.number }, { always: true });
            return after;
        });
    }
};
exports.ApplicationsService = ApplicationsService;
exports.ApplicationsService = ApplicationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, discord_service_1.DiscordService])
], ApplicationsService);
//# sourceMappingURL=applications.service.js.map