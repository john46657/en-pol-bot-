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
exports.LeaveController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const leave_service_1 = require("./leave.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const requestBody = zod_1.z.object({ startsAt: zod_1.z.coerce.date(), endsAt: zod_1.z.coerce.date(), reason: zod_1.z.string().trim().min(3).max(1000), guildId: zod_1.z.string().regex(/^\d{15,25}$/).optional(), type: zod_1.z.string().regex(/^[A-Z0-9_]{1,32}$/).optional(), comment: zod_1.z.string().trim().max(1000).optional() });
const listQ = zod_1.z.object({ status: zod_1.z.enum([...leave_service_1.LEAVE_STATUSES, 'ACTIVE', 'UPCOMING', 'ALL']).optional(), mine: zod_1.z.enum(['true', 'false']).optional() });
const decision = zod_1.z.object({ status: zod_1.z.enum(['APPROVED', 'DENIED']), reason: zod_1.z.string().trim().max(1000).optional() });
/** Abmeldungen (Leave of Absences). Beantragen: leave.request · alle sehen: leave.view · entscheiden: leave.manage. */
let LeaveController = class LeaveController {
    s;
    constructor(s) {
        this.s = s;
    }
    config() { return this.s.config(); }
    saveConfig(a, b) { return this.s.saveConfig(a, b); }
    list(a, q) { return this.s.list(a, { status: q.status, mine: q.mine === 'true' }); }
    request(a, b) { return this.s.request(a, b); }
    decide(a, id, b) { return this.s.decide(a, id, b.status, b.reason); }
    /** Eigene zurückziehen; Leitung (leave.manage) kann jede beenden. */
    cancel(a, id) { return this.s.cancel(a, id); }
};
exports.LeaveController = LeaveController;
__decorate([
    (0, common_1.Get)('config'),
    (0, decorators_1.RequirePermission)('team.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LeaveController.prototype, "config", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(leave_service_1.leaveConfigSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], LeaveController.prototype, "saveConfig", null);
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('leave.request'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], LeaveController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('leave.request'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(requestBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], LeaveController.prototype, "request", null);
__decorate([
    (0, common_1.Post)(':id/decision'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('leave.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(decision))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], LeaveController.prototype, "decide", null);
__decorate([
    (0, common_1.Post)(':id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('leave.request'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], LeaveController.prototype, "cancel", null);
exports.LeaveController = LeaveController = __decorate([
    (0, swagger_1.ApiTags)('leave'),
    (0, common_1.Controller)('leave'),
    __metadata("design:paramtypes", [leave_service_1.LeaveService])
], LeaveController);
//# sourceMappingURL=leave.controller.js.map