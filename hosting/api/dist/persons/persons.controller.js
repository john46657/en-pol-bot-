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
exports.PersonsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const persons_service_1 = require("./persons.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const pagination_1 = require("../common/pagination");
const create = zod_1.z.object({ robloxUsername: zod_1.z.string().trim().min(1).max(64), robloxUserId: zod_1.z.string().nullish(), aliases: zod_1.z.array(zod_1.z.string().max(64)).max(20).optional(), notes: zod_1.z.string().max(5000).optional(), custom: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional() });
const update = zod_1.z.object({ version: zod_1.z.number().int(), robloxUsername: zod_1.z.string().trim().min(1).max(64).optional(), aliases: zod_1.z.array(zod_1.z.string().max(64)).max(20).optional(), notes: zod_1.z.string().max(5000).nullable().optional(), custom: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional() });
const merge = zod_1.z.object({ targetId: zod_1.z.string().uuid(), confirm: zod_1.z.literal(true), reason: zod_1.z.string().trim().min(3).max(500) });
const archive = zod_1.z.object({ reason: zod_1.z.string().trim().min(3).max(500) });
let PersonsController = class PersonsController {
    persons;
    constructor(persons) {
        this.persons = persons;
    }
    list(q) { return this.persons.list(q); }
    get(id) { return this.persons.overview(id); }
    create(a, b) { return this.persons.create(a, b); }
    update(a, id, b) {
        const { version, ...rest } = b;
        return this.persons.update(a, id, version, rest);
    }
    archive(a, id, b) { return this.persons.archive(a, id, b.reason); }
    merge(a, id, b) { return this.persons.merge(a, id, b.targetId, b.reason); }
};
exports.PersonsController = PersonsController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('persons.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(pagination_1.pageQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], PersonsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('persons.view'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PersonsController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('persons.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(create))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], PersonsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, decorators_1.RequirePermission)('persons.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(update))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], PersonsController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/archive'),
    (0, decorators_1.RequirePermission)('persons.archive'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(archive))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], PersonsController.prototype, "archive", null);
__decorate([
    (0, common_1.Post)(':id/merge'),
    (0, decorators_1.RequirePermission)('persons.merge'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(merge))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], PersonsController.prototype, "merge", null);
exports.PersonsController = PersonsController = __decorate([
    (0, swagger_1.ApiTags)('persons'),
    (0, common_1.Controller)('persons'),
    __metadata("design:paramtypes", [persons_service_1.PersonsService])
], PersonsController);
//# sourceMappingURL=persons.controller.js.map