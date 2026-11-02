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
exports.ShiftPlanController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const shiftplan_service_1 = require("./shiftplan.service");
const listQ = zod_1.z.object({ from: zod_1.z.coerce.date().optional(), to: zod_1.z.coerce.date().optional(), department: zod_1.z.string().max(64).optional(), status: zod_1.z.enum(shared_1.PLANNED_SHIFT_STATUSES).optional(), mine: zod_1.z.enum(['true', 'false']).optional() });
const updateBody = shiftplan_service_1.shiftInput.extend({ version: zod_1.z.number().int().min(1) });
const reasonBody = zod_1.z.object({ reason: zod_1.z.string().trim().min(3).max(500) });
const optReason = zod_1.z.object({ reason: zod_1.z.string().trim().max(500).optional() });
const copyBody = zod_1.z.object({ startsAt: zod_1.z.coerce.date() });
const assignBody = zod_1.z.object({ userIds: zod_1.z.array(zod_1.z.string().uuid()).min(1).max(50) });
const unassignBody = zod_1.z.object({ userId: zod_1.z.string().uuid(), reason: zod_1.z.string().trim().max(500).optional() });
const reportBody = zod_1.z.object({ message: zod_1.z.string().trim().min(3).max(1000) });
const daysQ = zod_1.z.object({ days: zod_1.z.coerce.number().int().min(1).max(60).default(14) });
/** Schichtplanung. Ansehen: shiftplan.view · selbst an-/abmelden: shiftplan.signup · planen: shiftplan.manage. */
let ShiftPlanController = class ShiftPlanController {
    s;
    constructor(s) {
        this.s = s;
    }
    list(a, q) { return this.s.list(a, { ...q, mine: q.mine === 'true' }); }
    config() { return this.s.config(); }
    saveConfig(a, b) { return this.s.saveConfig(a, b); }
    mine(a, q) { return this.s.mine(a, q.days); }
    /** MDT: aktuelle/nächste eigene Schicht */
    current(a) { return this.s.current(a); }
    /** Leitstelle: geplante vs. tatsächliche Besetzung */
    staffing(a) { return this.s.staffing(a); }
    /** Personen für Zuweisung/Leitung (nur für die Planung) */
    people() { return this.s.people(); }
    async export(a, q, res) {
        const csv = await this.s.exportCsv(a, q);
        res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="schichtplan.csv"' }).send(`﻿${csv}`);
    }
    get(a, id) { return this.s.get(a, id); }
    create(a, b) { return this.s.create(a, b); }
    update(a, id, b) { return this.s.update(a, id, b); }
    publish(a, id) { return this.s.publish(a, id); }
    cancel(a, id, b) { return this.s.cancel(a, id, b.reason); }
    copy(a, id, b) { return this.s.copy(a, id, b.startsAt); }
    remove(a, id) { return this.s.remove(a, id); }
    assign(a, id, b) { return this.s.assign(a, id, b.userIds); }
    unassign(a, id, b) { return this.s.leave(a, id, b.userId, b.reason); }
    signup(a, id) { return this.s.signup(a, id); }
    withdraw(a, id, b) { return this.s.leave(a, id, a.userId, b.reason); }
    report(a, id, b) { return this.s.report(a, id, b.message); }
};
exports.ShiftPlanController = ShiftPlanController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('shiftplan.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], ShiftPlanController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('config'),
    (0, decorators_1.RequirePermission)('shiftplan.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ShiftPlanController.prototype, "config", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, decorators_1.RequirePermission)('shiftplan.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shiftplan_service_1.shiftplanConfigSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ShiftPlanController.prototype, "saveConfig", null);
__decorate([
    (0, common_1.Get)('mine'),
    (0, decorators_1.RequirePermission)('shiftplan.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(daysQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], ShiftPlanController.prototype, "mine", null);
__decorate([
    (0, common_1.Get)('current'),
    (0, decorators_1.RequirePermission)('shiftplan.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ShiftPlanController.prototype, "current", null);
__decorate([
    (0, common_1.Get)('staffing'),
    (0, decorators_1.RequirePermission)('shiftplan.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ShiftPlanController.prototype, "staffing", null);
__decorate([
    (0, common_1.Get)('people'),
    (0, decorators_1.RequirePermission)('shiftplan.manage'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ShiftPlanController.prototype, "people", null);
__decorate([
    (0, common_1.Get)('export'),
    (0, decorators_1.RequirePermission)('shiftplan.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0, Object]),
    __metadata("design:returntype", Promise)
], ShiftPlanController.prototype, "export", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('shiftplan.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ShiftPlanController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('shiftplan.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shiftplan_service_1.createShiftBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], ShiftPlanController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, decorators_1.RequirePermission)('shiftplan.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(updateBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ShiftPlanController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/publish'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('shiftplan.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ShiftPlanController.prototype, "publish", null);
__decorate([
    (0, common_1.Post)(':id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('shiftplan.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(reasonBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ShiftPlanController.prototype, "cancel", null);
__decorate([
    (0, common_1.Post)(':id/copy'),
    (0, decorators_1.RequirePermission)('shiftplan.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(copyBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ShiftPlanController.prototype, "copy", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, decorators_1.RequirePermission)('shiftplan.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ShiftPlanController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/assign'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('shiftplan.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(assignBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ShiftPlanController.prototype, "assign", null);
__decorate([
    (0, common_1.Post)(':id/unassign'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('shiftplan.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(unassignBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ShiftPlanController.prototype, "unassign", null);
__decorate([
    (0, common_1.Post)(':id/signup'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('shiftplan.signup'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ShiftPlanController.prototype, "signup", null);
__decorate([
    (0, common_1.Post)(':id/withdraw'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('shiftplan.signup'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(optReason))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ShiftPlanController.prototype, "withdraw", null);
__decorate([
    (0, common_1.Post)(':id/report'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('shiftplan.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(reportBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ShiftPlanController.prototype, "report", null);
exports.ShiftPlanController = ShiftPlanController = __decorate([
    (0, swagger_1.ApiTags)('shiftplan'),
    (0, common_1.Controller)('shiftplan'),
    __metadata("design:paramtypes", [shiftplan_service_1.ShiftPlanService])
], ShiftPlanController);
//# sourceMappingURL=shiftplan.controller.js.map