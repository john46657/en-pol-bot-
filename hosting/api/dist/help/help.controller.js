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
exports.HelpController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const help_service_1 = require("./help.service");
const listQ = zod_1.z.object({ q: zod_1.z.string().trim().max(100).optional(), categoryId: zod_1.z.string().uuid().optional(), kind: zod_1.z.enum(shared_1.HELP_ARTICLE_KINDS).optional(), status: zod_1.z.enum(shared_1.HELP_ARTICLE_STATUSES).optional(), page: zod_1.z.coerce.number().int().min(1).max(1000).optional() });
const articleBody = shared_1.helpArticleSchema.and(zod_1.z.object({ version: zod_1.z.number().int().optional() }));
/** Hilfe-Center (Dashboard + Bot `/hilfe`). */
let HelpController = class HelpController {
    s;
    constructor(s) {
        this.s = s;
    }
    categories() { return this.s.categories(); }
    createCategory(a, b) { return this.s.saveCategory(a, b); }
    saveCategory(a, id, b) { return this.s.saveCategory(a, b, id); }
    list(a, q) { return this.s.list(a, q); }
    get(a, id) { return this.s.get(a, id); }
    create(a, b) { return this.s.save(a, b); }
    save(a, id, b) { return this.s.save(a, b, id); }
    revisions(id) { return this.s.revisions(id); }
};
exports.HelpController = HelpController;
__decorate([
    (0, common_1.Get)('categories'),
    (0, decorators_1.RequirePermission)('help.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HelpController.prototype, "categories", null);
__decorate([
    (0, common_1.Post)('categories'),
    (0, decorators_1.RequirePermission)('help.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.helpCategorySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], HelpController.prototype, "createCategory", null);
__decorate([
    (0, common_1.Put)('categories/:id'),
    (0, decorators_1.RequirePermission)('help.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.helpCategorySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], HelpController.prototype, "saveCategory", null);
__decorate([
    (0, common_1.Get)('articles'),
    (0, decorators_1.RequirePermission)('help.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], HelpController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('articles/:idOrSlug'),
    (0, decorators_1.RequirePermission)('help.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('idOrSlug', (0, zod_pipe_1.zodBody)(zod_1.z.string().regex(/^[0-9a-z-]{1,80}$/i)))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], HelpController.prototype, "get", null);
__decorate([
    (0, common_1.Post)('articles'),
    (0, decorators_1.RequirePermission)('help.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(articleBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], HelpController.prototype, "create", null);
__decorate([
    (0, common_1.Put)('articles/:id'),
    (0, decorators_1.RequirePermission)('help.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(articleBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], HelpController.prototype, "save", null);
__decorate([
    (0, common_1.Get)('articles/:id/revisions'),
    (0, decorators_1.RequirePermission)('help.manage'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], HelpController.prototype, "revisions", null);
exports.HelpController = HelpController = __decorate([
    (0, swagger_1.ApiTags)('help'),
    (0, common_1.Controller)('help'),
    __metadata("design:paramtypes", [help_service_1.HelpService])
], HelpController);
//# sourceMappingURL=help.controller.js.map