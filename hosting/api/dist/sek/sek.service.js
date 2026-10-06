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
exports.SekService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const discord_service_1 = require("../discord/discord.service");
const errors_1 = require("../common/errors");
const numbering_1 = require("../common/numbering");
/** SEK (Spezialeinsatzkommando): Roster, Einsatzberichte (nur Mitglieder) und Bewerbungen (Annahme → Aufnahme ins Roster). */
let SekService = class SekService {
    prisma;
    audit;
    discord;
    constructor(prisma, audit, discord) {
        this.prisma = prisma;
        this.audit = audit;
        this.discord = discord;
    }
    async resolve(t) {
        const user = t.userId ? await this.prisma.user.findUnique({ where: { id: t.userId } }) : t.discordId ? await this.discord.resolveUser(t.discordId) : null;
        if (!user?.active)
            throw new errors_1.AppError('NOT_FOUND', t.discordId ? 'That Discord account is not linked to an active user.' : 'User not found.');
        return user;
    }
    async people(ids) {
        const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, displayName: true, personnel: { select: { callsign: true, rank: true } } } });
        return new Map(users.map((u) => [u.id, { displayName: u.displayName, callsign: u.personnel?.callsign ?? null, rank: u.personnel?.rank ?? null }]));
    }
    async isMember(userId) { return !!(await this.prisma.sekMember.findUnique({ where: { userId } })); }
    async me(userId) {
        const open = await this.prisma.sekApplication.findFirst({ where: { userId, status: 'OPEN' }, select: { number: true, createdAt: true } });
        return { member: await this.isMember(userId), openApplication: open };
    }
    // ---- Roster ----
    async members() {
        const rows = await this.prisma.sekMember.findMany({ orderBy: { createdAt: 'asc' } });
        const p = await this.people(rows.map((r) => r.userId));
        return rows.map((r) => ({ userId: r.userId, ...(p.get(r.userId) ?? { displayName: '—', callsign: null, rank: null }), since: r.createdAt }));
    }
    async addMember(actor, t) {
        const user = await this.resolve(t);
        if (await this.isMember(user.id))
            throw new errors_1.AppError('CONFLICT', `${user.displayName} is already an SEK member.`);
        await this.prisma.$transaction(async (tx) => {
            await tx.sekMember.create({ data: { userId: user.id, addedById: actor.userId } });
            await tx.notification.create({ data: { userId: user.id, type: 'SEK', title: 'You are now a member of the SEK' } });
            await this.audit.record(actor, { action: 'sek.member.add', module: 'sek', entityType: 'User', entityId: user.id }, tx);
        });
        return { userId: user.id, displayName: user.displayName, member: true };
    }
    async removeMember(actor, t) {
        const user = await this.resolve(t);
        await this.prisma.$transaction(async (tx) => {
            const r = await tx.sekMember.deleteMany({ where: { userId: user.id } });
            if (r.count === 0)
                throw new errors_1.AppError('NOT_FOUND', `${user.displayName} is not an SEK member.`);
            await this.audit.record(actor, { action: 'sek.member.remove', module: 'sek', entityType: 'User', entityId: user.id }, tx);
        });
        return { userId: user.id, displayName: user.displayName, member: false };
    }
    // ---- Einsatzberichte ----
    async reports(limit) {
        const rows = await this.prisma.sekReport.findMany({ orderBy: { occurredAt: 'desc' }, take: limit });
        const p = await this.people(rows.map((r) => r.authorId));
        return rows.map((r) => ({ ...r, authorName: p.get(r.authorId)?.displayName ?? '—', authorCallsign: p.get(r.authorId)?.callsign ?? null }));
    }
    async createReport(actor, d) {
        const userId = actor.userId;
        if (!(await this.isMember(userId)))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Only SEK members can file SEK mission reports.');
        const r = await this.prisma.$transaction(async (tx) => {
            const rep = await tx.sekReport.create({ data: { number: (0, numbering_1.makeNumber)('SEK'), authorId: userId, occurredAt: d.occurredAt ?? new Date(), missionType: d.missionType, description: d.description } });
            await this.audit.record(actor, { action: 'sek.report.create', module: 'sek', entityType: 'SekReport', entityId: rep.id, after: { number: rep.number, missionType: rep.missionType } }, tx);
            return rep;
        });
        const author = (await this.people([userId])).get(userId);
        await this.discord.enqueue('sek', 'sek.report', { number: r.number, missionType: r.missionType, description: r.description, occurredAt: r.occurredAt.toISOString(), author: author?.callsign ?? author?.displayName ?? '—' });
        return r;
    }
    // ---- Bewerbungen ----
    async applications(status) {
        const rows = await this.prisma.sekApplication.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 100 });
        const p = await this.people(rows.flatMap((r) => [r.userId, ...(r.decidedById ? [r.decidedById] : [])]));
        return rows.map((r) => ({ ...r, applicant: p.get(r.userId) ?? { displayName: '—', callsign: null, rank: null }, decidedByName: r.decidedById ? p.get(r.decidedById)?.displayName ?? '—' : null }));
    }
    async apply(actor, d) {
        const userId = actor.userId;
        if (await this.isMember(userId))
            throw new errors_1.AppError('CONFLICT', 'You are already an SEK member.');
        if (await this.prisma.sekApplication.findFirst({ where: { userId, status: 'OPEN' } }))
            throw new errors_1.AppError('CONFLICT', 'You already have an open SEK application.');
        const a = await this.prisma.$transaction(async (tx) => {
            const app = await tx.sekApplication.create({ data: { number: (0, numbering_1.makeNumber)('SEKB'), userId, serviceTime: d.serviceTime, motivation: d.motivation, experience: d.experience } });
            await this.audit.record(actor, { action: 'sek.application.submit', module: 'sek', entityType: 'SekApplication', entityId: app.id, after: { number: app.number } }, tx);
            return app;
        });
        const me = (await this.people([userId])).get(userId);
        const link = await this.prisma.discordLink.findUnique({ where: { userId } });
        await this.discord.enqueue('sek', 'sek.application', { number: a.number, applicant: me?.displayName ?? '—', callsign: me?.callsign ?? null, discordId: link?.discordId ?? null, serviceTime: a.serviceTime, motivation: a.motivation, experience: a.experience });
        return { number: a.number, status: a.status };
    }
    async decide(actor, id, status) {
        const a = await this.prisma.sekApplication.findUnique({ where: { id } });
        if (!a)
            throw new errors_1.AppError('NOT_FOUND', 'Application not found.');
        if (a.status !== 'OPEN')
            throw new errors_1.AppError('CONFLICT', 'This application has already been decided.');
        if (a.userId === actor.userId)
            throw new errors_1.AppError('PERMISSION_DENIED', 'You cannot decide on your own application.');
        await this.prisma.$transaction(async (tx) => {
            const claimed = await tx.sekApplication.updateMany({ where: { id, status: 'OPEN' }, data: { status, decidedById: actor.userId, decidedAt: new Date() } });
            if (claimed.count === 0)
                throw new errors_1.AppError('CONFLICT', 'This application has already been decided.');
            if (status === 'ACCEPTED')
                await tx.sekMember.upsert({ where: { userId: a.userId }, create: { userId: a.userId, addedById: actor.userId }, update: {} });
            await tx.notification.create({ data: { userId: a.userId, type: 'SEK', title: status === 'ACCEPTED' ? `Your SEK application ${a.number} was accepted` : `Your SEK application ${a.number} was not accepted` } });
            await this.audit.record(actor, { action: `sek.application.${status === 'ACCEPTED' ? 'accept' : 'reject'}`, module: 'sek', entityType: 'SekApplication', entityId: id, before: { status: 'OPEN' }, after: { status } }, tx);
        });
        const link = await this.prisma.discordLink.findUnique({ where: { userId: a.userId } });
        if (link)
            await this.discord.enqueue('sek', 'sek.application.decided', { discordId: link.discordId, status, number: a.number }, { always: true });
        return { id, number: a.number, status };
    }
};
exports.SekService = SekService;
exports.SekService = SekService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, discord_service_1.DiscordService])
], SekService);
//# sourceMappingURL=sek.service.js.map