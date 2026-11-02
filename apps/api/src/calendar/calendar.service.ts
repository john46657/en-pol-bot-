import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type CalendarEvent, type CalendarParticipant } from '@prisma/client';
import { z } from 'zod';
import { canRespond, dueReminders, expandRecurrence, passedReminders, withHrDefaults, EVENT_CATEGORIES, EVENT_CATEGORY_LABEL, ORG_TIME_ZONE, PARTICIPANT_STATUS_LABEL, RECURRENCE_FREQS, REMINDER_CHOICES, type EventCategory, type ParticipantStatus } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { NotifyService } from '../notifications/notify.service';
import { DiscordService } from '../discord/discord.service';
import { AppError } from '../common/errors';

const H = 3_600_000;
export const eventInput = z.object({
  title: z.string().trim().min(2).max(150),
  description: z.string().trim().max(4000).nullish(),
  category: z.enum(EVENT_CATEGORIES).refine((c) => c !== 'SHIFT', 'Schichten werden im Schichtplan geplant.'),
  startsAt: z.coerce.date(), endsAt: z.coerce.date(),
  allDay: z.boolean().default(false),
  location: z.string().trim().max(150).nullish(),
  department: z.string().trim().max(64).nullish(),
  reminders: z.array(z.number().int().refine((m) => (REMINDER_CHOICES as readonly number[]).includes(m), 'Ungültige Erinnerung')).max(4).default([]),
  maxParticipants: z.number().int().min(1).max(500).nullish(),
  openSignup: z.boolean().default(true),
});
export const createEventBody = eventInput.extend({
  participantIds: z.array(z.string().uuid()).max(200).default([]),
  recurrence: z.object({ freq: z.enum(RECURRENCE_FREQS), count: z.number().int().min(1).max(52) }).nullish(),
  /** Gleiche Anlage aus mehreren Systemen (Doppelklick, Discord + Dashboard) → genau ein Termin */
  idempotencyKey: z.string().regex(/^[A-Za-z0-9:_-]{8,80}$/).nullish(),
});
export type EventInput = z.infer<typeof eventInput>;
type Row = CalendarEvent & { participants: CalendarParticipant[]; meeting?: { id: string; private: boolean; mandatory: boolean } | null };

/**
 * Zentraler Kalender. Schichten kommen virtuell aus dem Schichtplan (keine Kopie → keine Doppeleinträge),
 * Besprechungen sind Kalendertermine mit Besprechungsdaten. Teilnahme: Einladung, Zusage, Absage, Abwesenheit melden; Anwesenheit
 * erfasst der Organisator. Erinnerungen genau einmal je Termin, Beginn und Vorlaufzeit.
 */
@Injectable()
export class CalendarService {
  constructor(readonly prisma: PrismaService, readonly audit: AuditService, readonly perms: PermissionService, readonly notify: NotifyService, private readonly discord: DiscordService) {}

