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
exports.TrainingExtController = exports.QualificationRegistryController = exports.PersonnelFileController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const personnel_file_service_1 = require("./personnel-file.service");
const qualification_registry_service_1 = require("./qualification-registry.service");
const training_ext_service_1 = require("./training-ext.service");
const uuid = zod_1.z.string().uuid();
const note = zod_1.z.object({ summary: zod_1.z.string().trim().min(2).max(300), details: zod_1.z.string().max(5000).nullable().optional(), category: zod_1.z.string().trim().max(60).nullable().optional(), confidential: zod_1.z.boolean().optional() });
const editNote = note.partial().extend({ reason: zod_1.z.string().trim().max(300).optional() });
const doc = zod_1.z.object({ mediaId: uuid, kind: zod_1.z.enum(shared_1.PERSONNEL_DOCUMENT_KINDS), title: zod_1.z.string().trim().min(2).max(120), note: zod_1.z.string().max(1000).nullable().optional(), confidential: zod_1.z.boolean().optional() });
const page = zod_1.z.coerce.number().int().min(1).max(10_000).optional();
/** Personalakte 2.0 (Dashboard), Personal-Auskunft (MDT/Leitstelle/Bot). */
let PersonnelFileController = class PersonnelFileController {
    s;
    constructor(s) {
        this.s = s;
    }
    /** Zuständige Akten für Führungskräfte (personnel.view_unit) */
    myUnit(a) { return this.s.unitOverview(a); }
    /** MDT/Leitstelle: dienstrelevante Auskunft, keine vertraulichen Inhalte */
    directory(q) { return this.s.directory({ q: q.q, onDuty: q.onDuty === '1', page: q.page }); }
    lookup(a, q) { return this.s.lookup(a, q.discordId); }
    summary(a, id) { return this.s.summary(a, id); }
    activity(a, id, q) { return this.s.activity(a, id, q.page); }
    notes(a, id, q) { return this.s.notes(a, id, q); }
    addNote(a, id, b) { return this.s.addNote(a, id, b); }
    editNote(a, id, b) { return this.s.editNote(a, id, b); }
    revisions(a, id) { return this.s.noteRevisions(a, id); }
    documents(a, id, q) { return this.s.documents(a, id, q.archived === '1'); }
    addDocument(a, id, b) { return this.s.addDocument(a, id, b); }
    archive(a, id) { return this.s.archiveDocument(a, id); }
    async download(a, id, res) {
        const { media, data } = await this.s.downloadDocument(a, id);
        res.set({ 'Content-Type': media.mime, 'Content-Disposition': `attachment; filename="${media.originalName.replace(/["\r\n]/g, '')}"`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'no-store' });
        res.send(data);
    }
};
exports.PersonnelFileController = PersonnelFileController;
__decorate([
    (0, common_1.Get)('my-unit'),
    (0, decorators_1.RequirePermission)('personnel.view_unit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PersonnelFileController.prototype, "myUnit", null);
__decorate([
    (0, common_1.Get)('directory'),
    (0, decorators_1.RequireAnyPermission)('personnel.view', 'cad.view', 'team.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ q: zod_1.z.string().trim().max(80).optional(), onDuty: zod_1.z.enum(['1', '0']).optional(), page })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PersonnelFileController.prototype, "directory", null);
__decorate([
    (0, common_1.Get)('lookup'),
    (0, decorators_1.RequireAnyPermission)('personnel.view', 'personnel.view_unit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ discordId: zod_1.z.string().regex(/^\d{15,25}$/) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], PersonnelFileController.prototype, "lookup", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequireAnyPermission)('personnel.view', 'personnel.view_unit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PersonnelFileController.prototype, "summary", null);
__decorate([
    (0, common_1.Get)(':id/activity'),
    (0, decorators_1.RequireAnyPermission)('personnel.view', 'personnel.view_unit'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ page })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PersonnelFileController.prototype, "activity", null);
__decorate([
    (0, common_1.Get)(':id/notes'),
    (0, decorators_1.RequirePermission)('personnel.notes_view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ category: zod_1.z.string().max(60).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PersonnelFileController.prototype, "notes", null);
__decorate([
    (0, common_1.Post)(':id/notes'),
    (0, decorators_1.RequirePermission)('personnel.notes_create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(note))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], PersonnelFileController.prototype, "addNote", null);
__decorate([
    (0, common_1.Patch)('notes/:noteId'),
    (0, decorators_1.RequirePermission)('personnel.notes_view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('noteId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(editNote))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], PersonnelFileController.prototype, "editNote", null);
__decorate([
    (0, common_1.Get)('notes/:noteId/revisions'),
    (0, decorators_1.RequirePermission)('personnel.notes_view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('noteId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PersonnelFileController.prototype, "revisions", null);
__decorate([
    (0, common_1.Get)(':id/documents'),
    (0, decorators_1.RequirePermission)('personnel.documents'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ archived: zod_1.z.enum(['1', '0']).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PersonnelFileController.prototype, "documents", null);
__decorate([
    (0, common_1.Post)(':id/documents'),
    (0, decorators_1.RequirePermission)('personnel.documents'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(doc))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], PersonnelFileController.prototype, "addDocument", null);
__decorate([
    (0, common_1.Post)('documents/:docId/archive'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('personnel.documents'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('docId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PersonnelFileController.prototype, "archive", null);
__decorate([
    (0, common_1.Get)('documents/:docId/download'),
    (0, decorators_1.RequirePermission)('personnel.documents'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('docId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], PersonnelFileController.prototype, "download", null);
exports.PersonnelFileController = PersonnelFileController = __decorate([
    (0, swagger_1.ApiTags)('personnel-file'),
    (0, common_1.Controller)('personnel-file'),
    __metadata("design:paramtypes", [personnel_file_service_1.PersonnelFileService])
], PersonnelFileController);
const defBody = shared_1.qualificationDefSchema.extend({ trainingIds: zod_1.z.array(uuid).max(50).default([]), examIds: zod_1.z.array(uuid).max(50).default([]) });
const regQ = zod_1.z.object({ personnelId: uuid.optional(), definitionId: uuid.optional(), status: zod_1.z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED']).optional(), operational: zod_1.z.enum(['1', '0']).optional(), q: zod_1.z.string().trim().max(80).optional(), page, pageSize: zod_1.z.coerce.number().int().min(1).max(200).optional() });
/** Qualifikationsregister + Katalog. */
let QualificationRegistryController = class QualificationRegistryController {
    s;
    constructor(s) {
        this.s = s;
    }
    definitions(q) { return this.s.definitions(q.all === '1'); }
    create(a, b) { return this.s.saveDefinition(a, b); }
    update(a, id, b) { return this.s.saveDefinition(a, b, id); }
    /** Eigene Qualifikationen (jeder mit Personalakte; Bot-Befehl) */
    mine(a) { return this.s.mine(a.userId); }
    list(q) { return this.s.list({ ...q, operational: q.operational === '1' }); }
    /** Einsatzrelevante, aktive Qualifikationen einer Person (MDT/Leitstelle) */
    ofPersonnel(id, q) { return this.s.ofPersonnel(id, q.all !== '1'); }
    grant(a, b) { return this.s.grant(a, b); }
    status(a, id, b) { return this.s.setStatus(a, id, b); }
};
exports.QualificationRegistryController = QualificationRegistryController;
__decorate([
    (0, common_1.Get)('definitions'),
    (0, decorators_1.RequireAnyPermission)('qualification.view', 'qualification.manage'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ all: zod_1.z.enum(['1', '0']).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], QualificationRegistryController.prototype, "definitions", null);
__decorate([
    (0, common_1.Post)('definitions'),
    (0, decorators_1.RequirePermission)('qualification.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(defBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], QualificationRegistryController.prototype, "create", null);
__decorate([
    (0, common_1.Put)('definitions/:id'),
    (0, decorators_1.RequirePermission)('qualification.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(defBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], QualificationRegistryController.prototype, "update", null);
__decorate([
    (0, common_1.Get)('mine'),
    (0, decorators_1.RequirePermission)('dashboard.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], QualificationRegistryController.prototype, "mine", null);
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('qualification.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(regQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], QualificationRegistryController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('personnel/:id'),
    (0, decorators_1.RequireAnyPermission)('qualification.view', 'cad.view'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ all: zod_1.z.enum(['1', '0']).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], QualificationRegistryController.prototype, "ofPersonnel", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('qualification.grant'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ personnelId: uuid, definitionId: uuid, issuedAt: zod_1.z.string().date().optional(), expiresAt: zod_1.z.string().date().nullable().optional(), note: zod_1.z.string().max(500).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], QualificationRegistryController.prototype, "grant", null);
__decorate([
    (0, common_1.Post)(':id/status'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequireAnyPermission)('qualification.grant', 'qualification.revoke'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ status: zod_1.z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED']), reason: zod_1.z.string().trim().max(500).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], QualificationRegistryController.prototype, "status", null);
exports.QualificationRegistryController = QualificationRegistryController = __decorate([
    (0, swagger_1.ApiTags)('qualification-registry'),
    (0, common_1.Controller)('qualification-registry'),
    __metadata("design:paramtypes", [qualification_registry_service_1.QualificationRegistryService])
], QualificationRegistryController);
const matQ = zod_1.z.object({ q: zod_1.z.string().trim().max(80).optional(), trainingId: uuid.optional(), kind: zod_1.z.string().max(10).optional() });
const matBody = shared_1.learningMaterialSchema.and(zod_1.z.object({ version: zod_1.z.number().int().optional() }));
/** Lernmaterialien und praktische Prüfungen. */
let TrainingExtController = class TrainingExtController {
    s;
    constructor(s) {
        this.s = s;
    }
    materials(a, q) { return this.s.materials(a, q); }
    material(a, id) { return this.s.material(a, id); }
    createMaterial(a, b) { return this.s.saveMaterial(a, b); }
    saveMaterial(a, id, b) { return this.s.saveMaterial(a, b, id); }
    archiveMaterial(a, id) { return this.s.archiveMaterial(a, id); }
    practical(q) { return this.s.practicalExams(q.all === '1'); }
    practicalExam(id) { return this.s.practicalExam(id); }
    createPractical(a, b) { return this.s.savePracticalExam(a, b); }
    savePractical(a, id, b) { return this.s.savePracticalExam(a, b, id); }
    assessments(a, q) { return this.s.assessments(a, q); }
    assessment(a, id) { return this.s.view(a, id); }
    start(a, id, b) { return this.s.start(a, id, b.personnelId); }
    scores(a, id, b) { return this.s.saveScores(a, id, b); }
    complete(a, id) { return this.s.complete(a, id); }
    cancel(a, id, b) { return this.s.cancel(a, id, b.reason); }
};
exports.TrainingExtController = TrainingExtController;
__decorate([
    (0, common_1.Get)('materials'),
    (0, decorators_1.RequirePermission)('training.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(matQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], TrainingExtController.prototype, "materials", null);
__decorate([
    (0, common_1.Get)('materials/:id'),
    (0, decorators_1.RequirePermission)('training.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TrainingExtController.prototype, "material", null);
__decorate([
    (0, common_1.Post)('materials'),
    (0, decorators_1.RequirePermission)('training.materials'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(matBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], TrainingExtController.prototype, "createMaterial", null);
__decorate([
    (0, common_1.Put)('materials/:id'),
    (0, decorators_1.RequirePermission)('training.materials'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(matBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], TrainingExtController.prototype, "saveMaterial", null);
__decorate([
    (0, common_1.Post)('materials/:id/archive'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('training.materials'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TrainingExtController.prototype, "archiveMaterial", null);
__decorate([
    (0, common_1.Get)('practical'),
    (0, decorators_1.RequireAnyPermission)('exam.view', 'exam.conduct'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ all: zod_1.z.enum(['1', '0']).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TrainingExtController.prototype, "practical", null);
__decorate([
    (0, common_1.Get)('practical/:id'),
    (0, decorators_1.RequireAnyPermission)('exam.view', 'exam.conduct'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TrainingExtController.prototype, "practicalExam", null);
__decorate([
    (0, common_1.Post)('practical'),
    (0, decorators_1.RequirePermission)('exam.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.practicalExamSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], TrainingExtController.prototype, "createPractical", null);
__decorate([
    (0, common_1.Put)('practical/:id'),
    (0, decorators_1.RequirePermission)('exam.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.practicalExamSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], TrainingExtController.prototype, "savePractical", null);
__decorate([
    (0, common_1.Get)('assessments'),
    (0, decorators_1.RequireAnyPermission)('exam.conduct', 'exam.results', 'exam.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ examId: uuid.optional(), status: zod_1.z.enum(['OPEN', 'COMPLETED', 'CANCELLED']).optional(), personnelId: uuid.optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], TrainingExtController.prototype, "assessments", null);
__decorate([
    (0, common_1.Get)('assessments/:id'),
    (0, decorators_1.RequirePermission)('dashboard.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TrainingExtController.prototype, "assessment", null);
__decorate([
    (0, common_1.Post)('practical/:id/assessments'),
    (0, decorators_1.RequirePermission)('exam.conduct'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ personnelId: uuid })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], TrainingExtController.prototype, "start", null);
__decorate([
    (0, common_1.Put)('assessments/:id/scores'),
    (0, decorators_1.RequirePermission)('exam.conduct'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ scores: zod_1.z.record(zod_1.z.string().max(40), zod_1.z.object({ points: zod_1.z.number(), note: zod_1.z.string().max(1000).optional() })), remarks: zod_1.z.string().max(4000).nullable().optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], TrainingExtController.prototype, "scores", null);
__decorate([
    (0, common_1.Post)('assessments/:id/complete'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('exam.conduct'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TrainingExtController.prototype, "complete", null);
__decorate([
    (0, common_1.Post)('assessments/:id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('exam.conduct'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ reason: zod_1.z.string().trim().min(3).max(500) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], TrainingExtController.prototype, "cancel", null);
exports.TrainingExtController = TrainingExtController = __decorate([
    (0, swagger_1.ApiTags)('training'),
    (0, common_1.Controller)('training-ext'),
    __metadata("design:paramtypes", [training_ext_service_1.TrainingExtService])
], TrainingExtController);
//# sourceMappingURL=hr-ext.controller.js.map