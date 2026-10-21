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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForecastController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const forecast_service_1 = require("./forecast.service");
const q = zod_1.z.object({ weeks: zod_1.z.coerce.number().int().min(2).max(52).default(8), minStaff: zod_1.z.coerce.number().min(0.5).max(50).default(2), department: zod_1.z.string().trim().max(64).optional() });
let ForecastController = class ForecastController {
    s;
    constructor(s) {
        this.s = s;
    }
    get(a, query) { return this.s.forecast(a, query); }
};
exports.ForecastController = ForecastController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('forecast.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(q))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], ForecastController.prototype, "get", null);
exports.ForecastController = ForecastController = __decorate([
    (0, swagger_1.ApiTags)('forecast'),
    (0, common_1.Controller)('forecast'),
    __metadata("design:paramtypes", [forecast_service_1.ForecastService])
], ForecastController);
//# sourceMappingURL=forecast.controller.js.map