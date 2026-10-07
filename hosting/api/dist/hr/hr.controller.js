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
exports.ServiceNumbersController = exports.HrCommsController = exports.HrTrainingController = exports.HrRequestsController = exports.HrController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const hr_core_service_1 = require("./hr-core.service");
const hr_people_service_1 = require("./hr-people.service");
const hr_requests_service_1 = require("./hr-requests.service");
const hr_training_service_1 = require("./hr-training.service");
const hr_comms_service_1 = require("./hr-comms.service");
const service_numbers_service_1 = require("./service-numbers.service");
const uuid = zod_1.z.string().uuid();
const date = zod_1.z.string().date();
const reason = zod_1.z.object({ reason: zod_1.z.string().trim().max(1000).optional() });
// ───────────── Personal ─────────────
const overviewQ = zod_1.z.object({ q: zod_1.z.string().max(80).optional(), status: zod_1.z.string().max(32).optional(), rank: zod_1.z.string().max(64).optional(), department: zod_1.z.string().max(64).optional(), state: zod_1.z.enum(['active', 'inactive', 'absent']).optional() });
const createP = zod_1.z.object({ userId: uuid.optional(), discordId: zod_1.z.string().regex(/^\d{15,25}$/).optional(), name: zod_1.z.string().max(64).optional(), rank: zod_1.z.string().max(64).nullable().optional(), department: zod_1.z.string().max(64).nullable().optional(), status: zod_1.z.string().max(32).optional(), joinDate: date.optional(), callsign: zod_1.z.string().max(16).nullable().optional() });
const updateP = zod_1.z.object({ department: zod_1.z.string().max(64).nullable().optional(), office: zod_1.z.string().max(64).nullable().optional(), status: zod_1.z.string().max(32).optional(), joinDate: date.optional(), callsign: zod_1.z.string().max(16).nullable().optional(), rank: zod_1.z.string().max(64).nullable().optional(), rankSince: date.optional() });
const record = zod_1.z.object({ type: zod_1.z.enum(hr_people_service_1.RECORD_TYPES), summary: zod_1.z.string().trim().min(2).max(300), details: zod_1.z.string().max(5000).optional(), category: zod_1.z.string().max(60).optional(), severity: zod_1.z.string().max(32).optional(), expiresAt: zod_1.z.string().datetime({ offset: true }).nullable().optional(), awardId: uuid.optional(), attachments: zod_1.z.array(uuid).max(10).optional() });
const editRecord = zod_1.z.object({ summary: zod_1.z.string().trim().min(2).max(300).optional(), details: zod_1.z.string().max(5000).nullable().optional(), status: zod_1.z.enum(['ACTIVE', 'REVOKED']).optional(), expiresAt: zod_1.z.string().datetime({ offset: true }).nullable().optional(), category: zod_1.z.string().max(60).optional() });
let HrController = class HrController {
    core;
    people;
    constructor(core, people) {
        this.core = core;
        this.people = people;
    }
    config() { return this.core.config(); }
    /** Abwesenheitsarten für den Abmeldeantrag (alle im Dashboard). */
    async absenceTypes() { return (await this.core.config()).absenceTypes; }
    saveConfig(a, b) { return this.core.saveConfig(a, b); }
    overview(a, q) { return this.people.overview(a, q); }
    create(a, b) { return this.people.create(a, b); }
    profile(a, id) { return this.people.profile(a, id); }
    update(a, id, b) { return this.people.update(a, id, b); }
    remove(a, id) { return this.people.remove(a, id); }
    addRecord(a, id, b) { return this.people.addRecord(a, id, b); }
    editRecord(a, id, b) { return this.people.editRecord(a, id, b); }
    deleteRecord(a, id, b) { return this.people.deleteRecord(a, id, b.reason); }
    check(a, id, req, b) { return this.people.setCheck(a, id, req, b.value); }
    // Ränge
    ranks() { return this.core.ranks(); }
    createRank(a, b) { return this.core.saveRank(a, b); }
    order(a, b) { return this.core.reorderRanks(a, b.ids); }
    saveRank(a, id, b) { return this.core.saveRank(a, b, id); }
    deleteRank(a, id) { return this.core.deleteRank(a, id); }
};
exports.HrController = HrController;
__decorate([
    (0, common_1.Get)('config'),
    (0, decorators_1.RequirePermission)('personnel.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HrController.prototype, "config", null);
__decorate([
    (0, common_1.Get)('absence-types'),
    (0, decorators_1.RequirePermission)('dashboard.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HrController.prototype, "absenceTypes", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, decorators_1.RequirePermission)('promotion.manage_settings'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.hrConfigSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "saveConfig", null);
__decorate([
    (0, common_1.Get)('people'),
    (0, decorators_1.RequirePermission)('personnel.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(overviewQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "overview", null);
__decorate([
    (0, common_1.Post)('people'),
    (0, decorators_1.RequirePermission)('personnel.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(createP))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('people/:id'),
    (0, decorators_1.RequirePermission)('personnel.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "profile", null);
__decorate([
    (0, common_1.Patch)('people/:id'),
    (0, decorators_1.RequirePermission)('personnel.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(updateP))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)('people/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('personnel.delete'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('people/:id/records'),
    (0, decorators_1.RequirePermission)('personnel.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(record))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "addRecord", null);
__decorate([
    (0, common_1.Patch)('records/:id'),
    (0, decorators_1.RequirePermission)('personnel.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(editRecord))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "editRecord", null);
__decorate([
    (0, common_1.Delete)('records/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('personnel.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(reason))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "deleteRecord", null);
__decorate([
    (0, common_1.Put)('people/:id/checks/:req'),
    (0, decorators_1.RequirePermission)('promotion.manage_requirements'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('req', common_1.ParseUUIDPipe)),
    __param(3, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ value: zod_1.z.boolean() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "check", null);
__decorate([
    (0, common_1.Get)('ranks'),
    (0, decorators_1.RequirePermission)('personnel.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HrController.prototype, "ranks", null);
__decorate([
    (0, common_1.Post)('ranks'),
    (0, decorators_1.RequirePermission)('promotion.manage_ranks'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.rankSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "createRank", null);
__decorate([
    (0, common_1.Put)('ranks/order'),
    (0, decorators_1.RequirePermission)('promotion.manage_ranks'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ ids: zod_1.z.array(uuid).max(200) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "order", null);
__decorate([
    (0, common_1.Put)('ranks/:id'),
    (0, decorators_1.RequirePermission)('promotion.manage_ranks'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.rankSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "saveRank", null);
__decorate([
    (0, common_1.Delete)('ranks/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('promotion.manage_ranks'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "deleteRank", null);
exports.HrController = HrController = __decorate([
    (0, swagger_1.ApiTags)('hr'),
    (0, common_1.Controller)('hr'),
    __metadata("design:paramtypes", [hr_core_service_1.HrCoreService, hr_people_service_1.HrPeopleService])
], HrController);
// ───────────── Beförderungen & Versetzungen ─────────────
const kind = zod_1.z.enum(['PROMOTION', 'TRANSFER']);
const reqQ = zod_1.z.object({ kind: kind.optional(), status: zod_1.z.string().max(20).optional(), personnelId: uuid.optional(), rank: zod_1.z.string().max(64).optional(), department: zod_1.z.string().max(64).optional(), requesterId: uuid.optional(), approverId: uuid.optional(), from: date.optional(), to: date.optional(), q: zod_1.z.string().max(80).optional() });
const createR = zod_1.z.object({ kind, personnelId: uuid, to: zod_1.z.string().min(1).max(64), reason: zod_1.z.string().trim().max(2000).default(''), achievements: zod_1.z.string().max(4000).optional(), internalNote: zod_1.z.string().max(2000).optional(), attachments: zod_1.z.array(uuid).max(10).optional() });
const editR = zod_1.z.object({ reason: zod_1.z.string().trim().min(1).max(2000).optional(), achievements: zod_1.z.string().max(4000).nullable().optional(), internalNote: zod_1.z.string().max(2000).nullable().optional(), attachments: zod_1.z.array(uuid).max(10).optional(), version: zod_1.z.number().int().optional() });
const decide = zod_1.z.object({ decision: zod_1.z.enum(['APPROVE', 'REJECT', 'REVIEW', 'DEFER', 'CANCEL']), comment: zod_1.z.string().max(1000).optional() });
let HrRequestsController = class HrRequestsController {
    s;
    constructor(s) {
        this.s = s;
    }
    /** Liste braucht promotion.view ODER transfer.view – geprüft je Art */
    list(a, q) { return this.s.list(a, q); }
    stats() { return this.s.stats(); }
    get(a, id) { return this.s.get(a, id); }
    create(a, b) { return this.s.create(a, b); }
    edit(a, id, b) { return this.s.edit(a, id, b); }
    decide(a, id, b) { return this.s.decide(a, id, b.decision, b.comment); }
    execute(a, id) { return this.s.execute(a, id); }
};
exports.HrRequestsController = HrRequestsController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('personnel.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(reqQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], HrRequestsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('stats'),
    (0, decorators_1.RequirePermission)('promotion.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HrRequestsController.prototype, "stats", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('personnel.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], HrRequestsController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('personnel.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(createR))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], HrRequestsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, decorators_1.RequirePermission)('personnel.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(editR))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], HrRequestsController.prototype, "edit", null);
__decorate([
    (0, common_1.Post)(':id/decide'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('personnel.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(decide))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], HrRequestsController.prototype, "decide", null);
__decorate([
    (0, common_1.Post)(':id/execute'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('personnel.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], HrRequestsController.prototype, "execute", null);
exports.HrRequestsController = HrRequestsController = __decorate([
    (0, swagger_1.ApiTags)('hr'),
    (0, common_1.Controller)('hr/requests'),
    __metadata("design:paramtypes", [hr_requests_service_1.HrRequestsService])
], HrRequestsController);
// ───────────── Ausbildungen & Prüfungen ─────────────
const progress = zod_1.z.object({ trainingId: uuid, personnelId: uuid, status: zod_1.z.enum(hr_training_service_1.TRAINING_STATUSES), progress: zod_1.z.number().int().min(0).max(100).optional(), note: zod_1.z.string().max(1000).nullable().optional() });
let HrTrainingController = class HrTrainingController {
    s;
    constructor(s) {
        this.s = s;
    }
    async trainings() { await this.s.expire(); return this.s.trainings(); }
    create(a, b) { return this.s.saveTraining(a, b); }
    save(a, id, b) { return this.s.saveTraining(a, b, id); }
    remove(a, id) { return this.s.deleteTraining(a, id); }
    progressOf(id) { return this.s.progressOf(id); }
    setProgress(a, b) { return this.s.setProgress(a, b); }
    certificate(a, no) { return this.s.certificate(a, no.slice(0, 20)); }
    exams(a) { return this.s.exams(a); }
    createExam(a, b) { return this.s.saveExam(a, b); }
    saveExam(a, id, b) { return this.s.saveExam(a, b, id); }
    deleteExam(a, id) { return this.s.deleteExam(a, id); }
    start(a, id) { return this.s.start(a, id); }
    attempts(a, examId) { return this.s.attempts(a, examId && /^[0-9a-f-]{36}$/.test(examId) ? examId : undefined); }
    attempt(a, id) { return this.s.view(id, a); }
    answers(a, id, b) { return this.s.saveAnswers(a, id, b.answers); }
    submit(a, id, b) { return this.s.submit(a, id, b.answers); }
    grade(a, id, b) { return this.s.grade(a, id, b); }
};
exports.HrTrainingController = HrTrainingController;
__decorate([
    (0, common_1.Get)('trainings'),
    (0, decorators_1.RequirePermission)('training.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HrTrainingController.prototype, "trainings", null);
__decorate([
    (0, common_1.Post)('trainings'),
    (0, decorators_1.RequirePermission)('training.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(hr_training_service_1.trainingSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], HrTrainingController.prototype, "create", null);
__decorate([
    (0, common_1.Put)('trainings/:id'),
    (0, decorators_1.RequirePermission)('training.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(hr_training_service_1.trainingSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], HrTrainingController.prototype, "save", null);
__decorate([
    (0, common_1.Delete)('trainings/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('training.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], HrTrainingController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)('trainings/:id/progress'),
    (0, decorators_1.RequirePermission)('training.view'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], HrTrainingController.prototype, "progressOf", null);
__decorate([
    (0, common_1.Put)('training-progress'),
    (0, decorators_1.RequirePermission)('training.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(progress))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], HrTrainingController.prototype, "setProgress", null);
__decorate([
    (0, common_1.Get)('certificates/:no'),
    (0, decorators_1.RequirePermission)('dashboard.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('no')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], HrTrainingController.prototype, "certificate", null);
__decorate([
    (0, common_1.Get)('exams'),
    (0, decorators_1.RequirePermission)('exam.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], HrTrainingController.prototype, "exams", null);
__decorate([
    (0, common_1.Post)('exams'),
    (0, decorators_1.RequirePermission)('exam.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(hr_training_service_1.examSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], HrTrainingController.prototype, "createExam", null);
__decorate([
    (0, common_1.Put)('exams/:id'),
    (0, decorators_1.RequirePermission)('exam.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(hr_training_service_1.examSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], HrTrainingController.prototype, "saveExam", null);
__decorate([
    (0, common_1.Delete)('exams/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('exam.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], HrTrainingController.prototype, "deleteExam", null);
__decorate([
    (0, common_1.Post)('exams/:id/start'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('exam.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], HrTrainingController.prototype, "start", null);
__decorate([
    (0, common_1.Get)('attempts'),
    (0, decorators_1.RequirePermission)('exam.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)('examId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], HrTrainingController.prototype, "attempts", null);
__decorate([
    (0, common_1.Get)('attempts/:id'),
    (0, decorators_1.RequirePermission)('exam.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], HrTrainingController.prototype, "attempt", null);
__decorate([
    (0, common_1.Put)('attempts/:id/answers'),
    (0, decorators_1.RequirePermission)('exam.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ answers: zod_1.z.record(zod_1.z.string().max(40), zod_1.z.unknown()) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], HrTrainingController.prototype, "answers", null);
__decorate([
    (0, common_1.Post)('attempts/:id/submit'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('exam.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ answers: zod_1.z.record(zod_1.z.string().max(40), zod_1.z.unknown()) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], HrTrainingController.prototype, "submit", null);
__decorate([
    (0, common_1.Post)('attempts/:id/grade'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('exam.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ scores: zod_1.z.record(zod_1.z.string().max(40), zod_1.z.number().min(0).max(100)), feedback: zod_1.z.string().max(2000).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], HrTrainingController.prototype, "grade", null);
exports.HrTrainingController = HrTrainingController = __decorate([
    (0, swagger_1.ApiTags)('hr'),
    (0, common_1.Controller)('hr'),
    __metadata("design:paramtypes", [hr_training_service_1.HrTrainingService])
], HrTrainingController);
// ───────────── Meldungen & Abstimmungen ─────────────
let HrCommsController = class HrCommsController {
    s;
    constructor(s) {
        this.s = s;
    }
    list(a, all) { return this.s.announcements(a, all === '1'); }
    create(a, b) { return this.s.saveAnnouncement(a, b); }
    save(a, id, b) { return this.s.saveAnnouncement(a, b, id); }
    remove(a, id) { return this.s.deleteAnnouncement(a, id); }
    ack(a, id) { return this.s.ack(a, id); }
    readers(a, id) { return this.s.readers(a, id); }
    polls(a) { return this.s.polls(a); }
    createPoll(a, b) { return this.s.savePoll(a, b); }
    savePoll(a, id, b) { return this.s.savePoll(a, b, id); }
    deletePoll(a, id) { return this.s.deletePoll(a, id); }
    vote(a, id, b) { return this.s.vote(a, id, b.optionIds); }
};
exports.HrCommsController = HrCommsController;
__decorate([
    (0, common_1.Get)('announcements'),
    (0, decorators_1.RequirePermission)('announcements.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)('all')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], HrCommsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('announcements'),
    (0, decorators_1.RequirePermission)('announcements.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(hr_comms_service_1.announcementSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], HrCommsController.prototype, "create", null);
__decorate([
    (0, common_1.Put)('announcements/:id'),
    (0, decorators_1.RequirePermission)('announcements.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(hr_comms_service_1.announcementSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], HrCommsController.prototype, "save", null);
__decorate([
    (0, common_1.Delete)('announcements/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('announcements.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], HrCommsController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('announcements/:id/ack'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('announcements.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], HrCommsController.prototype, "ack", null);
__decorate([
    (0, common_1.Get)('announcements/:id/readers'),
    (0, decorators_1.RequirePermission)('announcements.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], HrCommsController.prototype, "readers", null);
__decorate([
    (0, common_1.Get)('polls'),
    (0, decorators_1.RequirePermission)('polls.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], HrCommsController.prototype, "polls", null);
__decorate([
    (0, common_1.Post)('polls'),
    (0, decorators_1.RequirePermission)('polls.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(hr_comms_service_1.pollSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], HrCommsController.prototype, "createPoll", null);
__decorate([
    (0, common_1.Put)('polls/:id'),
    (0, decorators_1.RequirePermission)('polls.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(hr_comms_service_1.pollSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], HrCommsController.prototype, "savePoll", null);
__decorate([
    (0, common_1.Delete)('polls/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('polls.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], HrCommsController.prototype, "deletePoll", null);
__decorate([
    (0, common_1.Post)('polls/:id/vote'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('polls.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ optionIds: zod_1.z.array(zod_1.z.string().max(40)).min(1).max(20) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], HrCommsController.prototype, "vote", null);
exports.HrCommsController = HrCommsController = __decorate([
    (0, swagger_1.ApiTags)('hr'),
    (0, common_1.Controller)('hr'),
    __metadata("design:paramtypes", [hr_comms_service_1.HrCommsService])
], HrCommsController);
// ───────────── Dienstnummern ─────────────
const listQ = zod_1.z.object({ status: zod_1.z.enum(shared_1.DN_STATUSES).optional(), rangeId: uuid.optional(), q: zod_1.z.string().max(80).optional(), department: zod_1.z.string().max(64).optional(), rank: zod_1.z.string().max(64).optional(), limit: zod_1.z.coerce.number().int().min(1).max(1000).optional() });
const assign = zod_1.z.object({ personnelId: uuid, display: zod_1.z.string().trim().min(1).max(40).optional(), rangeId: uuid.optional(), reason: zod_1.z.string().max(500).optional() });
const change = assign.extend({ reason: zod_1.z.string().trim().min(3).max(500), approverId: uuid.nullable().optional() });
const status = zod_1.z.object({ display: zod_1.z.string().trim().min(1).max(40), reason: zod_1.z.string().max(500).optional(), userId: uuid.optional() });
let ServiceNumbersController = class ServiceNumbersController {
    s;
    constructor(s) {
        this.s = s;
    }
    list(q) { return this.s.list(q); }
    ranges() { return this.s.ranges(); }
    createRange(a, b) { return this.s.saveRange(a, b); }
    saveRange(a, id, b) { return this.s.saveRange(a, b, id); }
    deleteRange(a, id) { return this.s.deleteRange(a, id); }
    settings() { return this.s.settings(); }
    saveSettings(a, b) { return this.s.saveSettings(a, b); }
    history(q) { return this.s.history(q); }
    pending() { return this.s.pending(); }
    confirm(a, id, b) { return this.s.confirmPending(a, id, b.display || undefined); }
    assign(a, b) { return this.s.assignManual(a, b); }
    change(a, b) { return this.s.change(a, b); }
    release(a, b) { return this.s.setStatus(a, b.display, b.as, b.reason); }
    block(a, b) { return this.s.setStatus(a, b.display, 'BLOCKED', b.reason); }
    unblock(a, b) { return this.s.setStatus(a, b.display, 'UNBLOCK', b.reason); }
    reserve(a, b) { return this.s.setStatus(a, b.display, 'RESERVED', b.reason, b.userId); }
};
exports.ServiceNumbersController = ServiceNumbersController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('dienstnummer.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], ServiceNumbersController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('ranges'),
    (0, decorators_1.RequirePermission)('dienstnummer.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ServiceNumbersController.prototype, "ranges", null);
__decorate([
    (0, common_1.Post)('ranges'),
    (0, decorators_1.RequirePermission)('dienstnummer.manage_ranges'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.rangeSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ServiceNumbersController.prototype, "createRange", null);
__decorate([
    (0, common_1.Put)('ranges/:id'),
    (0, decorators_1.RequirePermission)('dienstnummer.manage_ranges'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.rangeSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], ServiceNumbersController.prototype, "saveRange", null);
__decorate([
    (0, common_1.Delete)('ranges/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('dienstnummer.manage_ranges'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ServiceNumbersController.prototype, "deleteRange", null);
__decorate([
    (0, common_1.Get)('settings'),
    (0, decorators_1.RequirePermission)('dienstnummer.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ServiceNumbersController.prototype, "settings", null);
__decorate([
    (0, common_1.Put)('settings'),
    (0, decorators_1.RequirePermission)('dienstnummer.manage_settings'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.dnSettingsSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ServiceNumbersController.prototype, "saveSettings", null);
__decorate([
    (0, common_1.Get)('history'),
    (0, decorators_1.RequirePermission)('dienstnummer.history'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ display: zod_1.z.string().max(40).optional(), personnelId: uuid.optional(), userId: uuid.optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ServiceNumbersController.prototype, "history", null);
__decorate([
    (0, common_1.Get)('pending'),
    (0, decorators_1.RequirePermission)('dienstnummer.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ServiceNumbersController.prototype, "pending", null);
__decorate([
    (0, common_1.Post)('pending/:id/confirm'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('dienstnummer.assign'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ display: zod_1.z.string().trim().max(40).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], ServiceNumbersController.prototype, "confirm", null);
__decorate([
    (0, common_1.Post)('assign'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('dienstnummer.assign'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(assign))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], ServiceNumbersController.prototype, "assign", null);
__decorate([
    (0, common_1.Post)('change'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('dienstnummer.edit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(change))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], ServiceNumbersController.prototype, "change", null);
__decorate([
    (0, common_1.Post)('release'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('dienstnummer.release'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(status.extend({ as: zod_1.z.enum(['FREE', 'FORMER']).default('FREE') })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ServiceNumbersController.prototype, "release", null);
__decorate([
    (0, common_1.Post)('block'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('dienstnummer.block'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(status))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], ServiceNumbersController.prototype, "block", null);
__decorate([
    (0, common_1.Post)('unblock'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('dienstnummer.block'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(status))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], ServiceNumbersController.prototype, "unblock", null);
__decorate([
    (0, common_1.Post)('reserve'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('dienstnummer.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(status))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], ServiceNumbersController.prototype, "reserve", null);
exports.ServiceNumbersController = ServiceNumbersController = __decorate([
    (0, swagger_1.ApiTags)('hr'),
    (0, common_1.Controller)('dienstnummern'),
    __metadata("design:paramtypes", [service_numbers_service_1.ServiceNumbersService])
], ServiceNumbersController);
//# sourceMappingURL=hr.controller.js.map