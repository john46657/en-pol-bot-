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
exports.HrTrainingService = exports.TRAINING_STATUSES = exports.trainingSchema = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const permission_service_1 = require("../authz/permission.service");
const errors_1 = require("../common/errors");
const hr_core_service_1 = require("./hr-core.service");
exports.trainingSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(100), description: zod_1.z.string().max(3000).nullable().default(null), requirements: zod_1.z.string().max(1000).nullable().default(null),
    instructorIds: zod_1.z.array(zod_1.z.string().uuid()).max(30).default([]), duration: zod_1.z.string().max(60).nullable().default(null), active: zod_1.z.boolean().default(true), examRequired: zod_1.z.boolean().default(false),
    examId: zod_1.z.string().uuid().nullable().default(null), certificate: zod_1.z.boolean().default(true), audience: zod_1.z.string().max(200).nullable().default(null), requiredRoleId: zod_1.z.string().regex(/^\d{15,25}$/).nullable().default(null),
    validDays: zod_1.z.number().int().min(1).max(3650).nullable().default(null),
    modules: zod_1.z.array(zod_1.z.string().trim().min(1).max(100)).max(50).default([]).refine((m) => new Set(m).size === m.length, 'Jedes Modul darf nur einmal vorkommen.'),
});
exports.TRAINING_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'PASSED', 'FAILED', 'ABORTED', 'EXPIRED'];
const CERT = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Fortschritt in Prozent aus den abgehakten Modulen (nur Module, die es in der Ausbildung noch gibt). */
const moduleState = (modules, done) => {
    const d = modules.filter((m) => done.includes(m));
    return { doneModules: d, progress: modules.length ? Math.round((d.length / modules.length) * 100) : 0 };
};
const certNo = () => `Z-${new Date().getUTCFullYear()}-${Array.from({ length: 6 }, () => CERT[(0, node_crypto_1.randomInt)(CERT.length)]).join('')}`;
/** Ausbildungen (mit Fortschritt und Zertifikat). Prüfungen: hr-exam.service.ts */
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
        // Module geändert → Fortschritt der laufenden Ausbildungen neu berechnen (gelöschte Module zählen nicht mehr)
        if (id && t.modules.length) {
            for (const r of await this.prisma.hrTrainingProgress.findMany({ where: { trainingId: id, status: { notIn: ['PASSED', 'EXPIRED'] } } })) {
                const m = moduleState(t.modules, r.doneModules);
                if (m.progress !== r.progress || m.doneModules.length !== r.doneModules.length)
                    await this.prisma.hrTrainingProgress.update({ where: { id: r.id }, data: m });
            }
        }
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
        if (d.status === 'PASSED' && t.examRequired && t.examId && !(await this.prisma.hrExamAttempt.count({ where: { examId: t.examId, personnelId: p.id, passed: true, status: 'GRADED' } })))
            throw new errors_1.AppError('CONFLICT', 'Für diese Ausbildung muss zuerst die Prüfung bestanden sein.');
        const before = await this.prisma.hrTrainingProgress.findUnique({ where: { trainingId_personnelId: { trainingId: t.id, personnelId: p.id } } });
        const passed = d.status === 'PASSED';
        // mit Modulen: Fortschritt kommt aus der Checkliste, „bestanden“ erst wenn alle Module abgehakt sind
        const mods = t.modules.length ? moduleState(t.modules, d.doneModules ?? before?.doneModules ?? []) : null;
        if (passed && mods && mods.doneModules.length < t.modules.length)
            throw new errors_1.AppError('CONFLICT', `Erst alle Module abhaken (${mods.doneModules.length}/${t.modules.length} erledigt).`);
        const progress = passed ? 100 : mods ? mods.progress : d.progress ?? before?.progress ?? 0;
        const data = {
            status: d.status, progress: Math.max(0, Math.min(100, progress)), ...(mods ? { doneModules: mods.doneModules } : {}), note: d.note ?? before?.note ?? null, examinerId: actor.userId,
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
        const attempt = r.training.examId ? await this.prisma.hrExamAttempt.findFirst({ where: { examId: r.training.examId, personnelId: r.personnelId, passed: true, status: 'GRADED' }, orderBy: { score: 'desc' } }) : null;
        return {
            certificateNo, name: r.personnel.user.displayName, roblox: r.personnel.user.robloxUsername, training: r.training.name, description: r.training.description,
            result: attempt?.score != null && attempt.maxScore ? `${Math.round((attempt.score / attempt.maxScore) * 100)} %` : 'Bestanden',
            date: r.completedAt, expiresAt: r.expiresAt, examiner: examiner?.displayName ?? '—', organisation: cfg.certificate.organisation, logo: cfg.certificate.logo, signature: cfg.certificate.signature, status: r.status,
        };
    }
};
exports.HrTrainingService = HrTrainingService;
exports.HrTrainingService = HrTrainingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [hr_core_service_1.HrCoreService, permission_service_1.PermissionService])
], HrTrainingService);
//# sourceMappingURL=hr-training.service.js.map