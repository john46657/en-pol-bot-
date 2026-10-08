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
exports.TicketsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const tickets_service_1 = require("./tickets.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const pagination_1 = require("../common/pagination");
const create = zod_1.z.object({ personId: zod_1.z.string().uuid().optional(), erlcPlayer: zod_1.z.object({ serverId: zod_1.z.string().uuid(), name: zod_1.z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_]+$/) }).optional(), notifyInGame: zod_1.z.boolean().optional(), legalCodeId: zod_1.z.string().uuid().optional(), reason: zod_1.z.string().trim().min(3).max(1000), amount: zod_1.z.number().min(0).max(1_000_000).optional(), notes: zod_1.z.string().max(5000).optional(), reportId: zod_1.z.string().uuid().optional() });
const voidSchema = zod_1.z.object({ reason: zod_1.z.string().trim().min(3).max(500) });
const listQuery = pagination_1.pageQuery.extend({ personId: zod_1.z.string().uuid().optional() });
let TicketsController = class TicketsController {
    tickets;
    constructor(tickets) {
        this.tickets = tickets;
    }
    list(q) { return this.tickets.list(q, q.personId); }
    /** Spieler im Spiel (ER:LC) für „Strafzettel an Spieler im Spiel“. */
    erlcPlayers() { return this.tickets.erlcPlayers(); }
    get(id) { return this.tickets.get(id); }
    create(a, b) { return this.tickets.issue(a, b); }
    void(a, id, b) { return this.tickets.void(a, id, b.reason); }
};
exports.TicketsController = TicketsController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('tickets.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], TicketsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('erlc-players'),
    (0, decorators_1.RequirePermission)('tickets.create'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TicketsController.prototype, "erlcPlayers", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('tickets.view'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TicketsController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('tickets.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(create))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], TicketsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/void'),
    (0, decorators_1.RequirePermission)('tickets.void'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(voidSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], TicketsController.prototype, "void", null);
exports.TicketsController = TicketsController = __decorate([
    (0, swagger_1.ApiTags)('tickets'),
    (0, common_1.Controller)('tickets'),
    __metadata("design:paramtypes", [tickets_service_1.TicketsService])
], TicketsController);
//# sourceMappingURL=tickets.controller.js.map