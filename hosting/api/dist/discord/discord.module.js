"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscordModule = void 0;
const common_1 = require("@nestjs/common");
const discord_controller_1 = require("./discord.controller");
const discord_service_1 = require("./discord.service");
const discord_live_service_1 = require("./discord-live.service");
const applications_module_1 = require("../applications/applications.module");
const danger_module_1 = require("../danger/danger.module");
const duty_module_1 = require("../duty/duty.module");
let DiscordModule = class DiscordModule {
};
exports.DiscordModule = DiscordModule;
exports.DiscordModule = DiscordModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({ imports: [duty_module_1.DutyModule, danger_module_1.DangerModule, applications_module_1.ApplicationsModule], controllers: [discord_controller_1.DiscordController, discord_controller_1.BotController], providers: [discord_service_1.DiscordService, discord_live_service_1.DiscordLiveService], exports: [discord_service_1.DiscordService, discord_live_service_1.DiscordLiveService] })
], DiscordModule);
//# sourceMappingURL=discord.module.js.map