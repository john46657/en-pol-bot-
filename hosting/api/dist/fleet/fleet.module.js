"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FleetModule = void 0;
const common_1 = require("@nestjs/common");
const media_module_1 = require("../media/media.module");
const fleet_controller_1 = require("./fleet.controller");
const fleet_service_1 = require("./fleet.service");
let FleetModule = class FleetModule {
};
exports.FleetModule = FleetModule;
exports.FleetModule = FleetModule = __decorate([
    (0, common_1.Module)({ imports: [media_module_1.MediaModule], controllers: [fleet_controller_1.FleetController], providers: [fleet_service_1.FleetService], exports: [fleet_service_1.FleetService] })
], FleetModule);
//# sourceMappingURL=fleet.module.js.map