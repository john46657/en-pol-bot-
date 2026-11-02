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
exports.MeetingsService = exports.taskBody = exports.minutesBody = exports.meetingBody = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const discord_service_1 = require("../discord/discord.service");
const errors_1 = require("../common/errors");
const calendar_service_1 = require("./calendar.service");
const sf = zod_1.z.string().regex(/^\d{15,25}$/);
exports.meetingBody = zod_1.z.object({
    title: zod_1.z.string().trim().min(2).max(150),
    description: zod_1.z.string().trim().max(4000).nullish(),
    startsAt: zod_1.z.coerce.date(), endsAt: zod_1.z.coerce.date(),
    location: zod_1.z.string().trim().max(150).nullish(),
    department: zod_1.z.string().trim().max(64).nullish(),
    discordChannelId: sf.nullish(),
    mandatory: zod_1.z.boolean().default(false),
    private: zod_1.z.boolean().default(false),
    participantIds: zod_1.z.array(zod_1.z.string().uuid()).max(200).default([]),
    reminders: zod_1.z.array(zod_1.z.number().int().refine((m) => shared_1.REMINDER_CHOICES.includes(m), 'Ungültige Erinnerung')).max(4).default([60]),
    agenda: zod_1.z.string().trim().max(8000).nullish(),
    idempotencyKey: zod_1.z.string().regex(/^[A-Za-z0-9:_-]{8,80}$/).nullish(),
});
exports.minutesBody = zod_1.z.object({ agenda: zod_1.z.string().max(8000).nullish(), notes: zod_1.z.string().max(20000).nullish(), decisions: zod_1.z.string().max(8000).nullish(), followUp: zod_1.z.string().max(8000).nullish(), version: zod_1.z.number().int().min(1) });
exports.taskBody = zod_1.z.object({ title: zod_1.z.string().trim().min(2).max(300), assigneeId: zod_1.z.string().uuid().nullish(), dueAt: zod_1.z.coerce.date().nullish() });
/**
 * Besprechungsmanager: Besprechung = Kalendertermin (Kategorie MEETING) + Protokoll, Aufgaben, Discord-Kanal, Teilnahmepflicht.
 * Private Protokolle sehen nur Organisator, Protokollführer, Anwesende und `meetings.view_private`.
 */
