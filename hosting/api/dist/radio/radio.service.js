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
exports.RadioService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const discord_service_1 = require("../discord/discord.service");
const guild_context_1 = require("../common/guild-context");
const errors_1 = require("../common/errors");
/** Funk-Freigabe: nur freigegebene Mitglieder gelten als funkberechtigt. Identifikation per Benutzer-ID oder verknüpfter Discord-ID. */
let RadioService = class RadioService {
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
    async list() {
        const rows = await this.prisma.radioWhitelist.findMany({ orderBy: { createdAt: 'asc' } });
        const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, displayName: true, personnel: (0, guild_context_1.personnelOfServer)({ callsign: true, rank: true }) } });
        return rows.map((r) => { const u = users.find((x) => x.id === r.userId); return { userId: r.userId, displayName: u?.displayName ?? '—', callsign: u?.personnel[0]?.callsign ?? null, rank: u?.personnel[0]?.rank ?? null, since: r.createdAt }; });
    }
    async check(t) {
        const user = await this.resolve(t);
        return { whitelisted: !!(await this.prisma.radioWhitelist.findUnique({ where: { userId: user.id } })), displayName: user.displayName };
    }
    async add(actor, t) {
        const user = await this.resolve(t);
        if (await this.prisma.radioWhitelist.findUnique({ where: { userId: user.id } }))
            throw new errors_1.AppError('CONFLICT', `${user.displayName} steht schon auf der Funk-Whitelist.`);
        await this.prisma.$transaction(async (tx) => {
            await tx.radioWhitelist.create({ data: { userId: user.id, addedById: actor.userId } });
            await tx.notification.create({ data: { userId: user.id, type: 'RADIO', title: 'Du bist jetzt für den Funk freigegeben' } });
            await this.audit.record(actor, { action: 'radio.add', module: 'team', entityType: 'User', entityId: user.id }, tx);
        });
        return { userId: user.id, displayName: user.displayName, whitelisted: true };
    }
    async remove(actor, t) {
        const user = await this.resolve(t);
        await this.prisma.$transaction(async (tx) => {
            const r = await tx.radioWhitelist.deleteMany({ where: { userId: user.id } });
            if (r.count === 0)
                throw new errors_1.AppError('NOT_FOUND', `${user.displayName} steht nicht auf der Funk-Whitelist.`);
            await this.audit.record(actor, { action: 'radio.remove', module: 'team', entityType: 'User', entityId: user.id }, tx);
        });
        return { userId: user.id, displayName: user.displayName, whitelisted: false };
    }
};
exports.RadioService = RadioService;
exports.RadioService = RadioService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, discord_service_1.DiscordService])
], RadioService);
//# sourceMappingURL=radio.service.js.map