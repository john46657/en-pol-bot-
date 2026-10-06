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
exports.SekController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const sek_service_1 = require("./sek.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const target = zod_1.z.object({ userId: zod_1.z.string().uuid().optional(), discordId: zod_1.z.string().regex(/^\d{15,25}$/).optional() }).refine((v) => !!v.userId !== !!v.discordId, 'Provide exactly one of userId or discordId.');
const report = zod_1.z.object({ occurredAt: zod_1.z.coerce.date().optional(), missionType: zod_1.z.string().trim().min(2).max(100), description: zod_1.z.string().trim().min(5).max(4000) });
const application = zod_1.z.object({ serviceTime: zod_1.z.string().trim().min(1).max(100), motivation: zod_1.z.string().trim().min(10).max(2000), experience: zod_1.z.string().trim().max(1000).optional() });
const decision = zod_1.z.object({ status: zod_1.z.enum(['ACCEPTED', 'REJECTED']) });
const list = zod_1.z.object({ limit: zod_1.z.coerce.number().int().min(1).max(100).default(25) });
const appList = zod_1.z.object({ status: zod_1.z.enum(['OPEN', 'ACCEPTED', 'REJECTED']).optional() });
let SekController = class SekController {
    s;
    constructor(s) {
        this.s = s;
    }
    /** Eigener Stand: Mitglied? offene Bewerbung? (für Web und Bot) */
    me(a) { return this.s.me(a.userId); }
    members() { return this.s.members(); }
    add(a, b) { return this.s.addMember(a, b); }
    remove(a, b) { return this.s.removeMember(a, b); }
    reports(q) { return this.s.reports(q.limit); }
    createReport(a, b) { return this.s.createReport(a, b); }
    /** Bewerben darf jeder Polizeibenutzer. */
    apply(a, b) { return this.s.apply(a, b); }
    applications(q) { return this.s.applications(q.status); }
    decide(a, id, b) { return this.s.decide(a, id, b.status); }
};
exports.SekController = SekController;
__decorate([
    (0, common_1.Get)('me'),
    (0, decorators_1.RequirePermission)('team.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SekController.prototype, "me", null);
__decorate([
    (0, common_1.Get)('members'),
    (0, decorators_1.RequirePermission)('sek.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SekController.prototype, "members", null);
__decorate([
    (0, common_1.Post)('members'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('sek.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(target))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], SekController.prototype, "add", null);
__decorate([
    (0, common_1.Post)('members/remove'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('sek.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(target))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], SekController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)('reports'),
    (0, decorators_1.RequirePermission)('sek.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(list))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], SekController.prototype, "reports", null);
__decorate([
    (0, common_1.Post)('reports'),
    (0, decorators_1.RequirePermission)('sek.report'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(report))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], SekController.prototype, "createReport", null);
__decorate([
    (0, common_1.Post)('applications'),
    (0, decorators_1.RequirePermission)('team.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(application))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], SekController.prototype, "apply", null);
__decorate([
    (0, common_1.Get)('applications'),
    (0, decorators_1.RequirePermission)('sek.manage'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(appList))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], SekController.prototype, "applications", null);
__decorate([
    (0, common_1.Post)('applications/:id/decision'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('sek.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(decision))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], SekController.prototype, "decide", null);
exports.SekController = SekController = __decorate([
    (0, swagger_1.ApiTags)('sek'),
    (0, common_1.Controller)('sek'),
    __metadata("design:paramtypes", [sek_service_1.SekService])
], SekController);
//# sourceMappingURL=sek.controller.js.map