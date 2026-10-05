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
exports.AcademyService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const timeline_service_1 = require("../timeline/timeline.service");
const errors_1 = require("../common/errors");
let AcademyService = class AcademyService {
    prisma;
    audit;
    timeline;
    constructor(prisma, audit, timeline) {
        this.prisma = prisma;
        this.audit = audit;
        this.timeline = timeline;
    }
    courses() { return this.prisma.academyCourse.findMany({ include: { _count: { select: { enrollments: true } } }, orderBy: { title: 'asc' } }); }
    async createCourse(actor, d) {
        return this.prisma.$transaction(async (tx) => {
            const c = await tx.academyCourse.create({ data: d });
            await this.audit.record(actor, { action: 'academy.course.create', module: 'academy', entityType: 'AcademyCourse', entityId: c.id, after: c }, tx);
            return c;
        });
    }
    async enroll(actor, courseId, personnelId) {
        return this.prisma.$transaction(async (tx) => {
            if (!(await tx.academyCourse.findUnique({ where: { id: courseId } })))
                throw new errors_1.AppError('NOT_FOUND', 'Course not found.');
            if (!(await tx.personnel.findUnique({ where: { id: personnelId } })))
                throw new errors_1.AppError('NOT_FOUND', 'Personnel not found.');
            const e = await tx.academyEnrollment.upsert({ where: { courseId_personnelId: { courseId, personnelId } }, create: { courseId, personnelId }, update: {} });
            await this.audit.record(actor, { action: 'academy.enroll', module: 'academy', entityType: 'AcademyEnrollment', entityId: e.id, after: e }, tx);
            const p = await tx.personnel.findUniqueOrThrow({ where: { id: personnelId } });
            await tx.notification.create({ data: { userId: p.userId, type: 'ACADEMY_ASSIGNMENT', title: 'You were enrolled in an academy course', entityType: 'AcademyCourse', entityId: courseId } });
            return e;
        });
    }
    /** Bestehen wird serverseitig aus Punkten und Kurs-Schwelle berechnet, nie vom Client vorgegeben. Bestandene Kurse werden zur Qualifikation. */
    async grade(actor, enrollmentId, score) {
        return this.prisma.$transaction(async (tx) => {
            const e = await tx.academyEnrollment.findUnique({ where: { id: enrollmentId }, include: { course: true, personnel: true } });
            if (!e)
                throw new errors_1.AppError('NOT_FOUND', 'Enrollment not found.');
            if (e.personnel.userId === actor.userId)
                throw new errors_1.AppError('CONFLICT', 'You cannot grade yourself.');
            const passed = score >= e.course.passScore;
            const r = await tx.academyResult.create({ data: { enrollmentId, score, passed, gradedById: actor.userId } });
            if (passed && !e.personnel.qualifications.includes(e.course.title)) {
                await tx.personnel.update({ where: { id: e.personnelId }, data: { qualifications: { push: e.course.title } } });
            }
            await this.timeline.add(tx, { entityType: 'Personnel', entityId: e.personnelId, action: 'academy.result', summary: `${e.course.title}: ${score} (${passed ? 'passed' : 'failed'})`, actorId: actor.userId });
            await this.audit.record(actor, { action: 'academy.grade', module: 'academy', entityType: 'AcademyEnrollment', entityId: enrollmentId, after: r }, tx);
            return r;
        });
    }
};
exports.AcademyService = AcademyService;
exports.AcademyService = AcademyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, timeline_service_1.TimelineService])
], AcademyService);
//# sourceMappingURL=academy.service.js.map