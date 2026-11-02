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
exports.AnnouncementsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const announcements_service_1 = require("./announcements.service");
const listQ = zod_1.z.object({ status: zod_1.z.enum(shared_1.ANNOUNCEMENT_STATUSES).optional() });
const previewBody = announcements_service_1.announcementBody.pick({ type: true, content: true, mentionRoleIds: true });
const reasonBody = zod_1.z.object({ reason: zod_1.z.string().trim().min(3).max(500) });
/** Ankündigungen. Ansehen: announce.view · Entwürfe: announce.create · veröffentlichen/planen/zurückziehen: announce.publish · Rollen erwähnen: announce.mention. */
let AnnouncementsController = class AnnouncementsController {
    s;
    constructor(s) {
        this.s = s;
    }
    list(q) { return this.s.list(q); }
    templates() { return announcements_service_1.ANNOUNCEMENT_TEMPLATES; }
    config() { return this.s.config(); }
    saveConfig(a, b) { return this.s.saveConfig(a, b); }
    preview(b) { return this.s.preview(b); }
    get(id) { return this.s.get(id); }
    create(a, b) { return this.s.create(a, b); }
    update(a, id, b) { return this.s.update(a, id, b); }
    publish(a, id) { return this.s.publish(a, id); }
    retract(a, id, b) { return this.s.retract(a, id, b.reason); }
};
exports.AnnouncementsController = AnnouncementsController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('announce.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], AnnouncementsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('templates'),
    (0, decorators_1.RequirePermission)('announce.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnnouncementsController.prototype, "templates", null);
__decorate([
    (0, common_1.Get)('config'),
    (0, decorators_1.RequirePermission)('announce.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnnouncementsController.prototype, "config", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, decorators_1.RequirePermission)('announce.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(announcements_service_1.announceConfigSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], AnnouncementsController.prototype, "saveConfig", null);
__decorate([
    (0, common_1.Post)('preview'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('announce.view'),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(previewBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], AnnouncementsController.prototype, "preview", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('announce.view'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AnnouncementsController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('announce.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(announcements_service_1.announcementBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], AnnouncementsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, decorators_1.RequirePermission)('announce.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(announcements_service_1.announcementBody.extend({ version: zod_1.z.number().int().min(1) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AnnouncementsController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/publish'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('announce.publish'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AnnouncementsController.prototype, "publish", null);
__decorate([
    (0, common_1.Post)(':id/retract'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('announce.publish'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(reasonBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], AnnouncementsController.prototype, "retract", null);
exports.AnnouncementsController = AnnouncementsController = __decorate([
    (0, swagger_1.ApiTags)('announcements'),
    (0, common_1.Controller)('announcements'),
    __metadata("design:paramtypes", [announcements_service_1.AnnouncementsService])
], AnnouncementsController);
//# sourceMappingURL=announcements.controller.js.map