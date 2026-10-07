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
exports.AcademyController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const academy_service_1 = require("./academy.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const course = zod_1.z.object({ title: zod_1.z.string().trim().min(3).max(120), description: zod_1.z.string().max(2000).optional(), passScore: zod_1.z.number().int().min(1).max(100).optional(), instructorId: zod_1.z.string().uuid().optional(), announce: academy_service_1.announceSchema.optional() });
let AcademyController = class AcademyController {
    a;
    constructor(a) {
        this.a = a;
    }
    courses() { return this.a.courses(); }
    create(ac, b) { const { announce, ...d } = b; return this.a.createCourse(ac, d, announce); }
    /** Standard-Kanal und Ping-Rollen für Ankündigungen. */
    config() { return this.a.config(); }
    saveConfig(ac, b) { return this.a.saveConfig(ac, b); }
    announce(ac, id, b) { return this.a.announce(ac, id, b); }
    enroll(ac, id, b) { return this.a.enroll(ac, id, b.personnelId); }
    grade(ac, id, b) { return this.a.grade(ac, id, b.score); }
};
exports.AcademyController = AcademyController;
__decorate([
    (0, common_1.Get)('courses'),
    (0, decorators_1.RequirePermission)('academy.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AcademyController.prototype, "courses", null);
__decorate([
    (0, common_1.Post)('courses'),
    (0, decorators_1.RequirePermission)('academy.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(course))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], AcademyController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('config'),
    (0, decorators_1.RequirePermission)('academy.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AcademyController.prototype, "config", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, decorators_1.RequirePermission)('academy.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(academy_service_1.academyConfigSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AcademyController.prototype, "saveConfig", null);
__decorate([
    (0, common_1.Post)('courses/:id/announce'),
    (0, common_1.HttpCode)(202),
    (0, decorators_1.RequirePermission)('academy.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(academy_service_1.announceSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AcademyController.prototype, "announce", null);
__decorate([
    (0, common_1.Post)('courses/:id/enroll'),
    (0, decorators_1.RequirePermission)('academy.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ personnelId: zod_1.z.string().uuid() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AcademyController.prototype, "enroll", null);
__decorate([
    (0, common_1.Post)('enrollments/:id/grade'),
    (0, decorators_1.RequirePermission)('academy.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ score: zod_1.z.number().int().min(0).max(100) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AcademyController.prototype, "grade", null);
exports.AcademyController = AcademyController = __decorate([
    (0, swagger_1.ApiTags)('academy'),
    (0, common_1.Controller)('academy'),
    __metadata("design:paramtypes", [academy_service_1.AcademyService])
], AcademyController);
//# sourceMappingURL=academy.controller.js.map