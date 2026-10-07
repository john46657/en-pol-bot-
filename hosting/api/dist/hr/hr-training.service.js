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
exports.HrTrainingService = exports.TRAINING_STATUSES = exports.examSchema = exports.trainingSchema = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const shared_1 = require("@enrp/shared");
const zod_1 = require("zod");
const permission_service_1 = require("../authz/permission.service");
const errors_1 = require("../common/errors");
const hr_core_service_1 = require("./hr-core.service");
exports.trainingSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(100), description: zod_1.z.string().max(3000).nullable().default(null), requirements: zod_1.z.string().max(1000).nullable().default(null),
    instructorIds: zod_1.z.array(zod_1.z.string().uuid()).max(30).default([]), duration: zod_1.z.string().max(60).nullable().default(null), active: zod_1.z.boolean().default(true), examRequired: zod_1.z.boolean().default(false),
    examId: zod_1.z.string().uuid().nullable().default(null), certificate: zod_1.z.boolean().default(true), audience: zod_1.z.string().max(200).nullable().default(null), requiredRoleId: zod_1.z.string().regex(/^\d{15,25}$/).nullable().default(null),
    validDays: zod_1.z.number().int().min(1).max(3650).nullable().default(null),
});
exports.examSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(1).max(120), description: zod_1.z.string().max(3000).nullable().default(null), questions: zod_1.z.array(shared_1.questionSchema).max(200).default([]),
    questionCount: zod_1.z.number().int().min(0).max(200).default(0), passPercent: zod_1.z.number().int().min(1).max(100).default(70), timeLimitMin: zod_1.z.number().int().min(1).max(600).nullable().default(null),
    maxAttempts: zod_1.z.number().int().min(1).max(50).default(3), retryHours: zod_1.z.number().int().min(0).max(24 * 90).default(24), autoGrade: zod_1.z.boolean().default(true), showResult: zod_1.z.boolean().default(true),
    examinerIds: zod_1.z.array(zod_1.z.string().uuid()).max(30).default([]), trainingId: zod_1.z.string().uuid().nullable().default(null), active: zod_1.z.boolean().default(true),
});
exports.TRAINING_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'PASSED', 'FAILED', 'ABORTED', 'EXPIRED'];
const CERT = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const certNo = () => `Z-${new Date().getUTCFullYear()}-${Array.from({ length: 6 }, () => CERT[(0, node_crypto_1.randomInt)(CERT.length)]).join('')}`;
/** Ausbildungen (mit Fortschritt und Zertifikat) und Prüfungen (Fragen, Versuche, automatische/manuelle Bewertung). */
let HrTrainingService = class HrTrainingService {
    core;
    perms;
    constructor(core, perms) {
        this.core = core;
        this.perms = perms;
    }
    get prisma() { return this.core.prisma; }
    // ---------------- Ausbildungen ----------------
    async trainings() {
        const list = await this.prisma.hrTraining.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }], include: { _count: { select: { progress: { where: { status: 'PASSED' } } } } } });
        return list.map(({ _count, ...t }) => ({ ...t, passed: _count.progress }));
    }
    async saveTraining(actor, d, id) {
        const t = id ? await this.prisma.hrTraining.update({ where: { id }, data: d }) : await this.prisma.hrTraining.create({ data: { ...d, position: ((await this.prisma.hrTraining.aggregate({ _max: { position: true } }))._max.position ?? 0) + 1 } });
        await this.core.audit.record(actor, { action: id ? 'training.update' : 'training.create', module: 'training', entityType: 'HrTraining', entityId: t.id, after: t });
        return t;
    }
    async deleteTraining(actor, id) {
        const t = await this.prisma.hrTraining.delete({ where: { id } }).catch(() => null);
        if (!t)
            throw new errors_1.AppError('NOT_FOUND', 'Ausbildung nicht gefunden.');
        await this.core.audit.record(actor, { action: 'training.delete', module: 'training', entityType: 'HrTraining', entityId: id, before: t });
    }
    /** Fortschritt aller Personen in einer Ausbildung (Matrix). */
    async progressOf(trainingId) {
        return this.prisma.hrTrainingProgress.findMany({ where: { trainingId }, include: { personnel: { select: { id: true, rank: true, user: { select: { displayName: true } } } } }, orderBy: { updatedAt: 'desc' } });
    }
    /** Fortschritt setzen (Ausbilder oder training.manage); bei „bestanden“ ggf. Zertifikat und Ablaufdatum. */
    async setProgress(actor, d) {
        const t = await this.prisma.hrTraining.findUnique({ where: { id: d.trainingId } });
        if (!t)
            throw new errors_1.AppError('NOT_FOUND', 'Ausbildung nicht gefunden.');
        if (!t.instructorIds.includes(actor.userId) && !(await this.perms.has(actor.userId, 'training.manage')))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Nur Ausbilder dieser Ausbildung oder Verwalter können den Fortschritt setzen.');
        const p = await this.prisma.personnel.findUnique({ where: { id: d.personnelId }, include: { user: { select: { displayName: true } } } });
        if (!p)
            throw new errors_1.AppError('NOT_FOUND', 'Personalakte nicht gefunden.');
        if (d.status === 'PASSED' && t.examRequired && t.examId && !(await this.prisma.hrExamAttempt.count({ where: { examId: t.examId, personnelId: p.id, passed: true } })))
            throw new errors_1.AppError('CONFLICT', 'Für diese Ausbildung muss zuerst die Prüfung bestanden sein.');
        const before = await this.prisma.hrTrainingProgress.findUnique({ where: { trainingId_personnelId: { trainingId: t.id, personnelId: p.id } } });
        const passed = d.status === 'PASSED';
        const progress = passed ? 100 : d.progress ?? before?.progress ?? (d.status === 'NOT_STARTED' ? 0 : 0);
        const data = {
            status: d.status, progress: Math.max(0, Math.min(100, progress)), note: d.note ?? before?.note ?? null, examinerId: actor.userId,
            ...(d.status !== 'NOT_STARTED' && !before?.startedAt ? { startedAt: new Date() } : {}),
            ...(passed ? { completedAt: new Date(), expiresAt: t.validDays ? new Date(Date.now() + t.validDays * 86_400_000) : null, certificateNo: before?.certificateNo ?? (t.certificate ? certNo() : null) } : {}),
        };
        const row = await this.prisma.$transaction(async (tx) => {
            const r = await tx.hrTrainingProgress.upsert({ where: { trainingId_personnelId: { trainingId: t.id, personnelId: p.id } }, create: { trainingId: t.id, personnelId: p.id, ...data }, update: data });
            if (passed && before?.status !== 'PASSED')
                await tx.personnelRecord.create({ data: { personnelId: p.id, type: 'TRAINING', summary: `Ausbildung bestanden: ${t.name}`, data: { trainingId: t.id, certificateNo: r.certificateNo }, createdById: actor.userId } });
            await this.core.audit.record(actor, { action: 'training.progress', module: 'training', entityType: 'HrTrainingProgress', entityId: r.id, before, after: r }, tx);
            return r;
        });
        if (passed && before?.status !== 'PASSED')
            await this.core.notify('training.passed', { memberUserId: p.userId, title: `🎓 Ausbildung bestanden: ${t.name}`, entityType: 'Personnel', entityId: p.id, publicText: `**${p.user.displayName}** hat die Ausbildung **${t.name}** bestanden.`, dmText: `Glückwunsch! Du hast die Ausbildung **${t.name}** bestanden.${row.certificateNo ? `\nZertifikat: ${row.certificateNo}` : ''}`, color: 0x22c55e });
        return row;
    }
    /** Abgelaufene Ausbildungen markieren (beim Lesen). */
    async expire() { await this.prisma.hrTrainingProgress.updateMany({ where: { status: 'PASSED', expiresAt: { lt: new Date() } }, data: { status: 'EXPIRED' } }); }
    /** Digitales Zertifikat (nur bestandene Ausbildungen mit Zertifikat). Sichtbar für die Person selbst und mit training.view. */
    async certificate(actor, certificateNo) {
        const r = await this.prisma.hrTrainingProgress.findUnique({ where: { certificateNo }, include: { training: true, personnel: { include: { user: { select: { displayName: true, robloxUsername: true } } } } } });
        if (!r || (r.personnel.userId !== actor.userId && !(await this.perms.has(actor.userId, 'training.view'))))
            throw new errors_1.AppError('NOT_FOUND', 'Zertifikat nicht gefunden.');
        const cfg = await this.core.config();
        const examiner = r.examinerId ? await this.prisma.user.findUnique({ where: { id: r.examinerId }, select: { displayName: true } }) : null;
        const attempt = r.training.examId ? await this.prisma.hrExamAttempt.findFirst({ where: { examId: r.training.examId, personnelId: r.personnelId, passed: true }, orderBy: { score: 'desc' } }) : null;
        return {
            certificateNo, name: r.personnel.user.displayName, roblox: r.personnel.user.robloxUsername, training: r.training.name, description: r.training.description,
            result: attempt?.score != null && attempt.maxScore ? `${Math.round((attempt.score / attempt.maxScore) * 100)} %` : 'Bestanden',
            date: r.completedAt, expiresAt: r.expiresAt, examiner: examiner?.displayName ?? '—', organisation: cfg.certificate.organisation, logo: cfg.certificate.logo, signature: cfg.certificate.signature, status: r.status,
        };
    }
    // ---------------- Prüfungen ----------------
    async exams(actor) {
        const manage = await this.perms.has(actor.userId, 'exam.manage') || await this.perms.has(actor.userId, 'exam.grade');
        const list = await this.prisma.hrExam.findMany({ orderBy: { title: 'asc' } });
        const me = await this.prisma.personnel.findUnique({ where: { userId: actor.userId } });
        const mine = me ? await this.prisma.hrExamAttempt.findMany({ where: { personnelId: me.id }, select: { examId: true, status: true, passed: true, score: true, maxScore: true, submittedAt: true, startedAt: true } }) : [];
        return list.filter((e) => manage || e.active).map((e) => ({ ...e, questions: manage ? e.questions : undefined, questionTotal: e.questions.length, myAttempts: mine.filter((a) => a.examId === e.id) }));
    }
    async saveExam(actor, d, id) {
        const ids = d.questions.map((q) => q.id);
        if (new Set(ids).size !== ids.length)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Fragen-IDs müssen eindeutig sein.');
        const data = { ...d, questions: d.questions };
        const e = id ? await this.prisma.hrExam.update({ where: { id }, data }) : await this.prisma.hrExam.create({ data });
        await this.core.audit.record(actor, { action: id ? 'exam.update' : 'exam.create', module: 'exam', entityType: 'HrExam', entityId: e.id, after: { title: e.title, questions: d.questions.length } });
        return e;
    }
    async deleteExam(actor, id) {
        const e = await this.prisma.hrExam.delete({ where: { id } }).catch(() => null);
        if (!e)
            throw new errors_1.AppError('NOT_FOUND', 'Prüfung nicht gefunden.');
        await this.core.audit.record(actor, { action: 'exam.delete', module: 'exam', entityType: 'HrExam', entityId: id, before: { title: e.title } });
    }
    /** Prüfung starten: prüft Versuche, Wartezeit; zieht ggf. zufällige Fragen. Liefert Fragen OHNE Lösungen. */
    async start(actor, examId) {
        const e = await this.prisma.hrExam.findUnique({ where: { id: examId } });
        if (!e?.active)
            throw new errors_1.AppError('NOT_FOUND', 'Prüfung nicht verfügbar.');
        const me = await this.prisma.personnel.findUnique({ where: { userId: actor.userId } });
        if (!me)
            throw new errors_1.AppError('CONFLICT', 'Für Prüfungen brauchst du eine Personalakte.');
        const open = await this.prisma.hrExamAttempt.findFirst({ where: { examId, personnelId: me.id, status: 'IN_PROGRESS' } });
        if (open && !this.timedOut(open.startedAt, e.timeLimitMin))
            return this.view(open.id, actor);
        if (open)
            await this.submit(actor, open.id, (open.answers ?? {}), true);
        const done = await this.prisma.hrExamAttempt.findMany({ where: { examId, personnelId: me.id, status: { not: 'IN_PROGRESS' } }, orderBy: { startedAt: 'desc' } });
        if (done.some((a) => a.passed))
            throw new errors_1.AppError('CONFLICT', 'Du hast diese Prüfung schon bestanden.');
        if (done.length >= e.maxAttempts)
            throw new errors_1.AppError('CONFLICT', `Keine Versuche mehr (${e.maxAttempts}).`);
        const last = done[0];
        if (last && e.retryHours && Date.now() - (last.submittedAt ?? last.startedAt).getTime() < e.retryHours * 3_600_000)
            throw new errors_1.AppError('CONFLICT', `Neuer Versuch erst ab ${new Date((last.submittedAt ?? last.startedAt).getTime() + e.retryHours * 3_600_000).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}.`);
        const all = e.questions;
        if (!all.length)
            throw new errors_1.AppError('CONFLICT', 'Diese Prüfung hat noch keine Fragen.');
        const pick = e.questionCount && e.questionCount < all.length ? [...all].sort(() => (0, node_crypto_1.randomInt)(3) - 1).slice(0, e.questionCount) : all;
        const a = await this.prisma.hrExamAttempt.create({ data: { examId, personnelId: me.id, questionIds: pick.map((q) => q.id) } });
        await this.core.audit.record(actor, { action: 'exam.start', module: 'exam', entityType: 'HrExamAttempt', entityId: a.id });
        return this.view(a.id, actor);
    }
    timedOut(start, limit) { return !!limit && Date.now() > start.getTime() + limit * 60_000 + 30_000; }
    /** Versuch ansehen: eigene (ohne Lösungen, Ergebnis je nach Einstellung) oder als Prüfer (mit Lösungen). */
    async view(attemptId, actor) {
        const a = await this.prisma.hrExamAttempt.findUnique({ where: { id: attemptId }, include: { exam: true, personnel: { select: { userId: true, user: { select: { displayName: true } } } } } });
        if (!a)
            throw new errors_1.AppError('NOT_FOUND', 'Versuch nicht gefunden.');
        const grader = a.exam.examinerIds.includes(actor.userId) || (await this.perms.has(actor.userId, 'exam.grade'));
        if (a.personnel.userId !== actor.userId && !grader)
            throw new errors_1.AppError('NOT_FOUND', 'Versuch nicht gefunden.');
        const qs = a.exam.questions.filter((q) => a.questionIds.includes(q.id));
        const showResult = grader || (a.status === 'GRADED' && a.exam.showResult);
        return {
            id: a.id, examId: a.examId, title: a.exam.title, description: a.exam.description, status: a.status, startedAt: a.startedAt, submittedAt: a.submittedAt, timeLimitMin: a.exam.timeLimitMin, passPercent: a.exam.passPercent,
            name: a.personnel.user.displayName, answers: a.answers, grader,
            questions: qs.map((q) => ({ id: q.id, type: q.type, text: q.text, options: q.options, points: q.points, ...(grader ? { correct: q.correct } : {}) })),
            result: showResult ? { score: a.score, maxScore: a.maxScore, passed: a.passed, feedback: a.feedback } : a.status === 'GRADED' ? { passed: a.passed } : null,
        };
    }
    /** Antworten zwischenspeichern (Autosave während der Prüfung). */
    async saveAnswers(actor, attemptId, answers) {
        const a = await this.prisma.hrExamAttempt.findUnique({ where: { id: attemptId }, include: { exam: true, personnel: { select: { userId: true } } } });
        if (!a || a.personnel.userId !== actor.userId)
            throw new errors_1.AppError('NOT_FOUND', 'Versuch nicht gefunden.');
        if (a.status !== 'IN_PROGRESS')
            throw new errors_1.AppError('CONFLICT', 'Dieser Versuch ist schon abgegeben.');
        if (this.timedOut(a.startedAt, a.exam.timeLimitMin))
            return this.submit(actor, attemptId, a.answers, true);
        await this.prisma.hrExamAttempt.update({ where: { id: attemptId }, data: { answers: answers } });
        return { saved: true };
    }
    /** Abgeben: automatische Bewertung (ohne Freitext) oder „wartet auf Prüfer“. */
    async submit(actor, attemptId, answers, forced = false) {
        const a = await this.prisma.hrExamAttempt.findUnique({ where: { id: attemptId }, include: { exam: true, personnel: { select: { userId: true } } } });
        if (!a || (!forced && a.personnel.userId !== actor.userId))
            throw new errors_1.AppError('NOT_FOUND', 'Versuch nicht gefunden.');
        if (a.status !== 'IN_PROGRESS')
            throw new errors_1.AppError('CONFLICT', 'Dieser Versuch ist schon abgegeben.');
        const final = this.timedOut(a.startedAt, a.exam.timeLimitMin) ? a.answers : answers;
        const qs = a.exam.questions.filter((q) => a.questionIds.includes(q.id));
        const scores = qs.map((q) => (0, shared_1.gradeAnswer)(q, final[q.id]));
        const maxScore = qs.reduce((n, q) => n + q.points, 0);
        const auto = a.exam.autoGrade && scores.every((s) => s !== null);
        const score = scores.reduce((n, s) => n + (s ?? 0), 0);
        const passed = auto ? maxScore > 0 && (score / maxScore) * 100 >= a.exam.passPercent : null;
        await this.prisma.hrExamAttempt.update({ where: { id: attemptId }, data: { answers: final, submittedAt: new Date(), status: auto ? 'GRADED' : 'SUBMITTED', ...(auto ? { score, maxScore, passed, gradedAt: new Date() } : { maxScore }) } });
        await this.core.audit.record(actor, { action: forced ? 'exam.timeout' : 'exam.submit', module: 'exam', entityType: 'HrExamAttempt', entityId: attemptId, after: auto ? { score, maxScore, passed } : { waiting: true } });
        if (auto)
            await this.afterGrade(attemptId);
        return this.view(attemptId, actor);
    }
    /** Manuelle Bewertung (Prüfer der Prüfung oder exam.grade). */
    async grade(actor, attemptId, d) {
        const a = await this.prisma.hrExamAttempt.findUnique({ where: { id: attemptId }, include: { exam: true, personnel: { select: { userId: true } } } });
        if (!a)
            throw new errors_1.AppError('NOT_FOUND', 'Versuch nicht gefunden.');
        if (!a.exam.examinerIds.includes(actor.userId) && !(await this.perms.has(actor.userId, 'exam.grade')))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Dafür fehlt dir die Berechtigung.');
        if (a.personnel.userId === actor.userId)
            throw new errors_1.AppError('CONFLICT', 'Eigene Prüfungen kannst du nicht bewerten.');
        if (a.status === 'IN_PROGRESS')
            throw new errors_1.AppError('CONFLICT', 'Der Versuch ist noch nicht abgegeben.');
        const qs = a.exam.questions.filter((q) => a.questionIds.includes(q.id));
        const answers = a.answers;
        const score = qs.reduce((n, q) => n + Math.max(0, Math.min(q.points, d.scores[q.id] ?? (0, shared_1.gradeAnswer)(q, answers[q.id]) ?? 0)), 0);
        const maxScore = qs.reduce((n, q) => n + q.points, 0);
        const passed = maxScore > 0 && (score / maxScore) * 100 >= a.exam.passPercent;
        await this.prisma.hrExamAttempt.update({ where: { id: attemptId }, data: { score, maxScore, passed, status: 'GRADED', gradedById: actor.userId, gradedAt: new Date(), feedback: d.feedback ?? null } });
        await this.core.audit.record(actor, { action: 'exam.grade', module: 'exam', entityType: 'HrExamAttempt', entityId: attemptId, after: { score, maxScore, passed } });
        await this.afterGrade(attemptId);
        return this.view(attemptId, actor);
    }
    /** Ergebnis in die Personalakte übernehmen; bestandene Prüfung → verknüpfte Ausbildung „in Bearbeitung“ markieren. */
    async afterGrade(attemptId) {
        const a = await this.prisma.hrExamAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { exam: true, personnel: { include: { user: { select: { displayName: true } } } } } });
        const pct = a.maxScore ? Math.round(((a.score ?? 0) / a.maxScore) * 100) : 0;
        await this.prisma.personnelRecord.create({ data: { personnelId: a.personnelId, type: 'EXAM', summary: `Prüfung „${a.exam.title}“: ${a.passed ? 'bestanden' : 'nicht bestanden'} (${pct} %)`, data: { examId: a.examId, attemptId: a.id, score: a.score, maxScore: a.maxScore, passed: a.passed }, createdById: a.gradedById ?? a.personnel.userId } });
        if (a.passed) {
            await this.core.notify('exam.passed', { memberUserId: a.personnel.userId, title: `📝 Prüfung bestanden: ${a.exam.title}`, entityType: 'Personnel', entityId: a.personnelId, publicText: `**${a.personnel.user.displayName}** hat die Prüfung **${a.exam.title}** bestanden.`, dmText: `Glückwunsch! Du hast die Prüfung **${a.exam.title}** bestanden (${pct} %).`, color: 0x22c55e });
            if (a.exam.trainingId) {
                const t = await this.prisma.hrTrainingProgress.findUnique({ where: { trainingId_personnelId: { trainingId: a.exam.trainingId, personnelId: a.personnelId } } });
                if (!t || t.status === 'NOT_STARTED')
                    await this.prisma.hrTrainingProgress.upsert({ where: { trainingId_personnelId: { trainingId: a.exam.trainingId, personnelId: a.personnelId } }, create: { trainingId: a.exam.trainingId, personnelId: a.personnelId, status: 'IN_PROGRESS', progress: 80, startedAt: new Date() }, update: { status: 'IN_PROGRESS', progress: Math.max(t?.progress ?? 0, 80) } });
            }
        }
    }
    /** Abgegebene Versuche, die noch bewertet werden müssen, bzw. alle Versuche einer Prüfung. */
    async attempts(actor, examId) {
        if (!(await this.perms.has(actor.userId, 'exam.grade')) && !(await this.perms.has(actor.userId, 'exam.manage'))) {
            const own = await this.prisma.hrExam.findMany({ where: { examinerIds: { has: actor.userId } }, select: { id: true } });
            if (!own.length)
                throw new errors_1.AppError('PERMISSION_DENIED', 'Dafür fehlt dir die Berechtigung.');
            examId = examId && own.some((e) => e.id === examId) ? examId : undefined;
            if (!examId)
                return this.prisma.hrExamAttempt.findMany({ where: { examId: { in: own.map((e) => e.id) } }, include: { exam: { select: { title: true } }, personnel: { select: { user: { select: { displayName: true } } } } }, orderBy: { startedAt: 'desc' }, take: 200 }).then((l) => l.map((a) => ({ ...a, answers: undefined })));
        }
        return this.prisma.hrExamAttempt.findMany({ where: examId ? { examId } : {}, include: { exam: { select: { title: true } }, personnel: { select: { user: { select: { displayName: true } } } } }, orderBy: { startedAt: 'desc' }, take: 200 }).then((l) => l.map((a) => ({ ...a, answers: undefined })));
    }
};
exports.HrTrainingService = HrTrainingService;
exports.HrTrainingService = HrTrainingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [hr_core_service_1.HrCoreService, permission_service_1.PermissionService])
], HrTrainingService);
//# sourceMappingURL=hr-training.service.js.map