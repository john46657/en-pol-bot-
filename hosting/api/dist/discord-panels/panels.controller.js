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
exports.BotPanelsController = exports.PanelsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const panels_service_1 = require("./panels.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const guild_context_1 = require("../common/guild-context");
const errors_1 = require("../common/errors");
const sf = zod_1.z.string().regex(/^\d{15,25}$/);
const mode = zod_1.z.object({ mode: zod_1.z.enum(['update', 'new']).default('update') });
const same = (a, b) => { if (a !== b)
    throw new errors_1.AppError('VALIDATION_FAILED', 'ID passt nicht.'); };
/** Discord-Nachrichten: Staff-Listen (Team) und Formular-Panels (Einstellungen). */
let PanelsController = class PanelsController {
    s;
    constructor(s) {
        this.s = s;
    }
    staff() { return this.s.staffLists((0, guild_context_1.currentGuild)()); }
    saveStaff(a, id, b) { same(id, b.id); return this.s.saveStaff(a, b); }
    removeStaff(a, id) { return this.s.removeStaff(a, id); }
    dupStaff(a, id) { return this.s.duplicateStaff(a, id); }
    preview() { return this.s.previewStaff((0, guild_context_1.currentGuild)()); }
    sendStaff(a, id, b) { return this.s.sendStaff(a, id, b.mode); }
    forms() { return this.s.formPanels((0, guild_context_1.currentGuild)()); }
    saveForm(a, id, b) { same(id, b.id); return this.s.saveForm(a, b); }
    removeForm(a, id) { return this.s.removeForm(a, id); }
    sendForm(a, id, b) { return this.s.sendForm(a, id, b.mode); }
    subs(id) { return this.s.submissions(id); }
    removeSub(a, id) { return this.s.removeSubmission(a, id); }
};
exports.PanelsController = PanelsController;
__decorate([
    (0, common_1.Get)('staff'),
    (0, decorators_1.RequirePermission)('team.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PanelsController.prototype, "staff", null);
__decorate([
    (0, common_1.Put)('staff/:id'),
    (0, decorators_1.RequirePermission)('team.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.staffListSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PanelsController.prototype, "saveStaff", null);
__decorate([
    (0, common_1.Delete)('staff/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('team.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PanelsController.prototype, "removeStaff", null);
__decorate([
    (0, common_1.Post)('staff/:id/duplicate'),
    (0, decorators_1.RequirePermission)('team.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PanelsController.prototype, "dupStaff", null);
__decorate([
    (0, common_1.Get)('staff-members'),
    (0, decorators_1.RequirePermission)('team.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PanelsController.prototype, "preview", null);
__decorate([
    (0, common_1.Post)('staff/:id/send'),
    (0, common_1.HttpCode)(202),
    (0, decorators_1.RequirePermission)('team.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(mode))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], PanelsController.prototype, "sendStaff", null);
__decorate([
    (0, common_1.Get)('forms'),
    (0, decorators_1.RequirePermission)('settings.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PanelsController.prototype, "forms", null);
__decorate([
    (0, common_1.Put)('forms/:id'),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.formPanelSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PanelsController.prototype, "saveForm", null);
__decorate([
    (0, common_1.Delete)('forms/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PanelsController.prototype, "removeForm", null);
__decorate([
    (0, common_1.Post)('forms/:id/send'),
    (0, common_1.HttpCode)(202),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(mode))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], PanelsController.prototype, "sendForm", null);
__decorate([
    (0, common_1.Get)('forms/:id/submissions'),
    (0, decorators_1.RequirePermission)('settings.view'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PanelsController.prototype, "subs", null);
__decorate([
    (0, common_1.Delete)('submissions/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PanelsController.prototype, "removeSub", null);
exports.PanelsController = PanelsController = __decorate([
    (0, swagger_1.ApiTags)('discord-panels'),
    (0, common_1.Controller)('discord-panels'),
    __metadata("design:paramtypes", [panels_service_1.PanelsService])
], PanelsController);
const submit = zod_1.z.object({ guildId: sf.nullable(), discordId: sf, userName: zod_1.z.string().min(1).max(100), avatar: zod_1.z.string().url().max(300).optional(), values: zod_1.z.record(zod_1.z.string().max(40), zod_1.z.string().max(4000)) });
let BotPanelsController = class BotPanelsController {
    s;
    constructor(s) {
        this.s = s;
    }
    staff() { return this.s.botStaffLists(); }
    form(id) { return this.s.botForm(id); }
    submit(id, b) { return this.s.botSubmit(id, b); }
    async posted(id, b) { await this.s.botSubmissionPosted(id, b.channelId, b.messageId); }
};
exports.BotPanelsController = BotPanelsController;
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)('staff'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], BotPanelsController.prototype, "staff", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)('forms/:id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BotPanelsController.prototype, "form", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('forms/:id/submit'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(submit))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0]),
    __metadata("design:returntype", void 0)
], BotPanelsController.prototype, "submit", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('submissions/:id/posted'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ channelId: sf, messageId: sf })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], BotPanelsController.prototype, "posted", null);
exports.BotPanelsController = BotPanelsController = __decorate([
    (0, swagger_1.ApiTags)('bot'),
    (0, common_1.Controller)('bot/panels'),
    __metadata("design:paramtypes", [panels_service_1.PanelsService])
], BotPanelsController);
//# sourceMappingURL=panels.controller.js.map