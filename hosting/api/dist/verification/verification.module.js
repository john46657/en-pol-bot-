"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerificationModule = void 0;
const common_1 = require("@nestjs/common");
const persons_module_1 = require("../persons/persons.module");
const verification_controller_1 = require("./verification.controller");
const roblox_oauth_service_1 = require("./roblox-oauth.service");
const verification_service_1 = require("./verification.service");
let VerificationModule = class VerificationModule {
};
exports.VerificationModule = VerificationModule;
exports.VerificationModule = VerificationModule = __decorate([
    (0, common_1.Module)({ imports: [persons_module_1.PersonsModule], controllers: [verification_controller_1.VerificationController, verification_controller_1.BotVerificationController, verification_controller_1.RobloxOAuthController], providers: [verification_service_1.VerificationService, roblox_oauth_service_1.RobloxOAuthService], exports: [verification_service_1.VerificationService] })
], VerificationModule);
//# sourceMappingURL=verification.module.js.map