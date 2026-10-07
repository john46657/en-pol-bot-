"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocksModule = void 0;
const common_1 = require("@nestjs/common");
const locks_controller_1 = require("./locks.controller");
const locks_service_1 = require("./locks.service");
let LocksModule = class LocksModule {
};
exports.LocksModule = LocksModule;
exports.LocksModule = LocksModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({ controllers: [locks_controller_1.LocksController], providers: [locks_service_1.LocksService], exports: [locks_service_1.LocksService] })
], LocksModule);
//# sourceMappingURL=locks.module.js.map