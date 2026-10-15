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
exports.WantedHitsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const pagination_1 = require("../common/pagination");
const guild_context_1 = require("../common/guild-context");
const wanted_match_service_1 = require("./wanted-match.service");
const listQ = pagination_1.pageQuery.extend({ status: zod_1.z.enum(wanted_match_service_1.HIT_REVIEW_STATUSES).optional(), matchType: zod_1.z.enum(wanted_match_service_1.MATCH_TYPES).optional(), wantedId: zod_1.z.string().uuid().optional() });
const review = zod_1.z.object({ decision: zod_1.z.enum(['VERIFIED', 'DISMISSED']), note: zod_1.z.string().trim().min(3).max(1000), storeRobloxId: zod_1.z.boolean().optional() });
const settings = wanted_match_service_1.matchSettingsSchema.partial().strict();
/** ER:LC-Fahndungstreffer (automatischer Abgleich). Alle Rechte werden serverseitig geprüft. */
let WantedHitsController = class WantedHitsController {
    m;
    constructor(m) {
        this.m = m;
    }
    list(q) { return this.m.list(q, q); }
    summary() { return this.m.summary((0, guild_context_1.currentGuild)()); }
    getSettings() { return this.m.settings(); }
    putSettings(a, b) { return this.m.saveSettings(a, b); }
    get(id) { return this.m.get(id); }
    review(a, id, b) { return this.m.review(a, id, b); }
};
exports.WantedHitsController = WantedHitsController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('wanted.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], WantedHitsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('summary'),
    (0, decorators_1.RequirePermission)('wanted.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], WantedHitsController.prototype, "summary", null);
__decorate([
    (0, common_1.Get)('settings'),
    (0, decorators_1.RequirePermission)('wanted.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], WantedHitsController.prototype, "getSettings", null);
__decorate([
    (0, common_1.Put)('settings'),
    (0, decorators_1.RequirePermission)('wanted.manage_matching'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(settings))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], WantedHitsController.prototype, "putSettings", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('wanted.view'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WantedHitsController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(':id/review'),
    (0, decorators_1.RequirePermission)('wanted.review_hits'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(review))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], WantedHitsController.prototype, "review", null);
exports.WantedHitsController = WantedHitsController = __decorate([
    (0, swagger_1.ApiTags)('wanted'),
    (0, common_1.Controller)('wanted-hits'),
    __metadata("design:paramtypes", [wanted_match_service_1.WantedMatchService])
], WantedHitsController);
//# sourceMappingURL=wanted-hits.controller.js.map