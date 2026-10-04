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
exports.RadioController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const radio_service_1 = require("./radio.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const target = zod_1.z.object({ userId: zod_1.z.string().uuid().optional(), discordId: zod_1.z.string().regex(/^\d{15,25}$/).optional() }).refine((v) => !!v.userId !== !!v.discordId, 'Provide exactly one of userId or discordId.');
let RadioController = class RadioController {
    r;
    constructor(r) {
        this.r = r;
    }
    list() { return this.r.list(); }
    check(q) { return this.r.check(q); }
    add(a, b) { return this.r.add(a, b); }
    remove(a, b) { return this.r.remove(a, b); }
};
exports.RadioController = RadioController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('team.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], RadioController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('check'),
    (0, decorators_1.RequirePermission)('team.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(target))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], RadioController.prototype, "check", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('personnel.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(target))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], RadioController.prototype, "add", null);
__decorate([
    (0, common_1.Post)('remove'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('personnel.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(target))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], RadioController.prototype, "remove", null);
exports.RadioController = RadioController = __decorate([
    (0, swagger_1.ApiTags)('radio'),
    (0, common_1.Controller)('radio-whitelist'),
    __metadata("design:paramtypes", [radio_service_1.RadioService])
], RadioController);
//# sourceMappingURL=radio.controller.js.map