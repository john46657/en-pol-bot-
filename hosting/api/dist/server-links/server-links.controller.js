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
exports.ServerLinksController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const server_links_service_1 = require("./server-links.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
/** Administration → Server-Verbund. */
let ServerLinksController = class ServerLinksController {
    s;
    constructor(s) {
        this.s = s;
    }
    get() { return this.s.overview(); }
    save(a, b) { return this.s.save(a, b); }
    move(a, b) { return this.s.moveShared(a, b.guildId); }
};
exports.ServerLinksController = ServerLinksController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('settings.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ServerLinksController.prototype, "get", null);
__decorate([
    (0, common_1.Put)(),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(server_links_service_1.linksSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ServerLinksController.prototype, "save", null);
__decorate([
    (0, common_1.Post)('move-shared'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ guildId: zod_1.z.string().regex(/^\d{15,25}$/) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ServerLinksController.prototype, "move", null);
exports.ServerLinksController = ServerLinksController = __decorate([
    (0, swagger_1.ApiTags)('server-links'),
    (0, common_1.Controller)('server-links'),
    __metadata("design:paramtypes", [server_links_service_1.ServerLinksService])
], ServerLinksController);
//# sourceMappingURL=server-links.controller.js.map