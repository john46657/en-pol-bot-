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
exports.CommunicationService = exports.CHANNELS = void 0;
const common_1 = require("@nestjs/common");
const permission_service_1 = require("../authz/permission.service");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
const discord_service_1 = require("../discord/discord.service");
exports.CHANNELS = ['TEAM', 'DISPATCH', 'INCIDENT', 'SUPERVISOR', 'ANNOUNCEMENT'];
/** Welche Permission berechtigt zum Lesen eines Kanals. */
const READ = { TEAM: 'communication.view', ANNOUNCEMENT: 'communication.view', DISPATCH: 'dispatch.view', INCIDENT: 'incidents.view', SUPERVISOR: 'team.manage' };
const WRITE = { TEAM: 'communication.send', DISPATCH: 'communication.send', INCIDENT: 'communication.send', SUPERVISOR: 'communication.send', ANNOUNCEMENT: 'communication.moderate' };
let CommunicationService = class CommunicationService {
    prisma;
    perms;
    audit;
    discord;
    constructor(prisma, perms, audit, discord) {
        this.prisma = prisma;
        this.perms = perms;
        this.audit = audit;
        this.discord = discord;
    }
    /** Berechtigung wird serverseitig geprüft – auch für spätere WebSocket-Subscriptions (gleiche Methode). */
    async canRead(userId, channel) { return (await this.perms.has(userId, 'communication.view')) && (await this.perms.has(userId, READ[channel])); }
    async conversation(channel, entityId) {
        const found = await this.prisma.conversation.findFirst({ where: { channel, entityId: entityId ?? null } });
        return found ?? this.prisma.conversation.create({ data: { channel, entityId: entityId ?? null } });
    }
    async list(actor, channel, entityId, q) {
        if (!(await this.canRead(actor.userId, channel)))
            throw new errors_1.AppError('PERMISSION_DENIED', 'You do not have permission to perform this action.');
        const c = await this.conversation(channel, entityId);
        return this.prisma.message.findMany({ where: { conversationId: c.id, deletedAt: null, ...(q ? { body: { contains: q, mode: 'insensitive' } } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 });
    }
    async post(actor, channel, d) {
        const uid = actor.userId;
        if (!(await this.canRead(uid, channel)) || !(await this.perms.has(uid, WRITE[channel])))
            throw new errors_1.AppError('PERMISSION_DENIED', 'You do not have permission to perform this action.');
        const c = await this.conversation(channel, d.entityId);
        if (d.replyToId && !(await this.prisma.message.findFirst({ where: { id: d.replyToId, conversationId: c.id } })))
            throw new errors_1.AppError('NOT_FOUND', 'Reply target not found.');
        const msg = await this.prisma.message.create({ data: { conversationId: c.id, authorId: uid, body: d.body, replyToId: d.replyToId } });
        if (channel === 'ANNOUNCEMENT') {
            const author = await this.prisma.user.findUnique({ where: { id: uid }, select: { displayName: true } });
            await this.discord.enqueue('announcements', 'announcement', { body: d.body.slice(0, 1500), author: author?.displayName ?? 'Command' });
        }
        return msg;
    }
    async moderate(actor, id, action) {
        const m = await this.prisma.message.findUnique({ where: { id }, include: { conversation: true } });
        if (!m || m.deletedAt)
            throw new errors_1.AppError('NOT_FOUND', 'Message not found.');
        const mod = await this.perms.has(actor.userId, 'communication.moderate');
        if (action === 'delete' ? !(mod || m.authorId === actor.userId) : !mod)
            throw new errors_1.AppError('PERMISSION_DENIED', 'You do not have permission to perform this action.');
        if (!(await this.canRead(actor.userId, m.conversation.channel)))
            throw new errors_1.AppError('NOT_FOUND', 'Message not found.');
        const r = await this.prisma.message.update({ where: { id }, data: action === 'delete' ? { deletedAt: new Date() } : { pinned: action === 'pin' } });
        if (mod)
            await this.audit.record(actor, { action: `message.${action}`, module: 'communication', entityType: 'Message', entityId: id });
        return r;
    }
};
exports.CommunicationService = CommunicationService;
exports.CommunicationService = CommunicationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, permission_service_1.PermissionService, audit_service_1.AuditService, discord_service_1.DiscordService])
], CommunicationService);
//# sourceMappingURL=communication.service.js.map