let MeetingsService = class MeetingsService {
    cal;
    discord;
    constructor(cal, discord) {
        this.cal = cal;
        this.discord = discord;
    }
    get prisma() { return this.cal.prisma; }
    get perms() { return this.cal.perms; }
    async load(id) {
        const m = await this.prisma.meeting.findUnique({ where: { id }, include: { event: { include: { participants: true } }, tasks: { orderBy: { createdAt: 'asc' } } } });
        if (!m)
            throw new errors_1.AppError('NOT_FOUND', 'Besprechung nicht gefunden.');
        return m;
    }
    async mayOrganize(userId, organizerId) {
        return (await this.perms.has(userId, 'calendar.manage')) || (organizerId === userId && (await this.perms.has(userId, 'meetings.organize')));
    }
    /** Protokoll lesen: öffentlich mit meetings.view; privat nur Organisator, Protokollführer, Anwesende, view_private. */
    async mayReadMinutes(userId, m) {
        if (!m.private)
            return true;
        if (m.event.organizerId === userId || m.minutesById === userId)
            return true;
        if (m.event.participants.some((p) => p.userId === userId && p.status === 'ATTENDED'))
            return true;
        return this.perms.has(userId, 'meetings.view_private');
    }
    async mayWriteMinutes(userId, organizerId) {
        return organizerId === userId || (await this.perms.has(userId, 'meetings.minutes'));
    }
    discordText(m, e) {
        const t = (d, s) => `<t:${Math.floor(d.getTime() / 1000)}:${s}>`;
        return [`**Wann:** ${t(e.startsAt, 'F')} – ${t(e.endsAt, 't')} (${t(e.startsAt, 'R')})`, e.location ? `**Ort:** ${e.location}` : null, m.mandatory ? '**Teilnahme verpflichtend.**' : null, e.description, m.agenda ? `**Tagesordnung:**\n${m.agenda.slice(0, 1500)}` : null].filter(Boolean).join('\n');
    }
    /** Ankündigung bzw. Änderung im Discord-Kanal der Besprechung (Buttons Zusagen/Absagen; Antworten laufen über die API). */
    async post(m, e, kind, note) {
        if (!m.discordChannelId)
            return;
        const color = kind === 'cancel' ? 0xef4444 : kind === 'change' ? 0xf59e0b : 0x8b5cf6;
        const title = `${kind === 'cancel' ? '❌ Abgesagt' : kind === 'change' ? '🔁 Geändert' : '🗓️ Besprechung'}: ${e.title}`.slice(0, 256);
        await this.discord.postMessage(`meeting-${e.id}`, m.discordChannelId, {
            embeds: [{ title, description: `${note ? `${note}\n\n` : ''}${this.discordText(m, e)}`.slice(0, 4000), color, footer: 'Zu- und Absagen gehen nur an das System – sichtbar für die Organisation, nicht im Kanal.' }],
            ...(kind === 'cancel' ? {} : { buttons: [{ label: 'Zusagen', style: 'success', id: `meet:accept:${e.id}`, emoji: '✅' }, { label: 'Absagen', style: 'secondary', id: `meet:decline:${e.id}`, emoji: '✖️' }, { label: 'Abwesenheit melden', style: 'secondary', id: `meet:excuse:${e.id}`, emoji: '🌴' }] }),
        }, { forceNew: kind !== 'announce' });
    }
    async create(actor, d) {
        await this.perms.assert(actor.userId, 'meetings.organize');
        if (d.idempotencyKey) {
            const ex = await this.prisma.calendarEvent.findUnique({ where: { idempotencyKey: d.idempotencyKey }, include: { meeting: true } });
            if (ex?.meeting)
                return this.get(actor, ex.meeting.id);
        }
        let meetingId = '';
        await this.prisma.$transaction(async (tx) => {
            const r = await this.cal.create(actor, { title: d.title, description: d.description, category: 'MEETING', startsAt: d.startsAt, endsAt: d.endsAt, allDay: false, location: d.location, department: d.department, reminders: d.reminders, maxParticipants: null, openSignup: !d.private, participantIds: d.participantIds, recurrence: null, idempotencyKey: d.idempotencyKey }, { tx, skipPermission: true });
            const m = await tx.meeting.create({ data: { eventId: r.ids[0], discordChannelId: d.discordChannelId || null, mandatory: d.mandatory, private: d.private, agenda: d.agenda || null } });
            await this.cal.audit.record(actor, { action: 'meetings.create', module: 'meetings', entityType: 'Meeting', entityId: m.id, after: { title: d.title, mandatory: d.mandatory, private: d.private, invited: d.participantIds.length } }, tx);
            meetingId = m.id;
        });
        const m = await this.load(meetingId);
        if (d.participantIds.length)
            await this.cal.notify.emit('calendar.new', d.participantIds, { title: `🗓️ Besprechung: ${d.title}${d.mandatory ? ' (Pflicht)' : ''}`, link: `/meetings?id=${meetingId}`, entityType: 'Meeting', entityId: meetingId, dedupeKey: `${m.eventId}:new` });
        await this.post(m, m.event, 'announce');
        return this.get(actor, meetingId);
    }
    async list(actor, f) {
        const now = new Date();
        const rows = await this.prisma.meeting.findMany({ where: { event: f.scope === 'upcoming' ? { endsAt: { gte: now } } : { endsAt: { lt: now } } }, include: { event: { include: { participants: true } }, tasks: { select: { status: true } } }, orderBy: { event: { startsAt: f.scope === 'upcoming' ? 'asc' : 'desc' } }, take: 200 });
        const names = await this.cal.names(rows.map((r) => r.event.organizerId));
        return {
            canOrganize: await this.perms.has(actor.userId, 'meetings.organize'),
            items: rows.map((m) => ({
                id: m.id, eventId: m.eventId, title: m.event.title, startsAt: m.event.startsAt, endsAt: m.event.endsAt, location: m.event.location, department: m.event.department, status: m.event.status,
                organizerName: names.get(m.event.organizerId) ?? '—', mandatory: m.mandatory, private: m.private, conductedAt: m.conductedAt, hasMinutes: !!(m.notes || m.decisions),
                openTasks: m.tasks.filter((t) => t.status === 'OPEN').length, myStatus: m.event.participants.find((p) => p.userId === actor.userId)?.status ?? null,
                counts: { invited: m.event.participants.length, accepted: m.event.participants.filter((p) => p.status === 'ACCEPTED').length, attended: m.event.participants.filter((p) => p.status === 'ATTENDED').length },
            })),
        };
    }
    async get(actor, id) {
        const m = await this.load(id);
        const me = actor.userId;
        const [event, readMinutes, writeMinutes, organize] = await Promise.all([this.cal.get(actor, m.eventId), this.mayReadMinutes(me, m), this.mayWriteMinutes(me, m.event.organizerId), this.mayOrganize(me, m.event.organizerId)]);
        const names = await this.cal.names(m.tasks.map((t) => t.assigneeId).filter((x) => !!x));
        return {
            id: m.id, eventId: m.eventId, event, discordChannelId: m.discordChannelId, mandatory: m.mandatory, private: m.private, conductedAt: m.conductedAt, version: m.version,
            minutes: readMinutes ? { agenda: m.agenda, notes: m.notes, decisions: m.decisions, followUp: m.followUp } : { agenda: m.agenda, notes: null, decisions: null, followUp: null, hidden: true },
            tasks: m.tasks.filter((t) => readMinutes || t.assigneeId === me).map((t) => ({ id: t.id, title: t.title, assigneeId: t.assigneeId, assigneeName: t.assigneeId ? names.get(t.assigneeId) ?? '—' : null, dueAt: t.dueAt, status: t.status, doneAt: t.doneAt })),
            can: { minutes: writeMinutes, organize, readMinutes },
        };
    }
    async update(actor, id, d) {
        const m = await this.load(id);
        if (!(await this.mayOrganize(actor.userId, m.event.organizerId)))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Diese Besprechung darfst du nicht ändern.');
        const moved = m.event.startsAt.getTime() !== d.startsAt.getTime() || m.event.endsAt.getTime() !== d.endsAt.getTime();
        await this.cal.update(actor, m.eventId, { title: d.title, description: d.description, category: 'MEETING', startsAt: d.startsAt, endsAt: d.endsAt, allDay: false, location: d.location, department: d.department, reminders: d.reminders, maxParticipants: null, openSignup: !d.private, version: d.version });
        await this.prisma.$transaction(async (tx) => {
            await tx.meeting.update({ where: { id }, data: { discordChannelId: d.discordChannelId || null, mandatory: d.mandatory, private: d.private, agenda: d.agenda ?? m.agenda, version: { increment: 1 } } });
            await this.cal.audit.record(actor, { action: 'meetings.update', module: 'meetings', entityType: 'Meeting', entityId: id, before: { mandatory: m.mandatory, private: m.private }, after: { mandatory: d.mandatory, private: d.private } }, tx);
        });
        if (d.participantIds.length)
            await this.cal.invite(actor, m.eventId, d.participantIds);
        const after = await this.load(id);
        await this.post(after, after.event, 'change', moved ? 'Neuer Zeitpunkt.' : 'Details wurden geändert.');
        return this.get(actor, id);
    }
    async cancel(actor, id, reason) {
        const m = await this.load(id);
        await this.cal.cancel(actor, m.eventId, reason);
        const after = await this.load(id);
        await this.post(after, after.event, 'cancel', `Grund: ${reason}`);
        return this.get(actor, id);
    }
    /** Protokoll: Tagesordnung, Notizen, Entscheidungen, Nachbereitung (Versionsprüfung, Audit ohne Inhalt). */
    async saveMinutes(actor, id, d) {
        const m = await this.load(id);
        if (!(await this.mayWriteMinutes(actor.userId, m.event.organizerId)))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Protokoll schreiben darf nur der Organisator oder wer meetings.minutes hat.');
        await this.prisma.$transaction(async (tx) => {
            const n = await tx.meeting.updateMany({ where: { id, version: d.version }, data: { agenda: d.agenda ?? null, notes: d.notes ?? null, decisions: d.decisions ?? null, followUp: d.followUp ?? null, minutesById: actor.userId, version: { increment: 1 } } });
            if (!n.count)
                throw new errors_1.AppError('CONFLICT', 'Das Protokoll wurde inzwischen geändert. Bitte neu laden.');
            // Inhalte privater Protokolle gehören nicht ins Audit – nur, dass geändert wurde
            await this.cal.audit.record(actor, { action: 'meetings.minutes', module: 'meetings', entityType: 'Meeting', entityId: id, after: { private: m.private, length: (d.notes ?? '').length } }, tx);
        });
        return this.get(actor, id);
    }
    /** „Besprechung durchgeführt“: Zeitpunkt + Termin abgeschlossen; Anwesenheit kommt aus der Teilnehmerliste. */
    async conduct(actor, id) {
        const m = await this.load(id);
        if (!(await this.mayOrganize(actor.userId, m.event.organizerId)) && !(await this.perms.has(actor.userId, 'meetings.organize')))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Nur der Organisator.');
        if (m.conductedAt)
            throw new errors_1.AppError('CONFLICT', 'Die Besprechung ist schon als durchgeführt markiert.');
        if (m.event.status === 'CANCELLED')
            throw new errors_1.AppError('CONFLICT', 'Die Besprechung wurde abgesagt.');
        if (m.event.startsAt.getTime() > Date.now())
            throw new errors_1.AppError('CONFLICT', 'Die Besprechung hat noch nicht begonnen.');
        await this.prisma.$transaction(async (tx) => {
            const n = await tx.meeting.updateMany({ where: { id, conductedAt: null }, data: { conductedAt: new Date(), version: { increment: 1 } } });
            if (!n.count)
                throw new errors_1.AppError('CONFLICT', 'Schon durchgeführt.');
            await tx.calendarEvent.update({ where: { id: m.eventId }, data: { status: 'DONE' } });
            await this.cal.audit.record(actor, { action: 'meetings.conducted', module: 'meetings', entityType: 'Meeting', entityId: id, after: { attended: m.event.participants.filter((p) => p.status === 'ATTENDED').length } }, tx);
        });
        return this.get(actor, id);
    }
    async addTask(actor, id, d) {
        const m = await this.load(id);
        if (!(await this.mayWriteMinutes(actor.userId, m.event.organizerId)))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Aufgaben anlegen darf nur der Organisator oder Protokollführer.');
        if (d.assigneeId && !(await this.prisma.user.findFirst({ where: { id: d.assigneeId, active: true } })))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Zuständige Person nicht gefunden.');
        const t = await this.prisma.$transaction(async (tx) => {
            const x = await tx.meetingTask.create({ data: { meetingId: id, title: d.title, assigneeId: d.assigneeId || null, dueAt: d.dueAt ?? null, createdById: actor.userId } });
            await this.cal.audit.record(actor, { action: 'meetings.task.create', module: 'meetings', entityType: 'MeetingTask', entityId: x.id, after: { meetingId: id, assigneeId: x.assigneeId, dueAt: x.dueAt } }, tx);
            return x;
        });
        if (t.assigneeId)
            await this.cal.notify.emit('meeting.task', [t.assigneeId], { title: `📌 Aufgabe aus „${m.event.title}“: ${t.title}`, link: `/meetings?id=${id}`, entityType: 'Meeting', entityId: id, dedupeKey: t.id, ...(t.dueAt ? { body: `Frist: ${t.dueAt.toLocaleString('de-DE', { timeZone: shared_1.ORG_TIME_ZONE })}` } : {}) });
        return this.get(actor, id);
    }
    async setTask(actor, taskId, status) {
        const t = await this.prisma.meetingTask.findUnique({ where: { id: taskId }, include: { meeting: { include: { event: { select: { organizerId: true } } } } } });
        if (!t)
            throw new errors_1.AppError('NOT_FOUND', 'Aufgabe nicht gefunden.');
        // über die Besprechung laden → Server-Trennung greift
        await this.load(t.meetingId);
        const ok = t.assigneeId === actor.userId || (await this.mayWriteMinutes(actor.userId, t.meeting.event.organizerId));
        if (!ok)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Nur die zuständige Person oder der Organisator.');
        await this.prisma.$transaction(async (tx) => {
            await tx.meetingTask.update({ where: { id: taskId }, data: { status, doneAt: status === 'DONE' ? new Date() : null } });
            await this.cal.audit.record(actor, { action: `meetings.task.${status.toLowerCase()}`, module: 'meetings', entityType: 'MeetingTask', entityId: taskId }, tx);
        });
        return this.get(actor, t.meetingId);
    }
    /** Offene Aufgaben: eigene; mit meetings.organize alle. */
    async openTasks(actor) {
        const all = await this.perms.has(actor.userId, 'meetings.organize');
        const rows = await this.prisma.meetingTask.findMany({ where: { status: 'OPEN', ...(all ? {} : { assigneeId: actor.userId }), meeting: { id: { in: (await this.prisma.meeting.findMany({ select: { id: true } })).map((m) => m.id) } } }, include: { meeting: { include: { event: { select: { title: true } } } } }, orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }], take: 200 });
        const names = await this.cal.names(rows.map((r) => r.assigneeId).filter((x) => !!x));
        return rows.map((t) => ({ id: t.id, title: t.title, meetingId: t.meetingId, meetingTitle: t.meeting.event.title, assigneeName: t.assigneeId ? names.get(t.assigneeId) ?? '—' : null, dueAt: t.dueAt, overdue: !!t.dueAt && t.dueAt.getTime() < Date.now() }));
    }
    async exportParticipants(actor, id) {
        const m = await this.get(actor, id);
        const p = m.event.participants ?? [];
        return (0, shared_1.toCsv)(['Name', 'Status', 'Notiz', 'Geantwortet'], p.map((x) => [x.name, shared_1.PARTICIPANT_STATUS_LABEL[x.status] ?? x.status, x.note ?? '', x.respondedAt ? new Date(x.respondedAt).toLocaleString('de-DE', { timeZone: shared_1.ORG_TIME_ZONE }) : '']));
    }
};
exports.MeetingsService = MeetingsService;
exports.MeetingsService = MeetingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [calendar_service_1.CalendarService, discord_service_1.DiscordService])
], MeetingsService);
//# sourceMappingURL=meetings.service.js.map