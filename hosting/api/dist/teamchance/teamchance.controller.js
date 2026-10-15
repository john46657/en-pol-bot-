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
exports.TeamChanceController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const teamchance_service_1 = require("./teamchance.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const guildQ = zod_1.z.object({ guildId: zod_1.z.string().regex(/^\d{15,25}$/).optional() });
/** Öffentliche Felder (Bewerbungsseite, Discord) – keine Channel-/Rollen-IDs. */
const publicView = (s) => ({ isOpen: s.isOpen, reason: s.reason, title: s.title, description: s.description, opensAt: s.opensAt, closesAt: s.closesAt, remaining: s.remaining, restrictApplications: s.restrictApplications });
let TeamChanceController = class TeamChanceController {
    s;
    constructor(s) {
        this.s = s;
    }
    get() { return this.s.status(); }
    save(a, b) { return this.s.save(a, b); }
    async pub(q) { return publicView(await this.s.status(q.guildId ?? null)); }
    async bot(q) { return publicView(await this.s.status(q.guildId ?? null)); }
};
exports.TeamChanceController = TeamChanceController;
__decorate([
    (0, common_1.Get)('teamchance'),
    (0, decorators_1.RequirePermission)('teamchance.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TeamChanceController.prototype, "get", null);
__decorate([
    (0, common_1.Put)('teamchance'),
    (0, decorators_1.RequirePermission)('teamchance.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(teamchance_service_1.teamChanceSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], TeamChanceController.prototype, "save", null);
__decorate([
    (0, decorators_1.Public)(),
    (0, common_1.Get)('teamchance/public'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", Promise)
], TeamChanceController.prototype, "pub", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)('bot/teamchance'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", Promise)
], TeamChanceController.prototype, "bot", null);
exports.TeamChanceController = TeamChanceController = __decorate([
    (0, swagger_1.ApiTags)('teamchance'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [teamchance_service_1.TeamChanceService])
], TeamChanceController);
//# sourceMappingURL=teamchance.controller.js.map