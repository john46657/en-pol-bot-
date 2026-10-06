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
exports.ApplicationsController = void 0;
const guild_context_1 = require("../common/guild-context");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const applications_service_1 = require("./applications.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const pagination_1 = require("../common/pagination");
const submit = zod_1.z.object({ robloxUsername: zod_1.z.string().trim().min(1).max(64), robloxUserId: zod_1.z.string().max(20).optional(), answers: zod_1.z.record(zod_1.z.string(), zod_1.z.union([zod_1.z.string().max(5000), zod_1.z.array(zod_1.z.string().max(100)).max(25)])) });
const move = zod_1.z.object({ status: zod_1.z.enum(shared_1.APPLICATION_STATUSES).refine((s) => s !== 'ACCEPTED' && s !== 'REJECTED', 'Use the decide endpoint.'), reason: zod_1.z.string().trim().min(3).max(1000).optional() });
/** `OPEN` = alle noch nicht entschiedenen (eingereicht, Prüfung, Gespräch, Entscheidung offen). */
const listQ = pagination_1.pageQuery.extend({ status: zod_1.z.union([zod_1.z.enum(shared_1.APPLICATION_STATUSES), zod_1.z.literal('OPEN')]).optional(), guildId: zod_1.z.string().regex(/^\d{15,25}$/).optional() });
const guildQ = zod_1.z.object({ guildId: zod_1.z.string().regex(/^\d{15,25}$/).optional() });
let ApplicationsController = class ApplicationsController {
    a;
    constructor(a) {
        this.a = a;
    }
    /** `?guildId=` – Formular eines Servers (für den Bot); ohne: das gemeinsame (Web-Seite /apply). */
    form(q) { return this.a.form(q.guildId); }
    submit(b) { return this.a.submit(b); }
    list(q) { return this.a.list(q, q.status, q.guildId ?? (0, guild_context_1.currentGuild)() ?? undefined); } // Server getrennt: gewählter Server
    history(q) { return this.a.history(q.discordId); }
    get(id) { return this.a.get(id); }
    /** Prüfschritte benötigen applications.review; Entscheidungen applications.decide. */
    move(a, id, b) {
        return this.a.transition(a, id, b.status, b.reason);
    }
    decide(a, id, b) {
        return this.a.transition(a, id, b.accept ? 'ACCEPTED' : 'REJECTED', b.reason);
    }
    /** Annehmen/Ablehnen per Discord-Button (aus jedem offenen Status); optionaler Grund geht per DM an die Person. */
    discordDecide(a, id, b) {
        return this.a.discordDecide(a, id, b.status, b.reason);
    }
};
exports.ApplicationsController = ApplicationsController;
__decorate([
    (0, decorators_1.Public)(),
    (0, common_1.Get)('form'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "form", null);
__decorate([
    (0, decorators_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 5, ttl: 3_600_000 } }),
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(submit))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "submit", null);
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('applications.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('history'),
    (0, decorators_1.RequirePermission)('applications.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ discordId: zod_1.z.string().regex(/^\d{15,25}$/) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "history", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('applications.view'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "get", null);
__decorate([
    (0, common_1.Put)(':id/status'),
    (0, decorators_1.RequirePermission)('applications.review'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(move))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "move", null);
__decorate([
    (0, common_1.Post)(':id/decide'),
    (0, decorators_1.RequirePermission)('applications.decide'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ accept: zod_1.z.boolean(), reason: zod_1.z.string().trim().min(3).max(1000) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "decide", null);
__decorate([
    (0, common_1.Post)(':id/discord-decision'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('applications.decide'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ status: zod_1.z.enum(['ACCEPTED', 'REJECTED']), reason: zod_1.z.string().trim().max(1000).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "discordDecide", null);
exports.ApplicationsController = ApplicationsController = __decorate([
    (0, swagger_1.ApiTags)('applications'),
    (0, common_1.Controller)('applications'),
    __metadata("design:paramtypes", [applications_service_1.ApplicationsService])
], ApplicationsController);
//# sourceMappingURL=applications.controller.js.map