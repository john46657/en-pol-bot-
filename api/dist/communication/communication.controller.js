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
exports.CommunicationController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const communication_service_1 = require("./communication.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const channel = zod_1.z.enum(communication_service_1.CHANNELS);
const post = zod_1.z.object({ body: zod_1.z.string().trim().min(1).max(4000), entityId: zod_1.z.string().max(64).optional(), replyToId: zod_1.z.string().uuid().optional() });
const listQ = zod_1.z.object({ entityId: zod_1.z.string().max(64).optional(), q: zod_1.z.string().max(100).optional() });
let CommunicationController = class CommunicationController {
    c;
    constructor(c) {
        this.c = c;
    }
    list(a, ch, q) { return this.c.list(a, ch, q.entityId, q.q); }
    post(a, ch, b) { return this.c.post(a, ch, b); }
    pin(a, id) { return this.c.moderate(a, id, 'pin'); }
    del(a, id) { return this.c.moderate(a, id, 'delete'); }
};
exports.CommunicationController = CommunicationController;
__decorate([
    (0, common_1.Get)('channels/:channel/messages'),
    (0, decorators_1.RequirePermission)('communication.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('channel', (0, zod_pipe_1.zodBody)(channel))),
    __param(2, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0, void 0]),
    __metadata("design:returntype", void 0)
], CommunicationController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('channels/:channel/messages'),
    (0, decorators_1.RequirePermission)('communication.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('channel', (0, zod_pipe_1.zodBody)(channel))),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(post))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0, void 0]),
    __metadata("design:returntype", void 0)
], CommunicationController.prototype, "post", null);
__decorate([
    (0, common_1.Post)('messages/:id/pin'),
    (0, decorators_1.RequirePermission)('communication.moderate'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CommunicationController.prototype, "pin", null);
__decorate([
    (0, common_1.Post)('messages/:id/delete'),
    (0, decorators_1.RequirePermission)('communication.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CommunicationController.prototype, "del", null);
exports.CommunicationController = CommunicationController = __decorate([
    (0, swagger_1.ApiTags)('communication'),
    (0, common_1.Controller)('communication'),
    __metadata("design:paramtypes", [communication_service_1.CommunicationService])
], CommunicationController);
//# sourceMappingURL=communication.controller.js.map