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
const guild_context_1 = require("../common/guild-context");
const numbering_1 = require("../common/numbering");
/** SEK (Spezialeinsatzkommando): Roster und Einsatzberichte (nur Mitglieder). Bewerbungen laufen über die Qualifikationen. */
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
            throw new errors_1.AppError('NOT_FOUND', t.discordId ? 'Dieses Discord-Konto ist mit keinem aktiven Benutzer verknüpft.' : 'Benutzer nicht gefunden.');
        return user;
    }
    async people(ids) {
        const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, displayName: true, personnel: (0, guild_context_1.personnelOfServer)({ callsign: true, rank: true }) } });
        return new Map(users.map((u) => [u.id, { displayName: u.displayName, callsign: u.personnel[0]?.callsign ?? null, rank: u.personnel[0]?.rank ?? null }]));
    }
    async isMember(userId) { return !!(await this.prisma.sekMember.findUnique({ where: { userId } })); }
    async me(userId) { return { member: await this.isMember(userId) }; }
    // ---- Roster ----
    async members() {
        const rows = await this.prisma.sekMember.findMany({ orderBy: { createdAt: 'asc' } });
        const p = await this.people(rows.map((r) => r.userId));
        return rows.map((r) => ({ userId: r.userId, ...(p.get(r.userId) ?? { displayName: '—', callsign: null, rank: null }), since: r.createdAt }));
    }
    /** Wer hinzugefügt werden kann: alle aktiven Benutzer, die noch nicht im SEK sind (mit Dienstnummer/Dienstgrad, falls vorhanden). */
    async candidates() {
        const members = new Set((await this.prisma.sekMember.findMany({ select: { userId: true } })).map((m) => m.userId));
        const users = await this.prisma.user.findMany({ where: { active: true }, orderBy: { displayName: 'asc' }, take: 1000, select: { id: true, displayName: true, username: true, personnel: (0, guild_context_1.personnelOfServer)({ callsign: true, rank: true }) } });
        const linked = new Set((await this.prisma.discordLink.findMany({ select: { userId: true } })).map((l) => l.userId));
        return users.filter((u) => !members.has(u.id)).map((u) => ({ userId: u.id, name: u.displayName, username: u.username, callsign: u.personnel[0]?.callsign ?? null, rank: u.personnel[0]?.rank ?? null, discordLinked: linked.has(u.id) }));
    }
    async addMember(actor, t) {
        const user = await this.resolve(t);
        if (await this.isMember(user.id))
            throw new errors_1.AppError('CONFLICT', `${user.displayName} ist schon SEK-Mitglied.`);
        await this.prisma.$transaction(async (tx) => {
            await tx.sekMember.create({ data: { userId: user.id, addedById: actor.userId } });
            await tx.notification.create({ data: { userId: user.id, type: 'SEK', title: 'Du bist jetzt Mitglied des SEK' } });
            await this.audit.record(actor, { action: 'sek.member.add', module: 'sek', entityType: 'User', entityId: user.id }, tx);
        });
        return { userId: user.id, displayName: user.displayName, member: true };
    }
    async removeMember(actor, t) {
        const user = await this.resolve(t);
        await this.prisma.$transaction(async (tx) => {
            const r = await tx.sekMember.deleteMany({ where: { userId: user.id } });
            if (r.count === 0)
                throw new errors_1.AppError('NOT_FOUND', `${user.displayName} ist kein SEK-Mitglied.`);
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
            throw new errors_1.AppError('PERMISSION_DENIED', 'Nur SEK-Mitglieder können SEK-Einsatzberichte schreiben.');
        const r = await this.prisma.$transaction(async (tx) => {
            const rep = await tx.sekReport.create({ data: { number: (0, numbering_1.makeNumber)('SEK'), authorId: userId, occurredAt: d.occurredAt ?? new Date(), missionType: d.missionType, description: d.description } });
            await this.audit.record(actor, { action: 'sek.report.create', module: 'sek', entityType: 'SekReport', entityId: rep.id, after: { number: rep.number, missionType: rep.missionType } }, tx);
            return rep;
        });
        const author = (await this.people([userId])).get(userId);
        await this.discord.enqueue('sek', 'sek.report', { number: r.number, missionType: r.missionType, description: r.description, occurredAt: r.occurredAt.toISOString(), author: author?.callsign ?? author?.displayName ?? '—' });
        return r;
    }
};
exports.SekService = SekService;
exports.SekService = SekService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, discord_service_1.DiscordService])
], SekService);
//# sourceMappingURL=sek.service.js.map