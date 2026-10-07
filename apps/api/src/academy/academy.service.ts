import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { DiscordService } from '../discord/discord.service';
import { AppError } from '../common/errors';
import { webUrl } from '../common/web-url';

const KEY = 'academy.config';
const sf = z.string().regex(/^\d{15,25}$/, 'Discord-ID (15–25 Ziffern)');
/** Standard für Ankündigungen in Discord (Kanal + Rollen, die gepingt werden). */
export const academyConfigSchema = z.object({ channelId: sf.nullable().default(null), pingRoleIds: z.array(sf).max(10).default([]) });
export type AcademyConfig = z.infer<typeof academyConfigSchema>;
/** Ankündigung eines Kurses: Kanal/Rollen (sonst der Standard), optional Termin und Ort. */
export const announceSchema = z.object({
  channelId: sf.nullish(), pingRoleIds: z.array(sf).max(10).optional(),
  when: z.coerce.date().optional(), location: z.string().trim().max(200).optional(),
});
export type Announce = z.infer<typeof announceSchema>;

@Injectable()
export class AcademyService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly timeline: TimelineService, private readonly discord: DiscordService) {}

  courses() { return this.prisma.academyCourse.findMany({ include: { _count: { select: { enrollments: true } } }, orderBy: { title: 'asc' } }); }

  async config(): Promise<AcademyConfig> {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
    const p = academyConfigSchema.safeParse(v ?? {});
    return p.success ? p.data : academyConfigSchema.parse({});
  }
  async saveConfig(actor: Actor, c: AcademyConfig) {
    const value = c as unknown as Prisma.InputJsonValue;
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
      await this.audit.record(actor, { action: 'academy.config', module: 'academy', entityType: 'SystemSetting', entityId: KEY, after: value as Record<string, unknown> }, tx);
    });
    return this.config();
  }

  async createCourse(actor: Actor, d: { title: string; description?: string; passScore?: number; instructorId?: string }, announce?: Announce) {
    const c = await this.prisma.$transaction(async (tx) => {
      const row = await tx.academyCourse.create({ data: d });
      await this.audit.record(actor, { action: 'academy.course.create', module: 'academy', entityType: 'AcademyCourse', entityId: row.id, after: row }, tx);
      return row;
    });
    const announced = announce ? await this.announce(actor, c.id, announce) : null;
    return { ...c, announced };
  }

  /** Kurs in Discord ankündigen (mit Rollen-Ping). Kanal/Rollen aus der Anfrage, sonst der gespeicherte Standard, sonst der Ankündigungs-Kanal. */
  async announce(actor: Actor, id: string, a: Announce) {
    const course = await this.prisma.academyCourse.findUnique({ where: { id } });
    if (!course) throw new AppError('NOT_FOUND', 'Kurs nicht gefunden.');
    const cfg = await this.config();
    const channelId = a.channelId ?? cfg.channelId ?? null;
    const pingRoleIds = a.pingRoleIds ?? cfg.pingRoleIds;
    if (!channelId && !(await this.discord.channels()).announcements) throw new AppError('VALIDATION_FAILED', 'Wähle einen Discord-Kanal für die Ankündigung (oder lege unter Einstellungen einen Ankündigungs-Kanal fest).');
    const by = actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
    const instructor = course.instructorId ? await this.prisma.user.findUnique({ where: { id: course.instructorId }, select: { displayName: true } }) : null;
    await this.discord.enqueue('announcements', 'academy.course', {
      id: course.id, title: course.title, description: course.description, passScore: course.passScore,
      when: a.when?.toISOString() ?? null, location: a.location || null, instructorName: instructor?.displayName ?? by?.displayName ?? null,
      pingRoleIds, ...(channelId ? { channelId } : {}), dashboardUrl: webUrl('/academy'),
    }, { always: !!channelId });
    await this.audit.record(actor, { action: 'academy.course.announce', module: 'academy', entityType: 'AcademyCourse', entityId: id, after: { channelId, pingRoleIds } });
    return { channelId, pingRoleIds };
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
