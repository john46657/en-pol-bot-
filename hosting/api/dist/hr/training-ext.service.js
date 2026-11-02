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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrainingExtService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const shared_1 = require("@enrp/shared");
const permission_service_1 = require("../authz/permission.service");
const notify_service_1 = require("../notifications/notify.service");
const errors_1 = require("../common/errors");
const hr_core_service_1 = require("./hr-core.service");
const qualification_registry_service_1 = require("./qualification-registry.service");
/**
 * Ausbildungs- und Prüfungssystem 2.0 (Ergänzung zu Ausbildungen/Theorieprüfungen): Lernmaterialien und praktische Prüfungen.
 * Praktische Bewertungen dürfen nur Prüfer der Prüfung bzw. Personen mit `exam.manage` vornehmen – nie für sich selbst.
 */
let TrainingExtService = class TrainingExtService {
    core;
    perms;
    quals;
    notify;
    constructor(core, perms, quals, notify) {
        this.core = core;
        this.perms = perms;
        this.quals = quals;
        this.notify = notify;
    }
    get prisma() { return this.core.prisma; }
    // ───────── Lernmaterialien ─────────
    async materials(actor, q) {
        const manage = await this.perms.has(actor.userId, 'training.materials');
        const rows = await this.prisma.hrLearningMaterial.findMany({
            where: { archivedAt: null, ...(manage ? {} : { published: true }), ...(q.kind ? { kind: q.kind } : {}), ...(q.trainingId ? { trainingIds: { has: q.trainingId } } : {}),
                ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { body: { contains: q.q, mode: 'insensitive' } }] } : {}) },
            orderBy: [{ updatedAt: 'desc' }], take: 200, select: { id: true, title: true, kind: true, published: true, trainingIds: true, qualificationDefId: true, examId: true, version: true, updatedAt: true },
        });
        return rows;
    }
    async material(actor, id) {
        const m = await this.prisma.hrLearningMaterial.findUnique({ where: { id } });
        if (!m || m.archivedAt || (!m.published && !(await this.perms.has(actor.userId, 'training.materials'))))
            throw new errors_1.AppError('NOT_FOUND', 'Lernmaterial nicht gefunden.');
        return m;
    }
    async saveMaterial(actor, d, id) {
        if (d.mediaIds.length) {
            const media = await this.prisma.media.findMany({ where: { id: { in: d.mediaIds } }, select: { id: true, linkedType: true } });
            if (media.length !== d.mediaIds.length || media.some((m) => m.linkedType !== 'LearningAsset'))
                throw new errors_1.AppError('VALIDATION_FAILED', 'Dateien müssen als Lernmaterial (LearningAsset) hochgeladen sein.');
        }
        return this.prisma.$transaction(async (tx) => {
            const before = id ? await tx.hrLearningMaterial.findUnique({ where: { id } }) : null;
            if (id && (!before || before.archivedAt))
                throw new errors_1.AppError('NOT_FOUND', 'Lernmaterial nicht gefunden.');
            if (before && d.version !== undefined && d.version !== before.version)
                throw new errors_1.AppError('CONFLICT', 'Das Lernmaterial wurde inzwischen geändert – bitte neu laden.', { reason: 'VERSION' });
            const data = { title: d.title, kind: d.kind, body: d.body, mediaIds: d.mediaIds, trainingIds: d.trainingIds, qualificationDefId: d.qualificationDefId ?? null, examId: d.examId ?? null, published: d.published, updatedById: actor.userId };
            const row = before ? await tx.hrLearningMaterial.update({ where: { id: before.id }, data: { ...data, version: { increment: 1 } } }) : await tx.hrLearningMaterial.create({ data: { ...data, createdById: actor.userId } });
            await this.core.audit.record(actor, { action: before ? 'training.material.update' : 'training.material.create', module: 'training', entityType: 'HrLearningMaterial', entityId: row.id, before: before ? { title: before.title, published: before.published, version: before.version } : undefined, after: { title: row.title, published: row.published, version: row.version } }, tx);
            return row;
        });
    }
    async archiveMaterial(actor, id) {
        const m = await this.prisma.hrLearningMaterial.findUnique({ where: { id } });
        if (!m || m.archivedAt)
            throw new errors_1.AppError('NOT_FOUND', 'Lernmaterial nicht gefunden.');
        await this.prisma.$transaction(async (tx) => {
            await tx.hrLearningMaterial.update({ where: { id }, data: { archivedAt: new Date(), published: false } });
            await this.core.audit.record(actor, { action: 'training.material.archive', module: 'training', entityType: 'HrLearningMaterial', entityId: id }, tx);
        });
    }
    // ───────── Praktische Prüfungen ─────────
    async practicalExams(all = false) {
        return this.prisma.hrPracticalExam.findMany({ where: all ? {} : { active: true }, orderBy: { title: 'asc' }, include: { _count: { select: { assessments: true } } } });
    }
    async practicalExam(id) {
        const e = await this.prisma.hrPracticalExam.findUnique({ where: { id } });
        if (!e)
            throw new errors_1.AppError('NOT_FOUND', 'Praktische Prüfung nicht gefunden.');
        return e;
    }
    async savePracticalExam(actor, d, id) {
        if (id && !(await this.perms.has(actor.userId, 'exam.manage'))) {
            const e = await this.practicalExam(id);
            if (e.createdById !== actor.userId)
                throw new errors_1.AppError('PERMISSION_DENIED', 'Fremde Prüfungen bearbeiten braucht exam.manage.');
        }
        if (d.qualificationDefId && !(await this.prisma.qualificationDefinition.findUnique({ where: { id: d.qualificationDefId } })))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Qualifikation nicht gefunden.');
        return this.prisma.$transaction(async (tx) => {
            const before = id ? await tx.hrPracticalExam.findUnique({ where: { id } }) : null;
            const data = { title: d.title, description: d.description ?? null, tasks: d.tasks ?? null, criteria: d.criteria, passPoints: d.passPoints, examinerIds: d.examinerIds, trainingId: d.trainingId ?? null, qualificationDefId: d.qualificationDefId ?? null, active: d.active };
            const row = before ? await tx.hrPracticalExam.update({ where: { id: before.id }, data }) : await tx.hrPracticalExam.create({ data: { ...data, createdById: actor.userId } });
            await this.core.audit.record(actor, { action: before ? 'exam.practical.update' : 'exam.practical.create', module: 'exam', entityType: 'HrPracticalExam', entityId: row.id, before, after: row }, tx);
            return row;
        });
    }
    /** Bewertungen: mit exam.results/exam.manage alle, sonst nur eigene (als Prüfer). */
    async assessments(actor, q) {
        const ctx = await this.perms.contextFor(actor.userId);
        const all = (0, shared_1.can)(ctx, 'exam.results') || (0, shared_1.can)(ctx, 'exam.manage');
        // nur Prüfungen des gewählten Servers (HrPracticalExam ist serverbezogen)
        const examIds = (await this.prisma.hrPracticalExam.findMany({ select: { id: true } })).map((e) => e.id);
        const rows = await this.prisma.hrPracticalAssessment.findMany({
            where: { examId: q.examId ? { in: examIds.filter((x) => x === q.examId) } : { in: examIds }, ...(q.status ? { status: q.status } : {}), ...(q.personnelId ? { personnelId: q.personnelId } : {}), ...(all ? {} : { examinerId: actor.userId }) },
            orderBy: { startedAt: 'desc' }, take: 300, include: { exam: { select: { title: true } }, personnel: { select: { user: { select: { displayName: true } } } } },
        });
        const names = new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.examinerId))] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
        return rows.map((r) => ({ ...r, examTitle: r.exam.title, personName: r.personnel.user.displayName, examinerName: names.get(r.examinerId) ?? '—', exam: undefined, personnel: undefined }));
    }
    async assertExaminer(actor, exam) {
        if (exam.examinerIds.includes(actor.userId) || (await this.perms.has(actor.userId, 'exam.manage')))
            return;
        throw new errors_1.AppError('PERMISSION_DENIED', 'Bewerten dürfen nur eingetragene Prüfer dieser Prüfung oder Personen mit exam.manage.');
    }
    async assessment(id) {
        const a = await this.prisma.hrPracticalAssessment.findUnique({ where: { id }, include: { exam: true, personnel: { select: { userId: true, user: { select: { displayName: true } } } } } });
        // Prüfung im gewählten Server? (HrPracticalExam ist serverbezogen)
        if (!a || !(await this.prisma.hrPracticalExam.findUnique({ where: { id: a.examId }, select: { id: true } })))
            throw new errors_1.AppError('NOT_FOUND', 'Bewertung nicht gefunden.');
        return a;
    }
    async start(actor, examId, personnelId) {
        const exam = await this.practicalExam(examId);
        if (!exam.active)
            throw new errors_1.AppError('CONFLICT', 'Die Prüfung ist deaktiviert.');
        await this.assertExaminer(actor, exam);
        const p = await this.prisma.personnel.findUnique({ where: { id: personnelId }, select: { id: true, userId: true } });
        if (!p)
            throw new errors_1.AppError('NOT_FOUND', 'Personalakte nicht gefunden.');
        if (p.userId === actor.userId)
            throw new errors_1.AppError('CONFLICT', 'Dich selbst kannst du nicht prüfen.');
        try {
            return await this.prisma.$transaction(async (tx) => {
                const a = await tx.hrPracticalAssessment.create({ data: { examId, personnelId, examinerId: actor.userId, criteria: exam.criteria, passPoints: exam.passPoints } });
                await this.core.audit.record(actor, { action: 'exam.practical.start', module: 'exam', entityType: 'HrPracticalAssessment', entityId: a.id, after: { examId, personnelId } }, tx);
                return a;
            });
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
                throw new errors_1.AppError('CONFLICT', 'Für diese Person läuft schon eine Bewertung dieser Prüfung.');
            throw e;
        }
    }
    /** Zwischenstand speichern (Punkte und Bemerkungen je Kriterium). */
    async saveScores(actor, id, d) {
        const a = await this.assessment(id);
        if (a.status !== 'OPEN')
            throw new errors_1.AppError('CONFLICT', 'Die Bewertung ist abgeschlossen.');
        if (a.examinerId !== actor.userId && !(await this.perms.has(actor.userId, 'exam.manage')))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Nur der Prüfer dieser Bewertung kann Punkte vergeben.');
        const criteria = a.criteria;
        const known = new Set(criteria.map((c) => c.id));
        const scores = Object.fromEntries(Object.entries(d.scores).filter(([k]) => known.has(k)));
        const r = (0, shared_1.scorePractical)(criteria, scores, a.passPoints);
        if (r.invalid.length)
            throw new errors_1.AppError('VALIDATION_FAILED', `Ungültige Punkte bei: ${r.invalid.map((x) => criteria.find((c) => c.id === x)?.label ?? x).join(', ')}.`);
        return this.prisma.hrPracticalAssessment.update({ where: { id }, data: { scores: scores, ...(d.remarks !== undefined ? { remarks: d.remarks } : {}) } });
    }
    /** Abschließen: alle Kriterien bewertet → Ergebnis, Personalakte, ggf. Qualifikation, private Benachrichtigung. */
    async complete(actor, id) {
        const a = await this.assessment(id);
        if (a.status !== 'OPEN')
            throw new errors_1.AppError('CONFLICT', 'Die Bewertung ist schon abgeschlossen.');
        if (a.examinerId !== actor.userId && !(await this.perms.has(actor.userId, 'exam.manage')))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Nur der Prüfer dieser Bewertung kann sie abschließen.');
        if (a.personnel.userId === actor.userId)
            throw new errors_1.AppError('CONFLICT', 'Eigene Prüfungen kannst du nicht abschließen.');
        const criteria = a.criteria;
        const r = (0, shared_1.scorePractical)(criteria, a.scores, a.passPoints);
        if (!r.complete)
            throw new errors_1.AppError('CONFLICT', `Noch nicht alle Kriterien bewertet: ${r.missing.map((x) => criteria.find((c) => c.id === x)?.label ?? x).join(', ')}.`);
        const row = await this.prisma.$transaction(async (tx) => {
            const u = await tx.hrPracticalAssessment.update({ where: { id }, data: { status: 'COMPLETED', total: r.total, maxPoints: r.max, passed: r.passed, completedAt: new Date() } });
            await tx.personnelRecord.create({ data: { personnelId: a.personnelId, type: 'EXAM', summary: `Praktische Prüfung „${a.exam.title}“: ${r.passed ? 'bestanden' : 'nicht bestanden'} (${r.total}/${r.max} Punkte)`, data: { practicalExamId: a.examId, assessmentId: id, total: r.total, max: r.max, failedRequired: r.failedRequired }, createdById: actor.userId } });
            await this.core.audit.record(actor, { action: 'exam.practical.complete', module: 'exam', entityType: 'HrPracticalAssessment', entityId: id, after: { total: r.total, max: r.max, passed: r.passed, failedRequired: r.failedRequired } }, tx);
            return u;
        });
        if (r.passed)
            await this.quals.fromAchievement('PRACTICAL', { definitionId: a.exam.qualificationDefId, trainingId: null }, a.personnelId, id, actor.userId);
        await this.notify.notify([a.personnel.userId], { type: 'PERSONNEL', title: `📋 Ergebnis praktische Prüfung: ${a.exam.title}`, body: r.passed ? 'Bestanden 🟢' : 'Nicht bestanden 🔴', entityType: 'Personnel', entityId: a.personnelId });
        await this.core.dm(a.personnel.userId, { embeds: [{ title: `📋 Praktische Prüfung: ${a.exam.title}`.slice(0, 256), description: `${r.passed ? 'Bestanden 🟢' : 'Nicht bestanden 🔴'} – ${r.total}/${r.max} Punkte.\nDetails in deiner Personalakte.`, color: r.passed ? 0x22c55e : 0xef4444 }] }).catch(() => false);
        return { ...row, result: r };
    }
    async cancel(actor, id, reason) {
        const a = await this.assessment(id);
        if (a.status !== 'OPEN')
            throw new errors_1.AppError('CONFLICT', 'Nur laufende Bewertungen lassen sich abbrechen.');
        await this.assertExaminer(actor, a.exam);
        return this.prisma.$transaction(async (tx) => {
            const r = await tx.hrPracticalAssessment.update({ where: { id }, data: { status: 'CANCELLED', cancelledReason: reason, completedAt: new Date() } });
            await this.core.audit.record(actor, { action: 'exam.practical.cancel', module: 'exam', entityType: 'HrPracticalAssessment', entityId: id, reason }, tx);
            return r;
        });
    }
    async view(actor, id) {
        const a = await this.assessment(id);
        const ctx = await this.perms.contextFor(actor.userId);
        const mine = a.personnel.userId === actor.userId;
        if (!mine && a.examinerId !== actor.userId && !(0, shared_1.can)(ctx, 'exam.results') && !(0, shared_1.can)(ctx, 'exam.manage'))
            throw new errors_1.AppError('NOT_FOUND', 'Bewertung nicht gefunden.');
        const criteria = a.criteria;
        return { ...a, personName: a.personnel.user.displayName, result: (0, shared_1.scorePractical)(criteria, a.scores, a.passPoints), canEdit: a.status === 'OPEN' && (a.examinerId === actor.userId || (0, shared_1.can)(ctx, 'exam.manage')) };
    }
};
exports.TrainingExtService = TrainingExtService;
exports.TrainingExtService = TrainingExtService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [hr_core_service_1.HrCoreService, permission_service_1.PermissionService, qualification_registry_service_1.QualificationRegistryService, notify_service_1.NotifyService])
], TrainingExtService);
//# sourceMappingURL=training-ext.service.js.map