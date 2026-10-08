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
exports.LoggingController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const logging_service_1 = require("./logging.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
/** Administration → Logging: welche Aktionen in welchen Discord-Kanal gemeldet werden. */
let LoggingController = class LoggingController {
    s;
    constructor(s) {
        this.s = s;
    }
    get() { return this.s.get(); }
    types() { return this.s.types(); }
    save(a, b) { return this.s.save(a, b); }
    test(a, b) { return this.s.test(a, b.category); }
};
exports.LoggingController = LoggingController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('settings.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LoggingController.prototype, "get", null);
__decorate([
    (0, common_1.Get)('types'),
    (0, decorators_1.RequirePermission)('settings.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LoggingController.prototype, "types", null);
__decorate([
    (0, common_1.Put)(),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.loggingConfigSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], LoggingController.prototype, "save", null);
__decorate([
    (0, common_1.Post)('test'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ category: zod_1.z.string().max(32) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], LoggingController.prototype, "test", null);
exports.LoggingController = LoggingController = __decorate([
    (0, swagger_1.ApiTags)('logging'),
    (0, common_1.Controller)('logging'),
    __metadata("design:paramtypes", [logging_service_1.LoggingService])
], LoggingController);
//# sourceMappingURL=logging.controller.js.map