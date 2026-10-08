"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApplicationBansModule = void 0;
const common_1 = require("@nestjs/common");
const persons_module_1 = require("../persons/persons.module");
const application_bans_controller_1 = require("./application-bans.controller");
const application_bans_service_1 = require("./application-bans.service");
/** Bewerbungssperren – global, damit Polizei-Bewerbung und Qualifikationen beim Absenden prüfen können. */
let ApplicationBansModule = class ApplicationBansModule {
};
exports.ApplicationBansModule = ApplicationBansModule;
exports.ApplicationBansModule = ApplicationBansModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({ imports: [persons_module_1.PersonsModule], controllers: [application_bans_controller_1.ApplicationBansController, application_bans_controller_1.BotApplicationBansController], providers: [application_bans_service_1.ApplicationBansService], exports: [application_bans_service_1.ApplicationBansService] })
], ApplicationBansModule);
//# sourceMappingURL=application-bans.module.js.map