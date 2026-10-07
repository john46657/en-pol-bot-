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
exports.LocksController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const locks_service_1 = require("./locks.service");
const typeParam = zod_1.z.enum(locks_service_1.LOCK_TYPE_KEYS);
const acquireBody = zod_1.z.object({ force: zod_1.z.boolean().optional() });
/** Rechte je Datensatzart werden im Service geprüft (Ansehen bzw. Bearbeiten des jeweiligen Moduls). */
let LocksController = class LocksController {
    locks;
    constructor(locks) {
        this.locks = locks;
    }
    status(a, type, id) { return this.locks.status(a, type, id); }
    acquire(a, type, id, b) { return this.locks.acquire(a, type, id, b.force); }
    async release(a, type, id) { await this.locks.release(a, type, id); }
};
exports.LocksController = LocksController;
__decorate([
    (0, common_1.Get)(':type/:id'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('type', (0, zod_pipe_1.zodBody)(typeParam))),
    __param(2, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], LocksController.prototype, "status", null);
__decorate([
    (0, common_1.Post)(':type/:id'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('type', (0, zod_pipe_1.zodBody)(typeParam))),
    __param(2, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(3, (0, common_1.Body)((0, zod_pipe_1.zodBody)(acquireBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, void 0]),
    __metadata("design:returntype", void 0)
], LocksController.prototype, "acquire", null);
__decorate([
    (0, common_1.Delete)(':type/:id'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('type', (0, zod_pipe_1.zodBody)(typeParam))),
    __param(2, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], LocksController.prototype, "release", null);
exports.LocksController = LocksController = __decorate([
    (0, swagger_1.ApiTags)('locks'),
    (0, common_1.Controller)('locks'),
    __metadata("design:paramtypes", [locks_service_1.LocksService])
], LocksController);
//# sourceMappingURL=locks.controller.js.map