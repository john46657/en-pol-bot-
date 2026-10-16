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
exports.HrExamService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const shared_1 = require("@enrp/shared");
const permission_service_1 = require("../authz/permission.service");
const errors_1 = require("../common/errors");
const hr_core_service_1 = require("./hr-core.service");
const GRACE_MS = 30_000;
const shuffled = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) {
    const j = (0, node_crypto_1.randomInt)(i + 1);
    [r[i], r[j]] = [r[j], r[i]];
} return r; };
const range = (n) => Array.from({ length: n }, (_, i) => i);
const pctOf = (score, max) => (score != null && max ? Math.round((score / max) * 100) : null);
const round = (n) => Math.round(n * 100) / 100;
const berlin = (d) => d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' });
/** Gemischt, aber nie zufällig genau die Lösung (bei Reihenfolge/Zuordnung). */
const derange = (n) => { let r = shuffled(range(n)); for (let i = 0; i < 5 && n > 1 && r.every((x, j) => x === j); i++)
    r = shuffled(range(n)); return r; };
/** Prüfungen: Verwaltung, Ablauf (Start → Zwischenspeichern → Abgabe), Bewertung, Annullieren und Auswertung. */
let HrExamService = class HrExamService {
    core;
    perms;
    constructor(core, perms) {
        this.core = core;
        this.perms = perms;
    }
    get prisma() { return this.core.prisma; }
    // ---------------- Rechte ----------------
    async gradesAll(userId) { return (await this.perms.has(userId, 'exam.grade')) || (await this.perms.has(userId, 'exam.manage')); }
    async canGrade(e, userId) { return e.examinerIds.includes(userId) || (await this.gradesAll(userId)); }
    /** Zielgruppe: leer = alle mit exam.view, sonst mindestens eine der Dashboard-Rollen. */
    async inAudience(roleIds, mine) { return !roleIds.length || (await mine()).some((r) => roleIds.includes(r)); }
    me(actor) { return this.prisma.personnel.findFirst({ where: { userId: actor.userId }, select: { id: true } }); }
    // ---------------- Hilfen ----------------
    timedOut(start, limit) { return !!limit && Date.now() > start.getTime() + limit * 60_000 + GRACE_MS; }
    /** Fragen eines Versuchs in der Reihenfolge des Versuchs (Schnappschuss; ältere Versuche: aktuelle Fragen der Prüfung). */
    questionsOf(a, e) {
        const pool = a.snapshot ? (0, shared_1.parseQuestions)(a.snapshot) : (0, shared_1.parseQuestions)(e.questions);
        const byId = new Map(pool.map((q) => [q.id, q]));
        return a.questionIds.flatMap((id) => byId.get(id) ?? []);
    }
    /** Nur bekannte Fragen, nur Text oder Textlisten, begrenzte Länge. */
    cleanAnswers(raw, ids) {
        const out = {};
        for (const id of ids) {
            const v = raw[id];
            if (Array.isArray(v))
                out[id] = v.slice(0, 20).map((x) => String(x ?? '').slice(0, 1000));
            else if (v != null && v !== '')
                out[id] = String(v).slice(0, 4000);
        }
        return out;
    }
    /** Zustand der Prüfung für eine Person (welche Aktion ist möglich, warum nicht). */
    state(e, mine, passedExamIds, hasProfile, titles) {
        const counted = mine.filter((a) => a.status !== 'IN_PROGRESS' && a.status !== 'VOIDED').sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
        const open = mine.find((a) => a.status === 'IN_PROGRESS');
        const last = counted[0];
        const now = Date.now();
        const s = (state, reason, nextTryAt) => ({ state, reason: reason ?? null, nextTryAt: nextTryAt?.toISOString() ?? null, openAttemptId: open?.id ?? null, attemptsUsed: counted.length, attemptsLeft: Math.max(0, e.maxAttempts - counted.length) });
        if (!hasProfile)
            return s('NO_PROFILE', 'Für Prüfungen brauchst du eine Personalakte.');
        if (open)
            return s('IN_PROGRESS');
        if (counted.some((a) => a.passed))
            return s('PASSED');
        if (counted.some((a) => a.status === 'SUBMITTED'))
            return s('PENDING', 'Dein letzter Versuch wird noch bewertet.');
        if (!e.active)
            return s('INACTIVE', 'Diese Prüfung ist zurzeit nicht freigegeben.');
        if (!(0, shared_1.parseQuestions)(e.questions).length)
            return s('NO_QUESTIONS', 'Diese Prüfung hat noch keine Fragen.');
        if (e.availableFrom && e.availableFrom.getTime() > now)
            return s('NOT_YET', `Verfügbar ab ${berlin(e.availableFrom)}.`, e.availableFrom);
        if (e.availableUntil && e.availableUntil.getTime() < now)
            return s('CLOSED', `Verfügbar bis ${berlin(e.availableUntil)} – der Zeitraum ist abgelaufen.`);
        if (e.requiredExamId && !passedExamIds.has(e.requiredExamId))
            return s('LOCKED', `Erst die Prüfung „${titles.get(e.requiredExamId) ?? 'Voraussetzung'}“ bestehen.`);
        if (counted.length >= e.maxAttempts)
            return s('NO_ATTEMPTS', `Keine Versuche mehr (${e.maxAttempts}).`);
        const lastAt = last ? (last.submittedAt ?? last.startedAt).getTime() : 0;
        if (last && e.retryHours && now - lastAt < e.retryHours * 3_600_000) {
            const next = new Date(lastAt + e.retryHours * 3_600_000);
            return s('WAITING', `Neuer Versuch ab ${berlin(next)}.`, next);
        }
        return s('AVAILABLE');
    }
    // ---------------- Übersicht ----------------
    async list(actor) {
        const uid = actor.userId;
        const [manage, gradeAll, exams, me] = await Promise.all([this.perms.has(uid, 'exam.manage'), this.gradesAll(uid), this.prisma.hrExam.findMany({ orderBy: [{ title: 'asc' }] }), this.me(actor)]);
        const mine = me ? await this.prisma.hrExamAttempt.findMany({ where: { personnelId: me.id, examId: { in: exams.map((e) => e.id) } }, select: { id: true, examId: true, status: true, passed: true, score: true, maxScore: true, startedAt: true, submittedAt: true } }) : [];
        const passedIds = new Set(mine.filter((a) => a.passed && a.status === 'GRADED').map((a) => a.examId));
        const titles = new Map(exams.map((e) => [e.id, e.title]));
        let roles = null;
        const myRoles = async () => (roles ??= await this.perms.roleIdsFor(uid));
        const visible = [];
        for (const e of exams)
            if (gradeAll || e.examinerIds.includes(uid) || (e.active && (await this.inAudience(e.audienceRoleIds, myRoles))))
                visible.push(e);
        const staffIds = visible.filter((e) => gradeAll || e.examinerIds.includes(uid)).map((e) => e.id);
        const all = staffIds.length ? await this.prisma.hrExamAttempt.findMany({ where: { examId: { in: staffIds }, status: { not: 'VOIDED' } }, select: { examId: true, personnelId: true, status: true, passed: true, score: true, maxScore: true } }) : [];
        const trainings = new Map((await this.prisma.hrTraining.findMany({ where: { id: { in: visible.flatMap((e) => (e.trainingId ? [e.trainingId] : [])) } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
        return visible.map((e) => {
            const qs = (0, shared_1.parseQuestions)(e.questions);
            const my = mine.filter((a) => a.examId === e.id);
            const staff = staffIds.includes(e.id);
            const own = my.filter((a) => a.status === 'GRADED').map((a) => pctOf(a.score, a.maxScore)).filter((p) => p !== null);
            const last = [...my].filter((a) => a.status !== 'IN_PROGRESS').sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
            return {
                id: e.id, title: e.title, description: e.description, instructions: e.instructions, category: e.category, active: e.active,
                questionTotal: qs.length, questionsPerAttempt: e.questionCount && e.questionCount < qs.length ? e.questionCount : qs.length,
                passPercent: e.passPercent, timeLimitMin: e.timeLimitMin, maxAttempts: e.maxAttempts, retryHours: e.retryHours, layout: e.layout, reviewMode: e.reviewMode, showResult: e.showResult,
                availableFrom: e.availableFrom, availableUntil: e.availableUntil, trainingId: e.trainingId, trainingName: e.trainingId ? trainings.get(e.trainingId) ?? null : null,
                requiredExamId: e.requiredExamId, requiredExamTitle: e.requiredExamId ? titles.get(e.requiredExamId) ?? null : null, updatedAt: e.updatedAt,
                canEdit: manage, canGrade: staff,
                me: { ...this.state(e, my, passedIds, !!me, titles), bestPercent: e.showResult && own.length ? Math.max(...own) : null, last: last ? { status: last.status, passed: last.passed, percent: e.showResult ? pctOf(last.score, last.maxScore) : null, at: last.submittedAt ?? last.startedAt } : null },
                stats: staff ? this.summary(all.filter((a) => a.examId === e.id)) : null,
            };
        });
    }
    summary(rows) {
        const graded = rows.filter((a) => a.status === 'GRADED');
        const people = new Set(rows.map((a) => a.personnelId));
        const passedPeople = new Set(graded.filter((a) => a.passed).map((a) => a.personnelId));
        const pcts = graded.map((a) => pctOf(a.score, a.maxScore)).filter((p) => p !== null);
        return {
            participants: people.size, attempts: rows.length, passed: passedPeople.size, pending: rows.filter((a) => a.status === 'SUBMITTED').length, running: rows.filter((a) => a.status === 'IN_PROGRESS').length,
            avgPercent: pcts.length ? Math.round(pcts.reduce((n, p) => n + p, 0) / pcts.length) : null,
            passRate: graded.length ? Math.round((graded.filter((a) => a.passed).length / graded.length) * 100) : null,
        };
    }
    /** Vollständige Prüfung mit Fragen (Editor/Prüfer). */
    async detail(actor, id) {
        const e = await this.prisma.hrExam.findUnique({ where: { id } });
        if (!e || !((await this.perms.has(actor.userId, 'exam.manage')) || (await this.canGrade(e, actor.userId))))
            throw new errors_1.AppError('NOT_FOUND', 'Prüfung nicht gefunden.');
        return { ...e, questions: (0, shared_1.parseQuestions)(e.questions), attemptCount: await this.prisma.hrExamAttempt.count({ where: { examId: id } }) };
    }
    // ---------------- Verwaltung ----------------
    async save(actor, d, id) {
        const problems = (0, shared_1.examProblems)(d);
        if (problems.length)
            throw new errors_1.AppError('VALIDATION_FAILED', `Prüfung unvollständig: ${problems.slice(0, 5).join(' · ')}${problems.length > 5 ? ' …' : ''}`);
        if (d.trainingId && !(await this.prisma.hrTraining.findUnique({ where: { id: d.trainingId }, select: { id: true } })))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Verknüpfte Ausbildung nicht gefunden.');
        if (d.requiredExamId && (d.requiredExamId === id || !(await this.prisma.hrExam.findUnique({ where: { id: d.requiredExamId }, select: { id: true } }))))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Die vorausgesetzte Prüfung ist ungültig.');
        const before = id ? await this.prisma.hrExam.findUnique({ where: { id } }) : null;
        if (id && !before)
            throw new errors_1.AppError('NOT_FOUND', 'Prüfung nicht gefunden.');
        const data = {
            ...d, category: d.category?.trim() || null, description: d.description?.trim() || null, instructions: d.instructions?.trim() || null,
            questions: d.questions, availableFrom: d.availableFrom ? new Date(d.availableFrom) : null, availableUntil: d.availableUntil ? new Date(d.availableUntil) : null,
        };
        const e = id ? await this.prisma.hrExam.update({ where: { id }, data }) : await this.prisma.hrExam.create({ data });
        await this.core.audit.record(actor, { action: id ? 'exam.update' : 'exam.create', module: 'exam', entityType: 'HrExam', entityId: e.id, before: before ? { title: before.title, questions: (0, shared_1.parseQuestions)(before.questions).length, active: before.active } : undefined, after: { title: e.title, questions: d.questions.length, active: e.active } });
        return { ...e, questions: d.questions };
    }
    async duplicate(actor, id) {
        const src = await this.prisma.hrExam.findUnique({ where: { id } });
        if (!src)
            throw new errors_1.AppError('NOT_FOUND', 'Prüfung nicht gefunden.');
        const rest = Object.fromEntries(Object.entries(src).filter(([k]) => !['id', 'serverId', 'createdAt', 'updatedAt'].includes(k)));
        const e = await this.prisma.hrExam.create({ data: { ...rest, title: `Kopie von ${src.title}`.slice(0, 120), active: false, questions: src.questions } });
        await this.core.audit.record(actor, { action: 'exam.duplicate', module: 'exam', entityType: 'HrExam', entityId: e.id, after: { from: id, title: e.title } });
        return e;
    }
    async remove(actor, id) {
        const e = await this.prisma.hrExam.delete({ where: { id } }).catch(() => null);
        if (!e)
            throw new errors_1.AppError('NOT_FOUND', 'Prüfung nicht gefunden.');
        await this.prisma.hrExam.updateMany({ where: { requiredExamId: id }, data: { requiredExamId: null } });
        await this.core.audit.record(actor, { action: 'exam.delete', module: 'exam', entityType: 'HrExam', entityId: id, before: { title: e.title } });
    }
    // ---------------- Ablauf ----------------
    /** Prüfung starten (oder laufenden Versuch fortsetzen). Liefert Fragen OHNE Lösungen. */
    async start(actor, examId) {
        const uid = actor.userId;
        const e = await this.prisma.hrExam.findUnique({ where: { id: examId } });
        if (!e || !((await this.inAudience(e.audienceRoleIds, () => this.perms.roleIdsFor(uid))) || (await this.canGrade(e, uid))))
            throw new errors_1.AppError('NOT_FOUND', 'Prüfung nicht verfügbar.');
        const me = await this.me(actor);
        if (!me)
            throw new errors_1.AppError('CONFLICT', 'Für Prüfungen brauchst du eine Personalakte.');
        const open = await this.prisma.hrExamAttempt.findFirst({ where: { examId, personnelId: me.id, status: 'IN_PROGRESS' } });
        if (open && !this.timedOut(open.startedAt, e.timeLimitMin))
            return this.view(open.id, actor);
        if (open)
            await this.submit(actor, open.id, (open.answers ?? {}), true);
        const mine = await this.prisma.hrExamAttempt.findMany({ where: { personnelId: me.id }, select: { id: true, examId: true, status: true, passed: true, score: true, maxScore: true, startedAt: true, submittedAt: true } });
        const req = e.requiredExamId ? await this.prisma.hrExam.findUnique({ where: { id: e.requiredExamId }, select: { id: true, title: true } }) : null;
        const st = this.state(e, mine.filter((a) => a.examId === examId), new Set(mine.filter((a) => a.passed && a.status === 'GRADED').map((a) => a.examId)), true, new Map(req ? [[req.id, req.title]] : []));
        if (st.state === 'PASSED')
            throw new errors_1.AppError('CONFLICT', 'Du hast diese Prüfung schon bestanden.');
        if (st.state !== 'AVAILABLE')
            throw new errors_1.AppError('CONFLICT', st.reason ?? 'Die Prüfung kann gerade nicht gestartet werden.');
        const all = (0, shared_1.parseQuestions)(e.questions);
        const limit = e.questionCount && e.questionCount < all.length ? e.questionCount : all.length;
        let pick = e.shuffleQuestions || limit < all.length ? shuffled(all).slice(0, limit) : all;
        if (!e.shuffleQuestions)
            pick = all.filter((q) => pick.includes(q)); // Zufallsauswahl, aber in der Reihenfolge der Prüfung
        const sh = { o: {}, m: {} };
        for (const q of pick) {
            if (q.type === 'ORDER')
                sh.o[q.id] = derange(q.options.length);
            if (q.type === 'MATCH') {
                sh.m[q.id] = derange(q.matches.length);
                if (e.shuffleOptions)
                    sh.o[q.id] = shuffled(range(q.options.length));
            }
            if (e.shuffleOptions && (q.type === 'SINGLE' || q.type === 'MULTI'))
                sh.o[q.id] = shuffled(range(q.options.length));
        }
        const a = await this.prisma.hrExamAttempt.create({ data: { examId, personnelId: me.id, questionIds: pick.map((q) => q.id), snapshot: pick, shuffle: sh } });
        await this.core.audit.record(actor, { action: 'exam.start', module: 'exam', entityType: 'HrExamAttempt', entityId: a.id });
        return this.view(a.id, actor);
    }
    /** Versuch ansehen: eigener (ohne Lösungen; nach der Bewertung je nach Einsicht) oder als Prüfer (mit Lösungen). */
    async view(attemptId, actor) {
        const a = await this.prisma.hrExamAttempt.findUnique({ where: { id: attemptId }, include: { exam: true, personnel: { select: { userId: true, rank: true, user: { select: { displayName: true } } } } } });
        if (!a)
            throw new errors_1.AppError('NOT_FOUND', 'Versuch nicht gefunden.');
        const owner = a.personnel.userId === actor.userId;
        const grader = !owner && (await this.canGrade(a.exam, actor.userId));
        if (!owner && !grader)
            throw new errors_1.AppError('NOT_FOUND', 'Versuch nicht gefunden.');
        const qs = this.questionsOf(a, a.exam);
        const sh = (a.shuffle ?? {});
        const graded = a.status === 'GRADED';
        const review = grader ? 'SOLUTIONS' : graded ? a.exam.reviewMode : 'NONE';
        const answers = (a.answers ?? {});
        const stored = (a.questionScores ?? null);
        const order = (items, o) => (o && o.length === items.length ? o : range(items.length)).map((i) => ({ i, text: items[i] }));
        const showAnswers = a.status === 'IN_PROGRESS' || grader || review !== 'NONE';
        const showScore = grader || (graded && a.exam.showResult);
        const names = await this.prisma.user.findMany({ where: { id: { in: [a.gradedById, a.voidedById].filter((x) => !!x) } }, select: { id: true, displayName: true } });
        const nameOf = (id) => (id ? names.find((u) => u.id === id)?.displayName ?? '—' : null);
        return {
            id: a.id, examId: a.examId, title: a.exam.title, description: a.exam.description, instructions: a.exam.instructions, status: a.status,
            startedAt: a.startedAt, submittedAt: a.submittedAt, serverNow: new Date(), deadline: a.exam.timeLimitMin ? new Date(a.startedAt.getTime() + a.exam.timeLimitMin * 60_000) : null,
            timeLimitMin: a.exam.timeLimitMin, passPercent: a.exam.passPercent, layout: a.exam.layout, reviewMode: review,
            name: a.personnel.user.displayName, rank: a.personnel.rank, owner, grader,
            answers: showAnswers ? answers : null, flagged: owner ? a.flagged : [],
            questions: qs.map((q) => {
                const auto = (0, shared_1.gradeAnswer)(q, answers[q.id]);
                return {
                    id: q.id, type: q.type, text: q.type === 'GAP' ? (0, shared_1.maskGaps)(q.text) : q.text, image: q.image, points: q.points, partial: q.partial,
                    options: q.type === 'YESNO' || q.type === 'TEXT' || q.type === 'NUMBER' || q.type === 'GAP' ? [] : order(q.options, sh.o?.[q.id]),
                    matches: q.type === 'MATCH' ? order(q.matches, sh.m?.[q.id]) : [],
                    ...(graded && review !== 'NONE' && showScore ? { earned: stored?.[q.id] ?? auto } : {}),
                    ...(graded && review !== 'NONE' && !showScore ? { correctAnswer: (stored?.[q.id] ?? auto ?? 0) >= q.points } : {}),
                    ...(review === 'SOLUTIONS' ? { correct: q.correct, gaps: q.type === 'GAP' ? (0, shared_1.gapAnswers)(q.text) : undefined, tolerance: q.tolerance, explanation: q.explanation } : {}),
                    ...(grader ? { auto } : {}),
                };
            }),
            result: graded ? (showScore ? { score: a.score, maxScore: a.maxScore, percent: pctOf(a.score, a.maxScore), passed: a.passed, feedback: a.feedback } : { passed: a.passed, feedback: a.feedback }) : null,
            gradedBy: grader ? nameOf(a.gradedById) : null, gradedAt: a.gradedAt,
            voided: a.status === 'VOIDED' ? { reason: a.voidReason, at: a.voidedAt, by: grader ? nameOf(a.voidedById) : null } : null,
        };
    }
    /** Antworten und markierte Fragen zwischenspeichern (Autosave während der Prüfung). */
    async saveAnswers(actor, attemptId, answers, flagged) {
        const a = await this.prisma.hrExamAttempt.findUnique({ where: { id: attemptId }, include: { exam: true, personnel: { select: { userId: true } } } });
        if (!a || a.personnel.userId !== actor.userId)
            throw new errors_1.AppError('NOT_FOUND', 'Versuch nicht gefunden.');
        if (a.status !== 'IN_PROGRESS')
            throw new errors_1.AppError('CONFLICT', 'Dieser Versuch ist schon abgegeben.');
        if (this.timedOut(a.startedAt, a.exam.timeLimitMin))
            return this.submit(actor, attemptId, a.answers, true);
        await this.prisma.hrExamAttempt.update({ where: { id: attemptId }, data: { answers: this.cleanAnswers(answers, a.questionIds), ...(flagged ? { flagged: flagged.filter((f) => a.questionIds.includes(f)) } : {}) } });
        return { saved: true };
    }
    /** Abgeben: automatische Bewertung oder „wartet auf Prüfer“ (dann werden die Prüfer benachrichtigt). */
    async submit(actor, attemptId, answers, forced = false) {
        const a = await this.prisma.hrExamAttempt.findUnique({ where: { id: attemptId }, include: { exam: true, personnel: { select: { userId: true, user: { select: { displayName: true } } } } } });
        if (!a || (!forced && a.personnel.userId !== actor.userId))
            throw new errors_1.AppError('NOT_FOUND', 'Versuch nicht gefunden.');
        if (a.status !== 'IN_PROGRESS')
            throw new errors_1.AppError('CONFLICT', 'Dieser Versuch ist schon abgegeben.');
        // nach Ablauf der Zeit zählt nur, was rechtzeitig zwischengespeichert wurde
        const final = this.cleanAnswers(this.timedOut(a.startedAt, a.exam.timeLimitMin) ? a.answers : answers, a.questionIds);
        const qs = this.questionsOf(a, a.exam);
        const scores = qs.map((q) => (0, shared_1.gradeAnswer)(q, final[q.id]));
        const maxScore = qs.reduce((n, q) => n + q.points, 0);
        const auto = a.exam.autoGrade && scores.every((s) => s !== null);
        const score = round(scores.reduce((n, s) => n + (s ?? 0), 0));
        const passed = auto ? maxScore > 0 && (score / maxScore) * 100 >= a.exam.passPercent : null;
        const questionScores = Object.fromEntries(qs.map((q, i) => [q.id, scores[i] ?? 0]));
        await this.prisma.hrExamAttempt.update({ where: { id: attemptId }, data: { answers: final, submittedAt: new Date(), status: auto ? 'GRADED' : 'SUBMITTED', maxScore, ...(auto ? { score, passed, gradedAt: new Date(), questionScores } : {}) } });
        await this.core.audit.record(actor, { action: forced ? 'exam.timeout' : 'exam.submit', module: 'exam', entityType: 'HrExamAttempt', entityId: attemptId, after: auto ? { score, maxScore, passed } : { waiting: true } });
        if (auto)
            await this.afterGrade(attemptId, false);
        else if (a.exam.notifyExaminers) {
            const who = a.personnel.user.displayName;
            const examiners = a.exam.examinerIds.filter((id) => id !== a.personnel.userId);
            if (examiners.length)
                await this.prisma.notification.createMany({ data: examiners.map((userId) => ({ userId, type: 'PERSONNEL', title: `📝 Zu bewerten: ${a.exam.title}`.slice(0, 200), body: `${who} hat die Prüfung abgegeben.`, entityType: 'HrExamAttempt', entityId: attemptId })) });
            await this.core.notify('exam.submitted', { title: `📝 Prüfung abgegeben: ${a.exam.title}`, body: `${who} wartet auf die Bewertung.`, entityType: 'HrExamAttempt', entityId: attemptId, publicText: `**${who}** hat die Prüfung **${a.exam.title}** abgegeben – sie wartet auf die Bewertung im Dashboard.`, color: 0x3b82f6 });
        }
        return this.view(attemptId, actor);
    }
    /** Manuelle Bewertung (Prüfer der Prüfung oder exam.grade/exam.manage). Auch Neubewertung. */
    async grade(actor, attemptId, d) {
        const a = await this.prisma.hrExamAttempt.findUnique({ where: { id: attemptId }, include: { exam: true, personnel: { select: { userId: true } } } });
        if (!a)
            throw new errors_1.AppError('NOT_FOUND', 'Versuch nicht gefunden.');
        if (!(await this.canGrade(a.exam, actor.userId)))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Dafür fehlt dir die Berechtigung.');
        if (a.personnel.userId === actor.userId)
            throw new errors_1.AppError('CONFLICT', 'Eigene Prüfungen kannst du nicht bewerten.');
        if (a.status === 'IN_PROGRESS')
            throw new errors_1.AppError('CONFLICT', 'Der Versuch ist noch nicht abgegeben.');
        if (a.status === 'VOIDED')
            throw new errors_1.AppError('CONFLICT', 'Annullierte Versuche werden nicht bewertet.');
        const qs = this.questionsOf(a, a.exam);
        const answers = a.answers;
        const questionScores = Object.fromEntries(qs.map((q) => [q.id, round(Math.max(0, Math.min(q.points, d.scores[q.id] ?? (0, shared_1.gradeAnswer)(q, answers[q.id]) ?? 0)))]));
        const score = round(Object.values(questionScores).reduce((n, s) => n + s, 0));
        const maxScore = qs.reduce((n, q) => n + q.points, 0);
        const passed = maxScore > 0 && (score / maxScore) * 100 >= a.exam.passPercent;
        const wasPassed = a.status === 'GRADED' && a.passed === true;
        await this.prisma.hrExamAttempt.update({ where: { id: attemptId }, data: { score, maxScore, passed, questionScores, status: 'GRADED', gradedById: actor.userId, gradedAt: new Date(), feedback: d.feedback?.trim() || null } });
        await this.core.audit.record(actor, { action: a.status === 'GRADED' ? 'exam.regrade' : 'exam.grade', module: 'exam', entityType: 'HrExamAttempt', entityId: attemptId, before: { score: a.score, passed: a.passed }, after: { score, maxScore, passed } });
        await this.prisma.notification.create({ data: { userId: a.personnel.userId, type: 'PERSONNEL', title: `📝 Prüfung bewertet: ${a.exam.title}`.slice(0, 200), body: passed ? 'Bestanden 🟢' : 'Nicht bestanden 🔴', entityType: 'HrExamAttempt', entityId: attemptId } });
        // offene „Zu bewerten“-Hinweise der Prüfer erledigt
        await this.prisma.notification.updateMany({ where: { entityType: 'HrExamAttempt', entityId: attemptId, readAt: null, userId: { not: a.personnel.userId } }, data: { readAt: new Date() } });
        await this.afterGrade(attemptId, wasPassed);
        return this.view(attemptId, actor);
    }
    /** Versuch annullieren: zählt nicht mehr als Versuch (z. B. Täuschung, technische Probleme → neuer Versuch möglich). */
    async void(actor, attemptId, reason) {
        const a = await this.prisma.hrExamAttempt.findUnique({ where: { id: attemptId }, include: { exam: true, personnel: { select: { userId: true } } } });
        if (!a)
            throw new errors_1.AppError('NOT_FOUND', 'Versuch nicht gefunden.');
        if (!(await this.canGrade(a.exam, actor.userId)))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Dafür fehlt dir die Berechtigung.');
        if (a.personnel.userId === actor.userId)
            throw new errors_1.AppError('CONFLICT', 'Eigene Versuche kannst du nicht annullieren.');
        if (a.status === 'VOIDED')
            throw new errors_1.AppError('CONFLICT', 'Der Versuch ist schon annulliert.');
        await this.prisma.$transaction(async (tx) => {
            await tx.hrExamAttempt.update({ where: { id: attemptId }, data: { status: 'VOIDED', voidReason: reason, voidedById: actor.userId, voidedAt: new Date(), submittedAt: a.submittedAt ?? new Date() } });
            await tx.personnelRecord.create({ data: { personnelId: a.personnelId, type: 'EXAM', summary: `Prüfungsversuch „${a.exam.title}“ annulliert`, details: reason, data: { examId: a.examId, attemptId, voided: true }, createdById: actor.userId } });
            await tx.notification.create({ data: { userId: a.personnel.userId, type: 'PERSONNEL', title: `📝 Prüfungsversuch annulliert: ${a.exam.title}`.slice(0, 200), body: `${reason} – der Versuch zählt nicht.`.slice(0, 1000), entityType: 'HrExamAttempt', entityId: attemptId } });
            await this.core.audit.record(actor, { action: 'exam.void', module: 'exam', entityType: 'HrExamAttempt', entityId: attemptId, before: { status: a.status, passed: a.passed }, after: { status: 'VOIDED', reason } }, tx);
        });
        return this.view(attemptId, actor);
    }
    /** Ergebnis in die Personalakte übernehmen; bestanden → Benachrichtigung und verknüpfte Ausbildung „in Bearbeitung“. */
    async afterGrade(attemptId, wasPassed) {
        const a = await this.prisma.hrExamAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { exam: true, personnel: { include: { user: { select: { displayName: true } } } } } });
        const pct = pctOf(a.score, a.maxScore) ?? 0;
        await this.prisma.personnelRecord.create({ data: { personnelId: a.personnelId, type: 'EXAM', summary: `Prüfung „${a.exam.title}“: ${a.passed ? 'bestanden' : 'nicht bestanden'} (${pct} %)`, data: { examId: a.examId, attemptId: a.id, score: a.score, maxScore: a.maxScore, passed: a.passed }, createdById: a.gradedById ?? a.personnel.userId } });
        if (!a.passed || wasPassed)
            return;
        await this.core.notify('exam.passed', { memberUserId: a.personnel.userId, title: `📝 Prüfung bestanden: ${a.exam.title}`, entityType: 'Personnel', entityId: a.personnelId, publicText: `**${a.personnel.user.displayName}** hat die Prüfung **${a.exam.title}** bestanden.`, dmText: `Glückwunsch! Du hast die Prüfung **${a.exam.title}** bestanden (${pct} %).`, color: 0x22c55e });
        if (a.exam.trainingId) {
            const t = await this.prisma.hrTrainingProgress.findUnique({ where: { trainingId_personnelId: { trainingId: a.exam.trainingId, personnelId: a.personnelId } } });
            // ohne Module gilt die Prüfung als großer Teil des Fortschritts; mit Modulen zählt nur die Checkliste
            const withModules = !!(await this.prisma.hrTraining.findUnique({ where: { id: a.exam.trainingId }, select: { modules: true } }))?.modules.length;
            const progress = withModules ? t?.progress ?? 0 : Math.max(t?.progress ?? 0, 80);
            if (!t || t.status === 'NOT_STARTED')
                await this.prisma.hrTrainingProgress.upsert({ where: { trainingId_personnelId: { trainingId: a.exam.trainingId, personnelId: a.personnelId } }, create: { trainingId: a.exam.trainingId, personnelId: a.personnelId, status: 'IN_PROGRESS', progress, startedAt: new Date() }, update: { status: 'IN_PROGRESS', progress } });
        }
    }
    // ---------------- Bewertung & Auswertung ----------------
    /** Versuche (ohne Antworten) für Prüfer: alle Prüfungen mit exam.grade/exam.manage, sonst nur die eigenen Prüfer-Prüfungen. */
    async attempts(actor, q) {
        const uid = actor.userId;
        const gradeAll = await this.gradesAll(uid);
        const exams = await this.prisma.hrExam.findMany({ where: gradeAll ? {} : { examinerIds: { has: uid } }, select: { id: true } });
        if (!gradeAll && !exams.length)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Dafür fehlt dir die Berechtigung.');
        const ids = exams.map((e) => e.id).filter((id) => !q.examId || id === q.examId);
        const rows = await this.prisma.hrExamAttempt.findMany({
            where: { examId: { in: ids }, ...(q.status ? { status: q.status } : {}) }, orderBy: [{ submittedAt: { sort: 'desc', nulls: 'first' } }, { startedAt: 'desc' }], take: 500,
            select: { id: true, examId: true, personnelId: true, status: true, score: true, maxScore: true, passed: true, startedAt: true, submittedAt: true, gradedAt: true, voidReason: true, exam: { select: { title: true, passPercent: true } }, personnel: { select: { rank: true, userId: true, user: { select: { displayName: true } } } } },
        });
        return rows.map((a) => ({ ...a, percent: pctOf(a.score, a.maxScore), own: a.personnel.userId === uid }));
    }
    /** Auswertung einer Prüfung: Kennzahlen, Ergebnis je Person, Versuche, Fragenstatistik. */
    async results(actor, examId) {
        const e = await this.prisma.hrExam.findUnique({ where: { id: examId } });
        if (!e || !(await this.canGrade(e, actor.userId)))
            throw new errors_1.AppError('NOT_FOUND', 'Prüfung nicht gefunden.');
        const rows = await this.prisma.hrExamAttempt.findMany({ where: { examId }, orderBy: { startedAt: 'desc' }, include: { personnel: { select: { id: true, rank: true, userId: true, user: { select: { displayName: true } } } } } });
        const valid = rows.filter((a) => a.status !== 'VOIDED');
        const graded = valid.filter((a) => a.status === 'GRADED');
        const durations = valid.filter((a) => a.submittedAt).map((a) => (a.submittedAt.getTime() - a.startedAt.getTime()) / 60_000);
        const people = new Map();
        for (const a of valid) {
            const p = people.get(a.personnelId) ?? { personnelId: a.personnelId, name: a.personnel.user.displayName, rank: a.personnel.rank, attempts: 0, bestPercent: null, passed: false, pending: false, running: false, lastAt: a.startedAt };
            if (a.status !== 'IN_PROGRESS')
                p.attempts++;
            const pc = a.status === 'GRADED' ? pctOf(a.score, a.maxScore) : null;
            if (pc !== null)
                p.bestPercent = Math.max(p.bestPercent ?? 0, pc);
            p.passed ||= a.passed === true && a.status === 'GRADED';
            p.pending ||= a.status === 'SUBMITTED';
            p.running ||= a.status === 'IN_PROGRESS';
            if ((a.submittedAt ?? a.startedAt) > p.lastAt)
                p.lastAt = a.submittedAt ?? a.startedAt;
            people.set(a.personnelId, p);
        }
        // Fragenstatistik über alle bewerteten Versuche (Schnappschuss des Versuchs)
        const current = (0, shared_1.parseQuestions)(e.questions);
        const qstat = new Map();
        for (const q of current)
            qstat.set(q.id, { id: q.id, text: q.type === 'GAP' ? (0, shared_1.maskGaps)(q.text) : q.text, type: q.type, points: q.points, asked: 0, earned: 0, full: 0 });
        for (const a of graded) {
            const stored = (a.questionScores ?? null);
            for (const q of this.questionsOf(a, e)) {
                const s = qstat.get(q.id) ?? { id: q.id, text: q.type === 'GAP' ? (0, shared_1.maskGaps)(q.text) : q.text, type: q.type, points: q.points, asked: 0, earned: 0, full: 0 };
                const got = stored?.[q.id] ?? (0, shared_1.gradeAnswer)(q, a.answers[q.id]) ?? 0;
                s.asked++;
                s.earned += q.points ? got / q.points : 0;
                if (got >= q.points)
                    s.full++;
                qstat.set(q.id, s);
            }
        }
        return {
            exam: { id: e.id, title: e.title, passPercent: e.passPercent, maxAttempts: e.maxAttempts, questionTotal: current.length, category: e.category },
            stats: { ...this.summary(valid), voided: rows.length - valid.length, avgMinutes: durations.length ? Math.round(durations.reduce((n, d) => n + d, 0) / durations.length) : null, bestPercent: graded.length ? Math.max(...graded.map((a) => pctOf(a.score, a.maxScore) ?? 0)) : null },
            people: [...people.values()].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime()),
            attempts: rows.map((a) => ({ id: a.id, personnelId: a.personnelId, name: a.personnel.user.displayName, rank: a.personnel.rank, own: a.personnel.userId === actor.userId, status: a.status, score: a.score, maxScore: a.maxScore, percent: pctOf(a.score, a.maxScore), passed: a.passed, startedAt: a.startedAt, submittedAt: a.submittedAt, gradedAt: a.gradedAt, voidReason: a.voidReason, minutes: a.submittedAt ? Math.round((a.submittedAt.getTime() - a.startedAt.getTime()) / 60_000) : null })),
            questions: [...qstat.values()].map((s) => ({ id: s.id, text: s.text, type: s.type, points: s.points, asked: s.asked, avgPercent: s.asked ? Math.round((s.earned / s.asked) * 100) : null, correctRate: s.asked ? Math.round((s.full / s.asked) * 100) : null })),
        };
    }
};
exports.HrExamService = HrExamService;
exports.HrExamService = HrExamService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [hr_core_service_1.HrCoreService, permission_service_1.PermissionService])
], HrExamService);
//# sourceMappingURL=hr-exam.service.js.map