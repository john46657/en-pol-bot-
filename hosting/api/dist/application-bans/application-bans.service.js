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
exports.ApplicationBansService = exports.BAN_POLICE = exports.BAN_ALL = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
const roblox_service_1 = require("../persons/roblox.service");
const guild_context_1 = require("../common/guild-context");
/** „*“ = alle Bewerbungen, „police“ = Polizei-Bewerbung, sonst Schlüssel einer Qualifikation (z. B. „sek“). */
exports.BAN_ALL = '*';
exports.BAN_POLICE = 'police';
/**
 * Bewerbungssperren: Wer gesperrt ist, kann die betroffenen Bewerbungen gar nicht erst starten (Discord-Panel,
 * /bewerbung) und wird beim Absenden (Discord und Web /apply) abgewiesen. Erkannt wird per Discord-ID oder Roblox-ID.
 * Jeder Discord-Server hat seine eigene Sperrliste; Sperren ohne Server gelten überall.
 */
let ApplicationBansService = class ApplicationBansService {
    prisma;
    audit;
    roblox;
    constructor(prisma, audit, roblox) {
        this.prisma = prisma;
        this.audit = audit;
        this.roblox = roblox;
    }
    activeWhere() { return { liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }; }
    /** Aktive Sperre für diese Person und diese Bewerbung (oder null). */
    async find(who, scope, guildId) {
        const ids = [...(who.discordId ? [{ discordId: who.discordId }] : []), ...(who.robloxUserId ? [{ robloxUserId: who.robloxUserId }] : [])];
        if (!ids.length)
            return null;
        return this.prisma.applicationBan.findFirst({ where: { AND: [this.activeWhere(), { OR: [{ guildId: null }, ...(guildId ? [{ guildId }] : [])] }, { OR: ids }, { OR: [{ scopes: { has: exports.BAN_ALL } }, { scopes: { has: scope } }] }] }, orderBy: { createdAt: 'desc' } });
    }
    /** Text für die gesperrte Person (Discord-DM/Antwort, Web-Fehlermeldung). */
    message(ban, what) {
        return `Du bist für ${what} gesperrt und kannst dich nicht bewerben. Grund: ${ban.reason}${ban.expiresAt ? ` · gilt bis ${ban.expiresAt.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}` : ''}`;
    }
    async assertAllowed(who, scope, what, guildId) {
        const ban = await this.find(who, scope, guildId);
        if (ban)
            throw new errors_1.AppError('CONFLICT', this.message(ban, what), { reason: 'APPLICATION_BANNED' });
    }
    /** Für den Bot vor dem Start einer Bewerbung. */
    async check(discordId, scope, what, guildId) {
        const ban = await this.find({ discordId }, scope, guildId);
        return ban ? { banned: true, message: this.message(ban, what) } : { banned: false, message: null };
    }
    /** Sperrliste des gewählten Servers (ohne Server: die übergreifenden). */
    async list(includeInactive) {
        const guildId = (0, guild_context_1.currentGuild)();
        return this.prisma.applicationBan.findMany({ where: { AND: [{ guildId }, includeInactive ? {} : this.activeWhere()] }, orderBy: { createdAt: 'desc' }, take: 500 });
    }
    async create(actor, d) {
        const discordId = d.discordId?.trim() || null;
        let robloxUserId = null, robloxName = null;
        if (d.roblox?.trim()) {
            const term = d.roblox.trim();
            if (/^\d{1,20}$/.test(term))
                robloxUserId = term;
            else {
                const rb = await this.roblox.verifyName(term);
                if (rb === null)
                    throw new errors_1.AppError('VALIDATION_FAILED', `Den Roblox-Benutzer „${term}“ gibt es nicht.`);
                if (!rb)
                    throw new errors_1.AppError('VALIDATION_FAILED', 'Roblox ist gerade nicht erreichbar – bitte die Roblox-ID eintragen.');
                robloxUserId = rb.id;
                robloxName = rb.name;
            }
        }
        if (!discordId && !robloxUserId)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Bitte Discord-ID und/oder Roblox-Name angeben.');
        const scopes = d.scopes.includes(exports.BAN_ALL) ? [exports.BAN_ALL] : [...new Set(d.scopes)];
        if (!scopes.length)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Bitte mindestens eine Bewerbung auswählen.');
        const expiresAt = d.expiresAt ? new Date(d.expiresAt) : null;
        if (expiresAt && expiresAt.getTime() <= Date.now())
            throw new errors_1.AppError('VALIDATION_FAILED', 'Das Ablaufdatum liegt in der Vergangenheit.');
        const by = actor.userId ? (await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }))?.displayName ?? null : null;
        const name = d.name?.trim() || robloxName || (d.roblox?.trim() ?? '') || (discordId ? `Discord ${discordId}` : 'unbekannt');
        return this.prisma.$transaction(async (tx) => {
            const row = await tx.applicationBan.create({ data: { guildId: (0, guild_context_1.currentGuild)(), discordId, robloxUserId, name, scopes, reason: d.reason.trim(), expiresAt, createdById: actor.userId, createdByName: by } });
            await this.audit.record(actor, { action: 'application.ban.create', module: 'applications', entityType: 'ApplicationBan', entityId: row.id, after: { discordId, robloxUserId, name, scopes, reason: row.reason, expiresAt } }, tx);
            return row;
        });
    }
    async lift(actor, id) {
        const b = await this.prisma.applicationBan.findUnique({ where: { id } });
        if (!b || b.guildId !== (0, guild_context_1.currentGuild)())
            throw new errors_1.AppError('NOT_FOUND', 'Sperre nicht gefunden.');
        if (b.liftedAt)
            return b;
        return this.prisma.$transaction(async (tx) => {
            const row = await tx.applicationBan.update({ where: { id }, data: { liftedAt: new Date(), liftedById: actor.userId } });
            await this.audit.record(actor, { action: 'application.ban.lift', module: 'applications', entityType: 'ApplicationBan', entityId: id, before: { scopes: b.scopes, reason: b.reason } }, tx);
            return row;
        });
    }
};
exports.ApplicationBansService = ApplicationBansService;
exports.ApplicationBansService = ApplicationBansService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, roblox_service_1.RobloxService])
], ApplicationBansService);
//# sourceMappingURL=application-bans.service.js.map