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
exports.ERLCController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const zod_1 = require("zod");
const common_2 = require("@nestjs/common");
const erlc_sync_1 = require("./erlc.sync");
const erlc_webhook_1 = require("./erlc.webhook");
const erlc_client_1 = require("./erlc.client");
const erlc_types_1 = require("./erlc.types");
const prisma_service_1 = require("../prisma/prisma.service");
const decorators_1 = require("../authz/decorators");
const errors_1 = require("../common/errors");
const zod_pipe_1 = require("../common/zod.pipe");
const eventsQ = zod_1.z.object({ take: zod_1.z.coerce.number().int().min(1).max(100).default(25) });
function toAppError(e) {
    if (e instanceof erlc_client_1.ERLCError) {
        if (e.kind === 'RATE_LIMITED')
            throw new errors_1.AppError('RATE_LIMITED', 'ER:LC is rate limiting requests. Try again later.');
        throw new errors_1.AppError('CAPABILITY_UNAVAILABLE', erlc_types_1.CAPABILITY_MESSAGE, { reason: e.kind });
    }
    throw e;
}
let ERLCController = class ERLCController {
    sync;
    webhooks;
    prisma;
    constructor(sync, webhooks, prisma) {
        this.sync = sync;
        this.webhooks = webhooks;
        this.prisma = prisma;
    }
    /** Connector-Health: enthält niemals Secrets, nur Status-Metadaten. */
    health() { return this.sync.health(); }
    async server() { try {
        return await this.sync.fetch('SERVER');
    }
    catch (e) {
        toAppError(e);
    } }
    async players() { try {
        return await this.sync.fetch('PLAYERS');
    }
    catch (e) {
        toAppError(e);
    } }
    async vehicles() { try {
        return await this.sync.fetch('VEHICLES');
    }
    catch (e) {
        toAppError(e);
    } }
    positions() { throw new errors_1.AppError('CAPABILITY_UNAVAILABLE', erlc_types_1.CAPABILITY_MESSAGE, { reason: 'NOT_PROVIDED_BY_DOCUMENTED_API' }); }
    events(q) { return this.prisma.eRLCEvent.findMany({ orderBy: { receivedAt: 'desc' }, take: q.take }); }
    /** Öffentlich erreichbar (ER:LC-Server ruft auf), aber ausschließlich per Ed25519-Signatur authentifiziert. */
    webhook(req, signature, timestamp) {
        return this.webhooks.receive(req.rawBody, { signature, timestamp }, { ip: req.ip, requestId: req.requestId });
    }
};
exports.ERLCController = ERLCController;
__decorate([
    (0, common_1.Get)('health'),
    (0, decorators_1.RequirePermission)('erlc.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ERLCController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('live/server'),
    (0, decorators_1.RequirePermission)('erlc.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ERLCController.prototype, "server", null);
__decorate([
    (0, common_1.Get)('live/players'),
    (0, decorators_1.RequirePermission)('erlc.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ERLCController.prototype, "players", null);
__decorate([
    (0, common_1.Get)('live/vehicles'),
    (0, decorators_1.RequirePermission)('erlc.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ERLCController.prototype, "vehicles", null);
__decorate([
    (0, common_1.Get)('live/positions'),
    (0, decorators_1.RequirePermission)('erlc.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ERLCController.prototype, "positions", null);
__decorate([
    (0, common_1.Get)('events'),
    (0, decorators_1.RequirePermission)('erlc.view'),
    __param(0, (0, common_2.Query)((0, zod_pipe_1.zodBody)(eventsQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], ERLCController.prototype, "events", null);
__decorate([
    (0, decorators_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 120, ttl: 60_000 } }),
    (0, common_1.Post)('webhook'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Headers)('x-signature-ed25519')),
    __param(2, (0, common_1.Headers)('x-signature-timestamp')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], ERLCController.prototype, "webhook", null);
exports.ERLCController = ERLCController = __decorate([
    (0, swagger_1.ApiTags)('erlc'),
    (0, common_1.Controller)('erlc'),
    __metadata("design:paramtypes", [erlc_sync_1.ERLCSyncService, erlc_webhook_1.ERLCWebhookService, prisma_service_1.PrismaService])
], ERLCController);
//# sourceMappingURL=erlc.controller.js.map