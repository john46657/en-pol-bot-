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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const prisma_service_1 = require("../prisma/prisma.service");
const permission_service_1 = require("../authz/permission.service");
const guards_1 = require("../authz/guards");
const realtime_service_1 = require("./realtime.service");
const env_1 = require("../config/env");
const parseCookie = (h, name) => h?.split(';').map((c) => c.trim().split('=')).find(([k]) => k === name)?.[1];
let RealtimeGateway = class RealtimeGateway {
    prisma;
    perms;
    rt;
    server;
    constructor(prisma, perms, rt) {
        this.prisma = prisma;
        this.perms = perms;
        this.rt = rt;
    }
    afterInit(server) { this.rt.server = server; }
    /** Authentifizierung beim Handshake über das httpOnly-Session-Cookie; ohne gültige Session wird die Verbindung getrennt. */
    handleConnection(client) {
        // Promise sofort ablegen, damit frühe `subscribe`-Nachrichten auf die Authentifizierung warten.
        client.data.ready = this.authenticate(client);
    }
    async authenticate(client) {
        const token = parseCookie(client.handshake.headers.cookie, guards_1.SESSION_COOKIE);
        const session = token ? await this.prisma.session.findUnique({ where: { tokenHash: (0, guards_1.hashToken)(decodeURIComponent(token)) }, include: { user: true } }) : null;
        if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.active) {
            client.disconnect(true);
            return;
        }
        client.data.userId = session.userId;
        client.data.sessionId = session.id;
        await client.join(`user:${session.userId}`);
    }
    async subscribe(client, body) {
        await client.data.ready;
        const room = body?.room;
        const userId = client.data.userId;
        const needed = room ? realtime_service_1.ROOM_PERMISSION[room] : undefined;
        // Gleiche Antwort für unbekannte und nicht erlaubte Räume → keine Information über Existenz.
        if (!userId || !needed || !(await this.perms.has(userId, needed)))
            return { ok: false, code: 'PERMISSION_DENIED' };
        // Session erneut prüfen (wurde sie inzwischen widerrufen?)
        const s = await this.prisma.session.findUnique({ where: { id: client.data.sessionId } });
        if (!s || s.revokedAt || s.expiresAt < new Date()) {
            setImmediate(() => client.disconnect(true));
            return { ok: false, code: 'UNAUTHENTICATED' };
        }
        await client.join(room);
        return { ok: true };
    }
    async unsubscribe(client, body) {
        if (body?.room && body.room in realtime_service_1.ROOM_PERMISSION)
            await client.leave(body.room);
        return { ok: true };
    }
};
exports.RealtimeGateway = RealtimeGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", Function)
], RealtimeGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('subscribe'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Function, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "subscribe", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('unsubscribe'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Function, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "unsubscribe", null);
exports.RealtimeGateway = RealtimeGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({ path: '/ws', cors: { origin: (0, env_1.loadEnv)().WEB_ORIGIN.split(','), credentials: true } }),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, permission_service_1.PermissionService, realtime_service_1.RealtimeService])
], RealtimeGateway);
//# sourceMappingURL=realtime.gateway.js.map