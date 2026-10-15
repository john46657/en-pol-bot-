"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageBuilderModule = void 0;
const common_1 = require("@nestjs/common");
const message_builder_controller_1 = require("./message-builder.controller");
const message_builder_service_1 = require("./message-builder.service");
const message_builder_send_service_1 = require("./message-builder-send.service");
const webhook_client_1 = require("./webhook-client");
/** Discord Message Builder (Discohook-artiger Editor): Entwürfe, Vorlagen, Versand über den Bot, optional Webhooks, Historie. */
let MessageBuilderModule = class MessageBuilderModule {
};
exports.MessageBuilderModule = MessageBuilderModule;
exports.MessageBuilderModule = MessageBuilderModule = __decorate([
    (0, common_1.Module)({ controllers: [message_builder_controller_1.MessageBuilderController, message_builder_controller_1.BotMessageBuilderController], providers: [message_builder_service_1.MessageBuilderService, message_builder_send_service_1.MessageBuilderSendService, webhook_client_1.WebhookClient], exports: [message_builder_send_service_1.MessageBuilderSendService] })
], MessageBuilderModule);
//# sourceMappingURL=message-builder.module.js.map