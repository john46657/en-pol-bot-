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
exports.DutyController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const duty_service_1 = require("./duty.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const hoursQuery = zod_1.z.object({ days: zod_1.z.coerce.number().int().min(1).max(90).default(7) });
const logQuery = zod_1.z.object({ days: zod_1.z.coerce.number().int().min(1).max(90).default(7), userId: zod_1.z.string().uuid().optional(), shiftType: zod_1.z.string().regex(/^[a-z0-9-]{1,40}$/).optional() });
const body = zod_1.z.object({ status: zod_1.z.enum(shared_1.DUTY_STATUSES), unitId: zod_1.z.string().uuid().optional(), callsign: zod_1.z.string().max(16).optional(), shiftType: zod_1.z.string().regex(/^[a-z0-9-]{1,40}$/).optional() });
let DutyController = class DutyController {
    d;
    constructor(d) {
        this.d = d;
    }
    team() { return this.d.team(); }
    overview() { return this.d.overview(); }
    mine(a) { return this.d.mine(a.userId); }
    /** Eigene Dienststunden. */
    myHours(a, f) { return this.d.hours(f.days, a.userId); }
    /** Dienststunden aller Beamten (Schichtleitung). */
    hours(f) { return this.d.hours(f.days); }
    /** Schicht-Logs: wer wann welche Schicht gestartet/beendet hat (Schichtleitung). */
    shiftLog(f) { return this.d.shiftLog(f); }
    /** „Bin noch im Dienst“ (Erinnerung) bzw. echte Aktivität im Dashboard/MDT. */
    active(a) { return this.d.active(a.userId); }
    set(a, b) { return this.d.setStatus(a, b.status, b); }
    /** Muss NACH `me/status` stehen, sonst würde `:userId` den Pfad `me` verschlucken. */
    setFor(a, userId, b) { return this.d.setStatus(a, b.status, b, userId); }
};
exports.DutyController = DutyController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('team.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], DutyController.prototype, "team", null);
__decorate([
    (0, common_1.Get)('overview'),
    (0, decorators_1.RequirePermission)('team.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], DutyController.prototype, "overview", null);
__decorate([
    (0, common_1.Get)('me'),
    (0, decorators_1.RequirePermission)('team.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DutyController.prototype, "mine", null);
__decorate([
    (0, common_1.Get)('me/hours'),
    (0, decorators_1.RequirePermission)('team.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(hoursQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], DutyController.prototype, "myHours", null);
__decorate([
    (0, common_1.Get)('hours'),
    (0, decorators_1.RequirePermission)('team.manage'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(hoursQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], DutyController.prototype, "hours", null);
__decorate([
    (0, common_1.Get)('shifts'),
    (0, decorators_1.RequirePermission)('team.manage'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(logQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], DutyController.prototype, "shiftLog", null);
__decorate([
    (0, common_1.Post)('me/active'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('team.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DutyController.prototype, "active", null);
__decorate([
    (0, common_1.Put)('me/status'),
    (0, decorators_1.RequirePermission)('team.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(body))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], DutyController.prototype, "set", null);
__decorate([
    (0, common_1.Put)(':userId/status'),
    (0, decorators_1.RequirePermission)('team.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(body))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], DutyController.prototype, "setFor", null);
exports.DutyController = DutyController = __decorate([
    (0, swagger_1.ApiTags)('team'),
    (0, common_1.Controller)('team'),
    __metadata("design:paramtypes", [duty_service_1.DutyService])
], DutyController);
//# sourceMappingURL=duty.controller.js.map