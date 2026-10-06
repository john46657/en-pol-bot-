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
exports.RosterController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const zod_1 = require("zod");
const roster_service_1 = require("./roster.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const key = zod_1.z.string().regex(/^(discord:)?[0-9a-zA-Z-]{15,40}$/);
const limitQ = zod_1.z.object({ limit: zod_1.z.coerce.number().int().min(1).max(100).default(30) });
let RosterController = class RosterController {
    r;
    constructor(r) {
        this.r = r;
    }
    /** Teamliste (ohne Voice-Daten). Die Oberfläche lädt sie mindestens alle 60 Sekunden neu. */
    roster() { return this.r.roster(); }
    /** „Jetzt aktualisieren“: Bot meldet sofort neu; Antwort ist der aktuelle Stand. */
    async refresh() { await this.r.requestSync(); return this.r.roster(); }
    profile(a, k) { return this.r.profile(a.userId, k); }
    structure() { return this.r.structure(); }
    activity(q) { return this.r.activity(q.limit); }
    /** Aktive Voice-Channels – eigener Bereich mit eigenem Sichtbarkeitsrecht. */
    voice() { return this.r.voice(); }
};
exports.RosterController = RosterController;
__decorate([
    (0, common_1.Get)('roster'),
    (0, decorators_1.RequirePermission)('team.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], RosterController.prototype, "roster", null);
__decorate([
    (0, common_1.Post)('roster/refresh'),
    (0, common_1.HttpCode)(200),
    (0, throttler_1.Throttle)({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 12, ttl: 60_000 } }),
    (0, decorators_1.RequirePermission)('team.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RosterController.prototype, "refresh", null);
__decorate([
    (0, common_1.Get)('roster/:key'),
    (0, decorators_1.RequirePermission)('team.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('key', (0, zod_pipe_1.zodBody)(key))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], RosterController.prototype, "profile", null);
__decorate([
    (0, common_1.Get)('structure'),
    (0, decorators_1.RequirePermission)('team.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], RosterController.prototype, "structure", null);
__decorate([
    (0, common_1.Get)('activity'),
    (0, decorators_1.RequirePermission)('team.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(limitQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], RosterController.prototype, "activity", null);
__decorate([
    (0, common_1.Get)('voice'),
    (0, decorators_1.RequirePermission)('team.view', 'dashboard.voice.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], RosterController.prototype, "voice", null);
exports.RosterController = RosterController = __decorate([
    (0, swagger_1.ApiTags)('team'),
    (0, common_1.Controller)('team'),
    __metadata("design:paramtypes", [roster_service_1.RosterService])
], RosterController);
//# sourceMappingURL=roster.controller.js.map