  async names(ids: string[]) {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, displayName: true } });
    return new Map(users.map((u) => [u.id, u.displayName]));
  }
  private async departments() { return withHrDefaults((await this.prisma.systemSetting.findUnique({ where: { key: 'hr.config' } }))?.value).departments.map((d) => d.name); }

  validate(d: { startsAt: Date; endsAt: Date }) {
    if (Number.isNaN(d.startsAt.getTime()) || Number.isNaN(d.endsAt.getTime())) throw new AppError('VALIDATION_FAILED', 'Ungültige Zeitangabe.');
    if (d.endsAt.getTime() < d.startsAt.getTime()) throw new AppError('VALIDATION_FAILED', 'Das Ende darf nicht vor dem Beginn liegen.');
    if (d.endsAt.getTime() - d.startsAt.getTime() > 14 * 24 * H) throw new AppError('VALIDATION_FAILED', 'Ein Termin darf höchstens 14 Tage dauern.');
  }
  async checkDepartment(dep?: string | null) {
    if (dep && !(await this.departments()).includes(dep)) throw new AppError('VALIDATION_FAILED', `Abteilung „${dep}“ gibt es nicht.`);
  }

  /** Darf der Benutzer diesen Termin ändern? Kalenderverwaltung immer; Organisator bei Besprechungen mit meetings.organize. */
  async mayEdit(userId: string, e: { organizerId: string; category: string }) {
    if (await this.perms.has(userId, 'calendar.manage')) return true;
    return e.organizerId === userId && e.category === 'MEETING' && (await this.perms.has(userId, 'meetings.organize'));
  }

  private when(e: { startsAt: Date; endsAt: Date; allDay: boolean }) {
    const o = { timeZone: ORG_TIME_ZONE } as const;
    return e.allDay ? e.startsAt.toLocaleDateString('de-DE', { ...o, weekday: 'short', day: '2-digit', month: '2-digit' }) : `${e.startsAt.toLocaleString('de-DE', { ...o, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} Uhr`;
  }

  view(e: Row, me: string, names: Map<string, string>, full = false) {
    const p = e.participants;
    const count = (s: string) => p.filter((x) => x.status === s).length;
    return {
      id: e.id, title: e.title, description: e.description, category: e.category, categoryLabel: EVENT_CATEGORY_LABEL[e.category as EventCategory] ?? e.category,
      startsAt: e.startsAt, endsAt: e.endsAt, allDay: e.allDay, location: e.location, department: e.department, status: e.status, cancelReason: e.cancelReason,
      organizerId: e.organizerId, organizerName: names.get(e.organizerId) ?? '—', reminders: e.reminders, maxParticipants: e.maxParticipants, openSignup: e.openSignup, seriesId: e.seriesId, version: e.version,
      meetingId: e.meeting?.id ?? null, mandatory: e.meeting?.mandatory ?? false,
      counts: { invited: count('INVITED'), accepted: count('ACCEPTED'), declined: count('DECLINED'), excused: count('EXCUSED'), attended: count('ATTENDED'), absent: count('ABSENT') },
      myStatus: (p.find((x) => x.userId === me)?.status ?? null) as ParticipantStatus | null,
      ...(full ? { participants: p.map((x) => ({ userId: x.userId, name: names.get(x.userId) ?? '—', status: x.status, statusLabel: PARTICIPANT_STATUS_LABEL[x.status as ParticipantStatus] ?? x.status, note: x.note, respondedAt: x.respondedAt })) } : {}),
    };
  }

  /**
   * Termine im Zeitraum (+ Schichten aus dem Schichtplan, falls sichtbar). `mine`: nur eigene (eingeladen/zugesagt/Organisator).
   */
  async list(actor: Actor, f: { from: Date; to: Date; category?: string; mine?: boolean; department?: string }) {
    if (f.to.getTime() - f.from.getTime() > 120 * 24 * H) throw new AppError('VALIDATION_FAILED', 'Zeitraum höchstens 120 Tage.');
    const me = actor.userId!;
    const where: Prisma.CalendarEventWhereInput = {
      startsAt: { lt: f.to }, endsAt: { gte: f.from },
      ...(f.category && f.category !== 'SHIFT' ? { category: f.category } : {}),
      ...(f.department ? { department: f.department } : {}),
      ...(f.mine ? { OR: [{ organizerId: me }, { participants: { some: { userId: me, status: { in: ['INVITED', 'ACCEPTED', 'EXCUSED', 'ATTENDED'] } } } }] } : {}),
    };
    const rows = f.category === 'SHIFT' ? [] : await this.prisma.calendarEvent.findMany({ where, include: { participants: true, meeting: { select: { id: true, private: true, mandatory: true } } }, orderBy: { startsAt: 'asc' }, take: 1000 });
    const names = await this.names(rows.map((r) => r.organizerId));
    const events = rows.map((r) => ({ ...this.view(r, me, names), source: 'calendar' as const }));
    // Schichten virtuell (nur veröffentlichte/abgeschlossene; Entwürfe gehören zur Planung)
    let shifts: unknown[] = [];
    if ((!f.category || f.category === 'SHIFT') && (await this.perms.has(me, 'shiftplan.view'))) {
      const s = await this.prisma.plannedShift.findMany({ where: { status: { in: ['PUBLISHED', 'COMPLETED'] }, startsAt: { lt: f.to }, endsAt: { gt: f.from }, ...(f.department ? { department: f.department } : {}), ...(f.mine ? { assignments: { some: { userId: me, status: 'ACTIVE' } } } : {}) }, include: { assignments: { where: { status: 'ACTIVE' }, select: { userId: true } } }, orderBy: { startsAt: 'asc' }, take: 500 });
      shifts = s.map((x) => ({ id: x.id, source: 'shiftplan', title: x.name, category: 'SHIFT', categoryLabel: EVENT_CATEGORY_LABEL.SHIFT, startsAt: x.startsAt, endsAt: x.endsAt, allDay: false, department: x.department, status: x.status === 'COMPLETED' ? 'DONE' : 'SCHEDULED', myStatus: x.assignments.some((a) => a.userId === me) ? 'ACCEPTED' : null, counts: { accepted: x.assignments.length } }));
    }
    return { items: [...events, ...shifts].sort((a, b) => new Date((a as { startsAt: Date }).startsAt).getTime() - new Date((b as { startsAt: Date }).startsAt).getTime()), canManage: await this.perms.has(me, 'calendar.manage'), departments: await this.departments() };
  }

  async load(id: string): Promise<Row> {
    const e = await this.prisma.calendarEvent.findUnique({ where: { id }, include: { participants: true, meeting: { select: { id: true, private: true, mandatory: true } } } });
    if (!e) throw new AppError('NOT_FOUND', 'Termin nicht gefunden.');
    return e;
  }
  async get(actor: Actor, id: string) {
    const e = await this.load(id);
    const names = await this.names([e.organizerId, ...e.participants.map((p) => p.userId)]);
    return { ...this.view(e, actor.userId!, names, true), canEdit: await this.mayEdit(actor.userId!, e) };
  }

  /** Anlegen (auch als Serie). Mit `idempotencyKey` entsteht bei doppelter Anlage genau ein Termin (vorhandener wird geliefert). */
  async create(actor: Actor, d: z.infer<typeof createEventBody>, opts: { tx?: Prisma.TransactionClient; skipPermission?: boolean } = {}) {
    if (!opts.skipPermission) await this.perms.assert(actor.userId!, 'calendar.manage');
    this.validate(d);
    await this.checkDepartment(d.department);
    if (d.idempotencyKey) {
      const existing = await this.prisma.calendarEvent.findUnique({ where: { idempotencyKey: d.idempotencyKey } });
      if (existing) return { created: 0, ids: [existing.id], seriesId: existing.seriesId, duplicate: true };
    }
    if (d.endsAt.getTime() <= Date.now()) throw new AppError('VALIDATION_FAILED', 'Termine in der Vergangenheit können nicht angelegt werden.');
    const occ = d.recurrence ? expandRecurrence(d.startsAt, d.endsAt, d.recurrence, ORG_TIME_ZONE) : [{ startsAt: d.startsAt, endsAt: d.endsAt }];
    const invitees = [...new Set(d.participantIds)];
    if (invitees.length && (await this.prisma.user.count({ where: { id: { in: invitees }, active: true } })) !== invitees.length) throw new AppError('VALIDATION_FAILED', 'Teilnehmer nicht gefunden oder inaktiv.');
    const seriesId = occ.length > 1 ? randomUUID() : null;
    const run = async (tx: Prisma.TransactionClient) => {
      const out: CalendarEvent[] = [];
      for (const [i, o] of occ.entries()) {
        const e = await tx.calendarEvent.create({ data: { title: d.title, description: d.description || null, category: d.category, startsAt: o.startsAt, endsAt: o.endsAt, allDay: d.allDay, location: d.location || null, department: d.department || null, organizerId: actor.userId!, reminders: [...new Set(d.reminders)], maxParticipants: d.maxParticipants ?? null, openSignup: d.openSignup, seriesId, idempotencyKey: d.idempotencyKey ? (i === 0 ? d.idempotencyKey : `${d.idempotencyKey}:${i}`) : null, participants: { create: invitees.map((userId) => ({ userId, status: 'INVITED' })) } } });
        await this.audit.record(actor, { action: 'calendar.create', module: 'calendar', entityType: 'CalendarEvent', entityId: e.id, after: { title: e.title, category: e.category, startsAt: e.startsAt, endsAt: e.endsAt, invited: invitees.length, seriesId } }, tx);
        out.push(e);
      }
      return out;
    };
    let created: CalendarEvent[];
    try { created = opts.tx ? await run(opts.tx) : await this.prisma.$transaction(run); }
    catch (e) {
      // gleichzeitige Anlage mit demselben Schlüssel: den anderen Termin liefern
      if (d.idempotencyKey && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.calendarEvent.findUniqueOrThrow({ where: { idempotencyKey: d.idempotencyKey } });
        return { created: 0, ids: [existing.id], seriesId: existing.seriesId, duplicate: true };
      }
      throw e;
    }
    if (invitees.length && !opts.tx) await this.notify.emit('calendar.new', invitees, { title: `📅 Einladung: ${d.title} (${this.when(created[0]!)}${created.length > 1 ? `, ${created.length} Termine` : ''})`, link: `/calendar?id=${created[0]!.id}`, entityType: 'CalendarEvent', entityId: created[0]!.id, dedupeKey: `${created[0]!.id}:new` });
    return { created: created.length, ids: created.map((e) => e.id), seriesId, duplicate: false };
  }

  /** Ändern/Verschieben (Versionsprüfung). Teilnehmer werden über Änderungen informiert. */
  async update(actor: Actor, id: string, d: EventInput & { version: number }) {
    this.validate(d);
    await this.checkDepartment(d.department);
    const e = await this.load(id);
    if (!(await this.mayEdit(actor.userId!, e))) throw new AppError('PERMISSION_DENIED', 'Diesen Termin darfst du nicht ändern.');
    if (e.status !== 'SCHEDULED') throw new AppError('CONFLICT', 'Abgesagte oder abgeschlossene Termine können nicht geändert werden.');
    if (e.category === 'MEETING' && d.category !== 'MEETING') throw new AppError('VALIDATION_FAILED', 'Die Kategorie einer Besprechung bleibt „Dienstbesprechung“.');
    if (d.category === 'MEETING' && e.category !== 'MEETING') throw new AppError('VALIDATION_FAILED', 'Besprechungen bitte im Besprechungsmanager anlegen.');
    const accepted = e.participants.filter((p) => p.status === 'ACCEPTED').length;
    if (d.maxParticipants != null && accepted > d.maxParticipants) throw new AppError('CONFLICT', `Es haben schon ${accepted} Personen zugesagt – mehr als die neue Höchstzahl.`);
    const moved = e.startsAt.getTime() !== d.startsAt.getTime() || e.endsAt.getTime() !== d.endsAt.getTime();
    const after = await this.prisma.$transaction(async (tx) => {
      const n = await tx.calendarEvent.updateMany({ where: { id, version: d.version, status: 'SCHEDULED' }, data: { title: d.title, description: d.description || null, category: d.category, startsAt: d.startsAt, endsAt: d.endsAt, allDay: d.allDay, location: d.location || null, department: d.department || null, reminders: [...new Set(d.reminders)], maxParticipants: d.maxParticipants ?? null, openSignup: d.openSignup, version: { increment: 1 } } });
      if (!n.count) throw new AppError('CONFLICT', 'Der Termin wurde inzwischen geändert. Bitte neu laden.');
      const x = await tx.calendarEvent.findUniqueOrThrow({ where: { id } });
      await this.audit.record(actor, { action: moved ? 'calendar.reschedule' : 'calendar.update', module: 'calendar', entityType: 'CalendarEvent', entityId: id, before: { title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, location: e.location }, after: { title: x.title, startsAt: x.startsAt, endsAt: x.endsAt, location: x.location } }, tx);
      return x;
    });
    await this.announceChange(after, e.participants, moved ? `Neuer Zeitpunkt: ${this.when(after)}` : 'Details wurden geändert.');
    return this.get(actor, id);
  }

  private async announceChange(e: CalendarEvent, participants: CalendarParticipant[], why: string) {
    const to = participants.filter((p) => ['INVITED', 'ACCEPTED', 'EXCUSED'].includes(p.status)).map((p) => p.userId);
    await this.notify.emit('calendar.changed', to, { title: `🔁 ${e.status === 'CANCELLED' ? 'Abgesagt' : 'Geändert'}: ${e.title}`, body: why, link: `/calendar?id=${e.id}`, entityType: 'CalendarEvent', entityId: e.id, dedupeKey: `${e.id}:v${e.version}`, dmText: `**${e.title}** – ${why}` });
  }

  async cancel(actor: Actor, id: string, reason: string) {
    const e = await this.load(id);
    if (!(await this.mayEdit(actor.userId!, e))) throw new AppError('PERMISSION_DENIED', 'Diesen Termin darfst du nicht absagen.');
    if (e.status !== 'SCHEDULED') throw new AppError('CONFLICT', 'Der Termin ist schon abgesagt oder abgeschlossen.');
    const after = await this.prisma.$transaction(async (tx) => {
      const n = await tx.calendarEvent.updateMany({ where: { id, status: 'SCHEDULED' }, data: { status: 'CANCELLED', cancelReason: reason, version: { increment: 1 } } });
      if (!n.count) throw new AppError('CONFLICT', 'Der Termin wurde gerade schon abgesagt.');
      await this.audit.record(actor, { action: 'calendar.cancel', module: 'calendar', entityType: 'CalendarEvent', entityId: id, reason }, tx);
      return tx.calendarEvent.findUniqueOrThrow({ where: { id } });
    });
    await this.announceChange(after, e.participants, `Abgesagt: ${reason}`);
    return this.get(actor, id);
  }

  /** Teilnehmer zuweisen (einladen). Bestehende Antworten bleiben unverändert. */
  async invite(actor: Actor, id: string, userIds: string[]) {
    const e = await this.load(id);
    if (!(await this.mayEdit(actor.userId!, e))) throw new AppError('PERMISSION_DENIED', 'Teilnehmer zuweisen darf nur die Kalenderverwaltung bzw. der Organisator.');
    if (e.status !== 'SCHEDULED') throw new AppError('CONFLICT', 'Der Termin findet nicht (mehr) statt.');
    const fresh = [...new Set(userIds)].filter((u) => !e.participants.some((p) => p.userId === u));
    if (fresh.length && (await this.prisma.user.count({ where: { id: { in: fresh }, active: true } })) !== fresh.length) throw new AppError('VALIDATION_FAILED', 'Teilnehmer nicht gefunden oder inaktiv.');
    await this.prisma.$transaction(async (tx) => {
      await tx.calendarParticipant.createMany({ data: fresh.map((userId) => ({ eventId: id, userId, status: 'INVITED' })), skipDuplicates: true });
      await this.audit.record(actor, { action: 'calendar.invite', module: 'calendar', entityType: 'CalendarEvent', entityId: id, after: { userIds: fresh } }, tx);
    });
    if (fresh.length) await this.notify.emit(e.category === 'MEETING' ? 'calendar.new' : 'calendar.new', fresh, { title: `📅 Einladung: ${e.title} (${this.when(e)})`, link: `/calendar?id=${id}`, entityType: 'CalendarEvent', entityId: id, dedupeKey: `${id}:new` });
    return this.get(actor, id);
  }

  /**
   * Eigene Antwort: zusagen, absagen, Abwesenheit melden. Offene Termine: jeder mit calendar.view;
   * geschlossene nur Eingeladene. Höchstzahl wird unter Zeilensperre geprüft.
   */
  async respond(actor: Actor, id: string, status: 'ACCEPTED' | 'DECLINED' | 'EXCUSED', note?: string) {
    const e = await this.load(id);
    const mine = e.participants.find((p) => p.userId === actor.userId);
    if (!mine && !e.openSignup) throw new AppError('PERMISSION_DENIED', 'Zu diesem Termin bist du nicht eingeladen.');
    if (mine?.status === status) throw new AppError('CONFLICT', status === 'ACCEPTED' ? 'Du hast schon zugesagt.' : 'Das hast du schon gemeldet.');
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CalendarEvent" WHERE id = ${id}::uuid FOR UPDATE`;
      const accepted = await tx.calendarParticipant.count({ where: { eventId: id, status: 'ACCEPTED' } });
      const why = canRespond(e, accepted, status !== 'ACCEPTED' || mine?.status === 'ACCEPTED');
      if (why) throw new AppError('CONFLICT', why);
      await tx.calendarParticipant.upsert({ where: { eventId_userId: { eventId: id, userId: actor.userId! } }, create: { eventId: id, userId: actor.userId!, status, note: note || null, respondedAt: new Date() }, update: { status, note: note || null, respondedAt: new Date() } });
      await this.audit.record(actor, { action: `calendar.respond.${status.toLowerCase()}`, module: 'calendar', entityType: 'CalendarEvent', entityId: id }, tx);
    });
    return this.get(actor, id);
  }

  /** Anwesenheit erfassen (nach Beginn): Organisator, Kalenderverwaltung oder meetings.organize bei Besprechungen. */
  async attendance(actor: Actor, id: string, entries: { userId: string; status: 'ATTENDED' | 'ABSENT' | 'EXCUSED' }[]) {
    const e = await this.load(id);
    const ok = (await this.mayEdit(actor.userId!, e)) || (e.category === 'MEETING' && (await this.perms.has(actor.userId!, 'meetings.organize')));
    if (!ok) throw new AppError('PERMISSION_DENIED', 'Anwesenheit erfassen darf nur der Organisator.');
    if (e.status === 'CANCELLED') throw new AppError('CONFLICT', 'Der Termin wurde abgesagt.');
    if (e.startsAt.getTime() > Date.now()) throw new AppError('CONFLICT', 'Anwesenheit kann erst ab Beginn erfasst werden.');
    await this.prisma.$transaction(async (tx) => {
      for (const x of entries) await tx.calendarParticipant.upsert({ where: { eventId_userId: { eventId: id, userId: x.userId } }, create: { eventId: id, userId: x.userId, status: x.status }, update: { status: x.status } });
      await this.audit.record(actor, { action: 'calendar.attendance', module: 'calendar', entityType: 'CalendarEvent', entityId: id, after: { entries: entries.length } }, tx);
    });
    return this.get(actor, id);
  }

  /** Kommende Termine für Discord/MDT/Leitstelle: eigene und offene, die nächsten `days` Tage. */
  async upcoming(actor: Actor, days = 14, scope: 'mine' | 'all' = 'all') {
    const now = new Date();
    const r = await this.list(actor, { from: now, to: new Date(now.getTime() + days * 24 * H), mine: scope === 'mine' });
    return r.items.filter((x) => (x as { status: string }).status === 'SCHEDULED' && (x as { source: string }).source === 'calendar').slice(0, 25);
  }

  /** Jede Minute: fällige Erinnerungen genau einmal je Termin/Beginn/Vorlaufzeit; vergangene Termine abschließen. */
  async tick(now = new Date()) {
    const done = await this.prisma.calendarEvent.updateMany({ where: { status: 'SCHEDULED', endsAt: { lt: new Date(now.getTime() - H) } }, data: { status: 'DONE' } });
    const soon = await this.prisma.calendarEvent.findMany({ where: { status: 'SCHEDULED', startsAt: { gt: now, lte: new Date(now.getTime() + 7 * 24 * H) }, NOT: { reminders: { isEmpty: true } } }, include: { participants: true, meeting: { select: { discordChannelId: true, mandatory: true } }, reminderLogs: true }, take: 200 });
    let sent = 0;
    for (const e of soon) {
      const done = e.reminderLogs.filter((l) => l.startsAt.getTime() === e.startsAt.getTime()).map((l) => l.minutesBefore);
      const due = dueReminders(e.startsAt, e.reminders, done, now);
      if (!due.length) continue;
      const to = e.participants.filter((p) => ['INVITED', 'ACCEPTED'].includes(p.status)).map((p) => p.userId);
      // alle übersprungenen Vorlaufzeiten als erledigt markieren; Konflikt = andere Instanz war schneller → nichts senden
      let mine = false;
      for (const m of passedReminders(e.startsAt, e.reminders, done, now)) {
        try { await this.prisma.calendarReminderLog.create({ data: { eventId: e.id, startsAt: e.startsAt, minutesBefore: m, recipients: m === due[0] ? to.length : 0 } }); if (m === due[0]) mine = true; }
        catch (err) { if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err; }
      }
      if (!mine) continue;
      const meeting = e.category === 'MEETING';
      const title = `⏰ ${meeting ? 'Besprechung' : 'Termin'}: ${e.title} – ${this.when(e)}`;
      sent += await this.notify.emit(meeting ? 'meeting.reminder' : 'calendar.reminder', to, { title, link: `/calendar?id=${e.id}`, entityType: 'CalendarEvent', entityId: e.id, dedupeKey: `${e.id}:${e.startsAt.getTime()}:${due[0]}` });
      if (meeting && e.meeting?.discordChannelId) await this.discord.postMessage(`meeting-reminder-${e.id}`, e.meeting.discordChannelId, { embeds: [{ title: `⏰ Erinnerung: ${e.title}`.slice(0, 256), description: `Beginn <t:${Math.floor(e.startsAt.getTime() / 1000)}:R> (<t:${Math.floor(e.startsAt.getTime() / 1000)}:f>)${e.meeting.mandatory ? '\n**Teilnahme verpflichtend.**' : ''}${e.location ? `\nOrt: ${e.location}` : ''}`, color: 0x8b5cf6 }] }, { forceNew: true });
    }
    return { completed: done.count, reminded: sent };
  }
}
