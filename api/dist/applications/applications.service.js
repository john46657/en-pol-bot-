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
exports.DEFAULT_FORM = [
    { key: 'experience', label: 'Experience', required: true, maxLength: 2000 },
    { key: 'availability', label: 'Availability', required: true, maxLength: 500 },
    { key: 'motivation', label: 'Motivation', required: true, maxLength: 3000 },
    { key: 'roleplayKnowledge', label: 'Roleplay Knowledge', required: true, maxLength: 3000 },
    { key: 'erlcKnowledge', label: 'ER:LC Knowledge', required: false, maxLength: 3000 },
    { key: 'communication', label: 'Communication', required: false, maxLength: 2000 },
];
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
        if (d.robloxUserId && (await this.prisma.application.count({ where: { robloxUserId: d.robloxUserId, status: { in: ['SUBMITTED', 'SCREENING', 'INTERVIEW', 'PENDING_DECISION'] } } }))) {
            throw new errors_1.AppError('CONFLICT', 'An open application already exists for this Roblox user.');
        }
        const a = await this.prisma.application.create({ data: { number: (0, numbering_1.makeNumber)('APP'), robloxUsername: d.robloxUsername, robloxUserId: d.robloxUserId, answers, discordId: meta.discordId, source: meta.discordId ? 'DISCORD' : 'WEB' } });
        await this.audit.record({ userId: null }, { action: 'application.submit', module: 'applications', entityType: 'Application', entityId: a.id, after: { source: a.source } });
        await this.discord.enqueue('applications', 'application.submitted', { number: a.number, robloxUsername: a.robloxUsername, discordId: meta.discordId ?? null, source: a.source });
        return { number: a.number, status: a.status };
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