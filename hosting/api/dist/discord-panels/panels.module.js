"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PanelsModule = void 0;
const common_1 = require("@nestjs/common");
const panels_controller_1 = require("./panels.controller");
const panels_service_1 = require("./panels.service");
let PanelsModule = class PanelsModule {
};
exports.PanelsModule = PanelsModule;
exports.PanelsModule = PanelsModule = __decorate([
    (0, common_1.Module)({ controllers: [panels_controller_1.PanelsController, panels_controller_1.BotPanelsController], providers: [panels_service_1.PanelsService], exports: [panels_service_1.PanelsService] })
], PanelsModule);
//# sourceMappingURL=panels.module.js.map