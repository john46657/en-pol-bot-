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
exports.BotMessageBuilderController = exports.MessageBuilderController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const zod_1 = require("zod");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const message_builder_service_1 = require("./message-builder.service");
const message_builder_send_service_1 = require("./message-builder-send.service");
const kindQuery = zod_1.z.object({ kind: message_builder_service_1.docKind });
const sendRate = process.env.NODE_ENV === 'test' ? 10_000 : 20;
/**
 * Discord Message Builder. Alle Routen brauchen mindestens `messagebuilder.view`; Entwürfe/Vorlagen/Versand prüfen
 * im Service zusätzlich das jeweilige Recht (Entwurf vs. Vorlage, Bot vs. Webhook vs. Test).
 */
let MessageBuilderController = class MessageBuilderController {
    s;
    send;
    constructor(s, send) {
        this.s = s;
        this.send = send;
    }
    server() { return this.s.serverInfo(); }
    list(a, q) { return this.s.list(a, q.kind); }
    get(a, id) { return this.s.get(a, id); }
    create(a, b) { return this.s.create(a, b); }
    update(a, id, b) { return this.s.update(a, id, b); }
    copy(a, id, b) { return this.s.copy(a, id, b); }
    remove(a, id) { return this.s.remove(a, id); }
    categories() { return this.s.categories(); }
    createCategory(a, b) { return this.s.createCategory(a, b); }
    updateCategory(a, id, b) { return this.s.updateCategory(a, id, b); }
    removeCategory(a, id) { return this.s.removeCategory(a, id); }
    channelsConfig() { return this.s.allowedChannelIds().then((channelIds) => ({ channelIds })); }
    setChannels(a, b) { return this.s.setAllowedChannels(a, b); }
    doSend(a, u, b) { return this.send.send(a, u.displayName, b); }
    history(q) { return this.send.history(q); }
    sendStatus(a, id) { return this.send.get(a, id); }
    webhooks() { return this.send.listWebhooks(); }
    createWebhook(a, b) { return this.send.createWebhook(a, b); }
    removeWebhook(a, id) { return this.send.removeWebhook(a, id); }
};
exports.MessageBuilderController = MessageBuilderController;
__decorate([
    (0, common_1.Get)('server'),
    (0, decorators_1.RequirePermission)('messagebuilder.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MessageBuilderController.prototype, "server", null);
__decorate([
    (0, common_1.Get)('documents'),
    (0, decorators_1.RequirePermission)('messagebuilder.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(kindQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], MessageBuilderController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('documents/:id'),
    (0, decorators_1.RequirePermission)('messagebuilder.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MessageBuilderController.prototype, "get", null);
__decorate([
    (0, common_1.Post)('documents'),
    (0, decorators_1.RequirePermission)('messagebuilder.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(message_builder_service_1.createDocSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], MessageBuilderController.prototype, "create", null);
__decorate([
    (0, common_1.Put)('documents/:id'),
    (0, decorators_1.RequirePermission)('messagebuilder.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(message_builder_service_1.updateDocSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], MessageBuilderController.prototype, "update", null);
__decorate([
    (0, common_1.Post)('documents/:id/copy'),
    (0, decorators_1.RequirePermission)('messagebuilder.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(message_builder_service_1.copyDocSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], MessageBuilderController.prototype, "copy", null);
__decorate([
    (0, common_1.Delete)('documents/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('messagebuilder.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MessageBuilderController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)('categories'),
    (0, decorators_1.RequirePermission)('messagebuilder.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MessageBuilderController.prototype, "categories", null);
__decorate([
    (0, common_1.Post)('categories'),
    (0, decorators_1.RequirePermission)('messagebuilder.templates_edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(message_builder_service_1.categorySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], MessageBuilderController.prototype, "createCategory", null);
__decorate([
    (0, common_1.Put)('categories/:id'),
    (0, decorators_1.RequirePermission)('messagebuilder.templates_edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(message_builder_service_1.categorySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], MessageBuilderController.prototype, "updateCategory", null);
__decorate([
    (0, common_1.Delete)('categories/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('messagebuilder.templates_edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MessageBuilderController.prototype, "removeCategory", null);
__decorate([
    (0, common_1.Get)('channels/config'),
    (0, decorators_1.RequirePermission)('messagebuilder.channels'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MessageBuilderController.prototype, "channelsConfig", null);
__decorate([
    (0, common_1.Put)('channels/config'),
    (0, decorators_1.RequirePermission)('messagebuilder.channels'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(message_builder_service_1.channelsConfigSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], MessageBuilderController.prototype, "setChannels", null);
__decorate([
    (0, common_1.Post)('send'),
    (0, throttler_1.Throttle)({ default: { limit: sendRate, ttl: 60_000 } }),
    (0, decorators_1.RequirePermission)('messagebuilder.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, decorators_1.CurrentUser)()),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(message_builder_send_service_1.sendSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, void 0]),
    __metadata("design:returntype", void 0)
], MessageBuilderController.prototype, "doSend", null);
__decorate([
    (0, common_1.Get)('sends'),
    (0, decorators_1.RequirePermission)('messagebuilder.history'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(message_builder_send_service_1.historyQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], MessageBuilderController.prototype, "history", null);
__decorate([
    (0, common_1.Get)('sends/:id'),
    (0, decorators_1.RequirePermission)('messagebuilder.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MessageBuilderController.prototype, "sendStatus", null);
__decorate([
    (0, common_1.Get)('webhooks'),
    (0, decorators_1.RequirePermission)('messagebuilder.webhooks'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MessageBuilderController.prototype, "webhooks", null);
__decorate([
    (0, common_1.Post)('webhooks'),
    (0, decorators_1.RequirePermission)('messagebuilder.webhooks'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(message_builder_send_service_1.webhookCreateSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], MessageBuilderController.prototype, "createWebhook", null);
__decorate([
    (0, common_1.Delete)('webhooks/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('messagebuilder.webhooks'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MessageBuilderController.prototype, "removeWebhook", null);
exports.MessageBuilderController = MessageBuilderController = __decorate([
    (0, swagger_1.ApiTags)('message-builder'),
    (0, common_1.Controller)('message-builder'),
    __metadata("design:paramtypes", [message_builder_service_1.MessageBuilderService, message_builder_send_service_1.MessageBuilderSendService])
], MessageBuilderController);
/** Nur für den Bot: Versandaufträge abholen und Ergebnisse je Nachricht melden, Aktionen interaktiver Komponenten auflösen. */
let BotMessageBuilderController = class BotMessageBuilderController {
    send;
    constructor(send) {
        this.send = send;
    }
    start(id) { return this.send.start(id); }
    async item(id, position, b) { await this.send.itemResult(id, position, b); }
    async finish(id, b) { await this.send.finish(id, b); }
    interaction(b) { return this.send.interaction(b); }
};
exports.BotMessageBuilderController = BotMessageBuilderController;
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('sends/:id/start'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BotMessageBuilderController.prototype, "start", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('sends/:id/items/:position'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('position', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(message_builder_send_service_1.itemResultSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, void 0]),
    __metadata("design:returntype", Promise)
], BotMessageBuilderController.prototype, "item", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('sends/:id/finish'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(message_builder_send_service_1.finishSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0]),
    __metadata("design:returntype", Promise)
], BotMessageBuilderController.prototype, "finish", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('interactions'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(message_builder_send_service_1.interactionSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotMessageBuilderController.prototype, "interaction", null);
exports.BotMessageBuilderController = BotMessageBuilderController = __decorate([
    (0, swagger_1.ApiTags)('bot'),
    (0, common_1.Controller)('bot/message-builder'),
    __metadata("design:paramtypes", [message_builder_send_service_1.MessageBuilderSendService])
], BotMessageBuilderController);
//# sourceMappingURL=message-builder.controller.js.map