"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERLCModule = void 0;
const common_1 = require("@nestjs/common");
const erlc_client_1 = require("./erlc.client");
const erlc_controller_1 = require("./erlc.controller");
const erlc_sync_1 = require("./erlc.sync");
const erlc_webhook_1 = require("./erlc.webhook");
let ERLCModule = class ERLCModule {
};
exports.ERLCModule = ERLCModule;
exports.ERLCModule = ERLCModule = __decorate([
    (0, common_1.Module)({ controllers: [erlc_controller_1.ERLCController], providers: [{ provide: erlc_client_1.ERLC_FETCH, useValue: undefined }, erlc_client_1.ERLCClient, erlc_sync_1.ERLCSyncService, erlc_webhook_1.ERLCWebhookService], exports: [erlc_sync_1.ERLCSyncService] })
], ERLCModule);
//# sourceMappingURL=erlc.module.js.map