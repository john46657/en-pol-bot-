"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QualificationsModule = void 0;
const common_1 = require("@nestjs/common");
const persons_module_1 = require("../persons/persons.module");
const qualifications_controller_1 = require("./qualifications.controller");
const qualifications_service_1 = require("./qualifications.service");
let QualificationsModule = class QualificationsModule {
};
exports.QualificationsModule = QualificationsModule;
exports.QualificationsModule = QualificationsModule = __decorate([
    (0, common_1.Module)({ imports: [persons_module_1.PersonsModule], controllers: [qualifications_controller_1.QualificationsController, qualifications_controller_1.BotQualificationsController], providers: [qualifications_service_1.QualificationsService], exports: [qualifications_service_1.QualificationsService] })
], QualificationsModule);
//# sourceMappingURL=qualifications.module.js.map