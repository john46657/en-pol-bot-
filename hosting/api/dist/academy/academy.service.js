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
exports.AcademyService = exports.announceSchema = exports.academyConfigSchema = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const timeline_service_1 = require("../timeline/timeline.service");
const discord_service_1 = require("../discord/discord.service");
const errors_1 = require("../common/errors");
const web_url_1 = require("../common/web-url");
const KEY = 'academy.config';
const sf = zod_1.z.string().regex(/^\d{15,25}$/, 'Discord-ID (15–25 Ziffern)');
/** Standard für Ankündigungen in Discord (Kanal + Rollen, die gepingt werden). */
exports.academyConfigSchema = zod_1.z.object({ channelId: sf.nullable().default(null), pingRoleIds: zod_1.z.array(sf).max(10).default([]) });
/** Ankündigung eines Kurses: Kanal/Rollen (sonst der Standard), optional Termin und Ort. */
exports.announceSchema = zod_1.z.object({
    channelId: sf.nullish(), pingRoleIds: zod_1.z.array(sf).max(10).optional(),
    when: zod_1.z.coerce.date().optional(), location: zod_1.z.string().trim().max(200).optional(),
});
let AcademyService = class AcademyService {
    prisma;
    audit;
    timeline;
    discord;
    constructor(prisma, audit, timeline, discord) {
        this.prisma = prisma;
        this.audit = audit;
        this.timeline = timeline;
        this.discord = discord;
    }
    courses() { return this.prisma.academyCourse.findMany({ include: { _count: { select: { enrollments: true } } }, orderBy: { title: 'asc' } }); }
    /** Kurs mit Teilnehmern und letzter Bewertung (Akademie-Seite: einschreiben und benoten). */
    async course(id) {
        const c = await this.prisma.academyCourse.findUnique({
            where: { id },
            include: { enrollments: { orderBy: { createdAt: 'asc' }, include: { personnel: { select: { id: true, callsign: true, rank: true, user: { select: { id: true, displayName: true } } } }, results: { orderBy: { createdAt: 'desc' }, take: 1 } } } },
        });
        if (!c)
            throw new errors_1.AppError('NOT_FOUND', 'Kurs nicht gefunden.');
        return {
            ...c,
            enrollments: c.enrollments.map(({ results, personnel, ...e }) => ({ ...e, personnelId: personnel.id, userId: personnel.user.id, name: personnel.user.displayName, callsign: personnel.callsign, rank: personnel.rank, result: results[0] ?? null })),
        };
    }
    async config() {
        const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
        const p = exports.academyConfigSchema.safeParse(v ?? {});
        return p.success ? p.data : exports.academyConfigSchema.parse({});
    }
    async saveConfig(actor, c) {
        const value = c;
        await this.prisma.$transaction(async (tx) => {
            await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
            await this.audit.record(actor, { action: 'academy.config', module: 'academy', entityType: 'SystemSetting', entityId: KEY, after: value }, tx);
        });
        return this.config();
    }
    async createCourse(actor, d, announce) {
        const c = await this.prisma.$transaction(async (tx) => {
            const row = await tx.academyCourse.create({ data: d });
            await this.audit.record(actor, { action: 'academy.course.create', module: 'academy', entityType: 'AcademyCourse', entityId: row.id, after: row }, tx);
            return row;
        });
        const announced = announce ? await this.announce(actor, c.id, announce) : null;
        return { ...c, announced };
    }
    /** Kurs in Discord ankündigen (mit Rollen-Ping). Kanal/Rollen aus der Anfrage, sonst der gespeicherte Standard, sonst der Ankündigungs-Kanal. */
    async announce(actor, id, a) {
        const course = await this.prisma.academyCourse.findUnique({ where: { id } });
        if (!course)
            throw new errors_1.AppError('NOT_FOUND', 'Kurs nicht gefunden.');
        const cfg = await this.config();
        const channelId = a.channelId ?? cfg.channelId ?? null;
        const pingRoleIds = a.pingRoleIds ?? cfg.pingRoleIds;
        if (!channelId && !(await this.discord.channels()).announcements)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Wähle einen Discord-Kanal für die Ankündigung (oder lege unter Einstellungen einen Ankündigungs-Kanal fest).');
        const by = actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
        const instructor = course.instructorId ? await this.prisma.user.findUnique({ where: { id: course.instructorId }, select: { displayName: true } }) : null;
        await this.discord.enqueue('announcements', 'academy.course', {
            id: course.id, title: course.title, description: course.description, passScore: course.passScore,
            when: a.when?.toISOString() ?? null, location: a.location || null, instructorName: instructor?.displayName ?? by?.displayName ?? null,
            pingRoleIds, ...(channelId ? { channelId } : {}), dashboardUrl: (0, web_url_1.webUrl)('/academy'),
        }, { always: !!channelId });
        await this.audit.record(actor, { action: 'academy.course.announce', module: 'academy', entityType: 'AcademyCourse', entityId: id, after: { channelId, pingRoleIds } });
        return { channelId, pingRoleIds };
    }
    async enroll(actor, courseId, personnelId) {
        return this.prisma.$transaction(async (tx) => {
            if (!(await tx.academyCourse.findUnique({ where: { id: courseId } })))
                throw new errors_1.AppError('NOT_FOUND', 'Kurs nicht gefunden.');
            if (!(await tx.personnel.findUnique({ where: { id: personnelId } })))
                throw new errors_1.AppError('NOT_FOUND', 'Personalakte nicht gefunden.');
            const e = await tx.academyEnrollment.upsert({ where: { courseId_personnelId: { courseId, personnelId } }, create: { courseId, personnelId }, update: {} });
            await this.audit.record(actor, { action: 'academy.enroll', module: 'academy', entityType: 'AcademyEnrollment', entityId: e.id, after: e }, tx);
            const p = await tx.personnel.findUniqueOrThrow({ where: { id: personnelId } });
            await tx.notification.create({ data: { userId: p.userId, type: 'ACADEMY_ASSIGNMENT', title: 'Du wurdest in einen Akademie-Kurs eingeschrieben', entityType: 'AcademyCourse', entityId: courseId } });
            return e;
        });
    }
    /** Bestehen wird serverseitig aus Punkten und Kurs-Schwelle berechnet, nie vom Client vorgegeben. Bestandene Kurse werden zur Qualifikation. */
    async grade(actor, enrollmentId, score) {
        return this.prisma.$transaction(async (tx) => {
            const e = await tx.academyEnrollment.findUnique({ where: { id: enrollmentId }, include: { course: true, personnel: true } });
            if (!e)
                throw new errors_1.AppError('NOT_FOUND', 'Anmeldung zum Kurs nicht gefunden.');
            if (e.personnel.userId === actor.userId)
                throw new errors_1.AppError('CONFLICT', 'Du kannst dich nicht selbst bewerten.');
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
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, timeline_service_1.TimelineService, discord_service_1.DiscordService])
], AcademyService);
//# sourceMappingURL=academy.service.js.map