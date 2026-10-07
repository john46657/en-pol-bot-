import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { AppError } from '../common/errors';

@Injectable()
export class AcademyService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly timeline: TimelineService) {}

  courses() { return this.prisma.academyCourse.findMany({ include: { _count: { select: { enrollments: true } } }, orderBy: { title: 'asc' } }); }

  async createCourse(actor: Actor, d: { title: string; description?: string; passScore?: number; instructorId?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.academyCourse.create({ data: d });
      await this.audit.record(actor, { action: 'academy.course.create', module: 'academy', entityType: 'AcademyCourse', entityId: c.id, after: c }, tx);
      return c;
    });
  }

  async enroll(actor: Actor, courseId: string, personnelId: string) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await tx.academyCourse.findUnique({ where: { id: courseId } }))) throw new AppError('NOT_FOUND', 'Kurs nicht gefunden.');
      if (!(await tx.personnel.findUnique({ where: { id: personnelId } }))) throw new AppError('NOT_FOUND', 'Personalakte nicht gefunden.');
      const e = await tx.academyEnrollment.upsert({ where: { courseId_personnelId: { courseId, personnelId } }, create: { courseId, personnelId }, update: {} });
      await this.audit.record(actor, { action: 'academy.enroll', module: 'academy', entityType: 'AcademyEnrollment', entityId: e.id, after: e }, tx);
      const p = await tx.personnel.findUniqueOrThrow({ where: { id: personnelId } });
      await tx.notification.create({ data: { userId: p.userId, type: 'ACADEMY_ASSIGNMENT', title: 'Du wurdest in einen Akademie-Kurs eingeschrieben', entityType: 'AcademyCourse', entityId: courseId } });
      return e;
    });
  }

  /** Bestehen wird serverseitig aus Punkten und Kurs-Schwelle berechnet, nie vom Client vorgegeben. Bestandene Kurse werden zur Qualifikation. */
  async grade(actor: Actor, enrollmentId: string, score: number) {
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.academyEnrollment.findUnique({ where: { id: enrollmentId }, include: { course: true, personnel: true } });
      if (!e) throw new AppError('NOT_FOUND', 'Anmeldung zum Kurs nicht gefunden.');
      if (e.personnel.userId === actor.userId) throw new AppError('CONFLICT', 'Du kannst dich nicht selbst bewerten.');
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
}
