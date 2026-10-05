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
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudioController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const studio_service_1 = require("./studio.service");
/** Für alle angemeldeten Benutzer lesbar (Branding, Theme, Feld-Definitionen); enthält keine sensiblen Daten. Änderungen laufen über PUT /admin/settings/:key. */
let StudioController = class StudioController {
    s;
    constructor(s) {
        this.s = s;
    }
    config() { return this.s.config(); }
};
exports.StudioController = StudioController;
__decorate([
    (0, common_1.Get)('config'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], StudioController.prototype, "config", null);
exports.StudioController = StudioController = __decorate([
    (0, swagger_1.ApiTags)('studio'),
    (0, common_1.Controller)('studio'),
    __metadata("design:paramtypes", [studio_service_1.StudioService])
], StudioController);
//# sourceMappingURL=studio.controller.js.map