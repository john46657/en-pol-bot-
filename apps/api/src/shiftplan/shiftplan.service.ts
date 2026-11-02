import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type PlannedShift, type ShiftAssignment } from '@prisma/client';
import { z } from 'zod';
import { compareStaffing, coverage, expandRecurrence, overlaps, toCsv, withHrDefaults, ORG_TIME_ZONE, RECURRENCE_FREQS, PLANNED_SHIFT_STATUS_LABEL, type PlannedShiftStatus } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { NotifyService } from '../notifications/notify.service';
import { DiscordService } from '../discord/discord.service';
import { AppError } from '../common/errors';

const HOUR = 3_600_000;
const CONFIG_KEY = 'shiftplan.config';
const sf = z.string().regex(/^\d{15,25}$/);
/** Einstellungen der Schichtplanung (je Server). */
export const shiftplanConfigSchema = z.object({
  /** Kanal für veröffentlichte Schichtpläne (optional, nur Name/Zeit/Besetzung – keine Namen von Abwesenden) */
  channelId: sf.nullish(),
  /** Mitglieder dürfen sich selbst an-/abmelden */
  selfSignup: z.boolean().default(true),
  /** Erinnerung an Zugewiesene so viele Minuten vor Schichtbeginn (0 = aus) */
  reminderMinutes: z.number().int().min(0).max(1440).default(60),
});
export type ShiftplanConfig = z.infer<typeof shiftplanConfigSchema>;

export const shiftInput = z.object({
  name: z.string().trim().min(2).max(100),
  startsAt: z.coerce.date(), endsAt: z.coerce.date(),
  department: z.string().trim().max(64).nullish(),
  description: z.string().trim().max(2000).nullish(),
  leaderId: z.string().uuid().nullish(),
  unit: z.string().trim().max(40).nullish(),
  minStaff: z.number().int().min(0).max(200).default(1),
  maxStaff: z.number().int().min(1).max(200).nullish(),
});
export const createShiftBody = shiftInput.extend({
  assigneeIds: z.array(z.string().uuid()).max(100).default([]),
  publish: z.boolean().default(false),
  recurrence: z.object({ freq: z.enum(RECURRENCE_FREQS), count: z.number().int().min(1).max(52) }).nullish(),
});
export type ShiftInput = z.infer<typeof shiftInput>;

type Row = PlannedShift & { assignments: ShiftAssignment[] };
const ACTIVE_SHIFT = ['DRAFT', 'PUBLISHED'];

/**
 * Schichtplanung (Dienstplan). Plan und tatsächlicher Dienst sind getrennt: die Stempeluhr (DutySession) bleibt unverändert,
 * die Leitstelle vergleicht beides. Regeln: keine doppelten Anmeldungen (Unique + Status), keine überlappenden Schichten je Person,
 * keine Anmeldung während einer genehmigten Abwesenheit, nichts mit Nachweisen wird gelöscht (nur abgesagt), jede Änderung im Audit.
 */
@Injectable()
export class ShiftPlanService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly perms: PermissionService, private readonly notify: NotifyService, private readonly discord: DiscordService) {}

  async config(): Promise<ShiftplanConfig> {
    const r = shiftplanConfigSchema.safeParse((await this.prisma.systemSetting.findUnique({ where: { key: CONFIG_KEY } }))?.value ?? {});
    return r.success ? r.data : shiftplanConfigSchema.parse({});
  }
  async saveConfig(actor: Actor, c: ShiftplanConfig) {
    const value = c as unknown as Prisma.InputJsonValue;
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: CONFIG_KEY }, create: { key: CONFIG_KEY, value }, update: { value } });
      await this.audit.record(actor, { action: 'shiftplan.config', module: 'shiftplan', entityType: 'SystemSetting', entityId: CONFIG_KEY, after: c }, tx);
    });
    return this.config();
  }

  private async departments() { return withHrDefaults((await this.prisma.systemSetting.findUnique({ where: { key: 'hr.config' } }))?.value).departments.map((d) => d.name); }
  private async names(ids: string[]) {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, displayName: true } });
    return new Map(users.map((u) => [u.id, u.displayName]));
  }
  private async manager(actor: Actor) { return this.perms.has(actor.userId!, 'shiftplan.manage'); }

  private validate(d: { startsAt: Date; endsAt: Date; minStaff: number; maxStaff?: number | null }) {
    if (Number.isNaN(d.startsAt.getTime()) || Number.isNaN(d.endsAt.getTime())) throw new AppError('VALIDATION_FAILED', 'Ungültige Zeitangabe.');
    if (d.endsAt.getTime() <= d.startsAt.getTime()) throw new AppError('VALIDATION_FAILED', 'Das Ende muss nach dem Beginn liegen.');
    if (d.endsAt.getTime() - d.startsAt.getTime() > 24 * HOUR) throw new AppError('VALIDATION_FAILED', 'Eine Schicht darf höchstens 24 Stunden dauern.');
    if (d.maxStaff != null && d.maxStaff < d.minStaff) throw new AppError('VALIDATION_FAILED', 'Die maximale Besetzung darf nicht kleiner als die Mindestbesetzung sein.');
  }
  private async checkRefs(d: { department?: string | null; leaderId?: string | null }) {
    if (d.department && !(await this.departments()).includes(d.department)) throw new AppError('VALIDATION_FAILED', `Abteilung „${d.department}“ gibt es nicht (Einstellungen → Personal → Abteilungen).`);
    if (d.leaderId && !(await this.prisma.user.findFirst({ where: { id: d.leaderId, active: true } }))) throw new AppError('VALIDATION_FAILED', 'Verantwortlicher Leiter nicht gefunden oder inaktiv.');
  }

  /**
   * Konflikte einer Person im Zeitraum: andere aktive Schichten (überlappend) und genehmigte bzw. geprüfte Abwesenheiten.
   * Abwesenheitsgründe werden nie zurückgegeben.
   */
  async conflictsFor(userId: string, startsAt: Date, endsAt: Date, exceptShiftId?: string) {
    const [shifts, leave] = await Promise.all([
      this.prisma.shiftAssignment.findMany({ where: { userId, status: 'ACTIVE', shift: { status: { in: ACTIVE_SHIFT }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, ...(exceptShiftId ? { id: { not: exceptShiftId } } : {}) } }, include: { shift: { select: { id: true, name: true, startsAt: true, endsAt: true } } } }),
      this.prisma.leaveRequest.findFirst({ where: { userId, status: { in: ['APPROVED', 'IN_REVIEW'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { number: true, status: true } }),
    ]);
    return { shifts: shifts.map((s) => s.shift).filter((s) => overlaps(s.startsAt, s.endsAt, startsAt, endsAt)), leave: leave ? { number: leave.number, approved: leave.status === 'APPROVED' } : null };
  }
  private conflictText(name: string, c: Awaited<ReturnType<ShiftPlanService['conflictsFor']>>) {
    if (c.shifts.length) return `${name} ist zur selben Zeit schon für „${c.shifts[0]!.name}“ eingeplant.`;
    if (c.leave?.approved) return `${name} ist in diesem Zeitraum abgemeldet (${c.leave.number}).`;
    if (c.leave) return `${name} hat für diesen Zeitraum eine Abmeldung in Prüfung (${c.leave.number}).`;
    return null;
  }

  /** Darstellung: Besetzung, Namen, Konflikte mit genehmigten Abwesenheiten (ohne Grund). */
  private async view(rows: Row[], actorId: string) {
    const ids = rows.flatMap((r) => [...r.assignments.map((a) => a.userId), ...(r.leaderId ? [r.leaderId] : [])]);
    const names = await this.names(ids);
    const active = rows.flatMap((r) => r.assignments.filter((a) => a.status === 'ACTIVE').map((a) => ({ userId: a.userId, r })));
    const leaves = active.length ? await this.prisma.leaveRequest.findMany({ where: { userId: { in: [...new Set(active.map((a) => a.userId))] }, status: 'APPROVED', startsAt: { lt: new Date(Math.max(...rows.map((r) => r.endsAt.getTime()))) }, endsAt: { gt: new Date(Math.min(...rows.map((r) => r.startsAt.getTime()))) } }, select: { userId: true, startsAt: true, endsAt: true } }) : [];
    return rows.map((r) => {
      const act = r.assignments.filter((a) => a.status === 'ACTIVE');
      return {
        id: r.id, name: r.name, startsAt: r.startsAt, endsAt: r.endsAt, timezone: r.timezone, department: r.department, description: r.description, unit: r.unit,
        leaderId: r.leaderId, leaderName: r.leaderId ? names.get(r.leaderId) ?? '—' : null, minStaff: r.minStaff, maxStaff: r.maxStaff,
        status: r.status, statusLabel: PLANNED_SHIFT_STATUS_LABEL[r.status as PlannedShiftStatus] ?? r.status, cancelReason: r.cancelReason, seriesId: r.seriesId, version: r.version, publishedAt: r.publishedAt,
        coverage: coverage(act.length, r.minStaff, r.maxStaff ?? null),
        assignees: act.map((a) => ({ userId: a.userId, name: names.get(a.userId) ?? '—', source: a.source, absent: leaves.some((l) => l.userId === a.userId && overlaps(l.startsAt, l.endsAt, r.startsAt, r.endsAt)) })),
        mine: act.some((a) => a.userId === actorId),
      };
    });
  }

  async list(actor: Actor, f: { from?: Date; to?: Date; department?: string; status?: string; mine?: boolean }) {
    const manager = await this.manager(actor);
    const from = f.from ?? new Date(Date.now() - 7 * 24 * HOUR), to = f.to ?? new Date(from.getTime() + 35 * 24 * HOUR);
    if (to.getTime() - from.getTime() > 400 * 24 * HOUR) throw new AppError('VALIDATION_FAILED', 'Zeitraum höchstens ein Jahr.');
    const where: Prisma.PlannedShiftWhereInput = {
      startsAt: { lt: to }, endsAt: { gt: from },
      ...(f.department ? { department: f.department } : {}),
      // Entwürfe sieht nur die Planung
      ...(f.status ? { status: !manager && f.status === 'DRAFT' ? '__none__' : f.status } : manager ? {} : { status: { in: ['PUBLISHED', 'COMPLETED', 'CANCELLED'] } }),
      ...(f.mine ? { assignments: { some: { userId: actor.userId!, status: 'ACTIVE' } } } : {}),
    };
    const rows = await this.prisma.plannedShift.findMany({ where, include: { assignments: true }, orderBy: { startsAt: 'asc' }, take: 1000 });
    return { manager, items: await this.view(rows, actor.userId!), departments: await this.departments() };
  }

  private async load(id: string) {
    const r = await this.prisma.plannedShift.findUnique({ where: { id }, include: { assignments: true } });
    if (!r) throw new AppError('NOT_FOUND', 'Schicht nicht gefunden.');
    return r;
  }
  async get(actor: Actor, id: string) {
    const r = await this.load(id);
    if (r.status === 'DRAFT' && !(await this.manager(actor))) throw new AppError('NOT_FOUND', 'Schicht nicht gefunden.');
    const [v] = await this.view([r], actor.userId!);
    const history = await this.prisma.auditLog.findMany({ where: { entityType: 'PlannedShift', entityId: id }, orderBy: { createdAt: 'desc' }, take: 50, select: { action: true, createdAt: true, actorUserId: true } });
    const names = await this.names(history.map((h) => h.actorUserId).filter((x): x is string => !!x));
    return { ...v, history: history.map((h) => ({ action: h.action, at: h.createdAt, by: h.actorUserId ? names.get(h.actorUserId) ?? '—' : 'Automatik' })) };
  }

  async create(actor: Actor, d: z.infer<typeof createShiftBody>) {
    this.validate(d);
    await this.checkRefs(d);
    const occ = d.recurrence ? expandRecurrence(d.startsAt, d.endsAt, d.recurrence, ORG_TIME_ZONE) : [{ startsAt: d.startsAt, endsAt: d.endsAt }];
    if (occ.some((o) => o.endsAt.getTime() <= Date.now())) throw new AppError('VALIDATION_FAILED', 'Schichten in der Vergangenheit können nicht geplant werden.');
    const assignees = [...new Set(d.assigneeIds)];
    if (d.maxStaff != null && assignees.length > d.maxStaff) throw new AppError('VALIDATION_FAILED', `Mehr Zuweisungen (${assignees.length}) als maximale Besetzung (${d.maxStaff}).`);
    const names = await this.names(assignees);
    for (const u of assignees) {
      if (!names.has(u)) throw new AppError('VALIDATION_FAILED', 'Zugewiesene Person nicht gefunden.');
      for (const o of occ) {
        const msg = this.conflictText(names.get(u)!, await this.conflictsFor(u, o.startsAt, o.endsAt));
        if (msg) throw new AppError('CONFLICT', `${msg} (${o.startsAt.toLocaleString('de-DE', { timeZone: ORG_TIME_ZONE })})`);
      }
    }
    const seriesId = occ.length > 1 ? randomUUID() : null;
    const status = d.publish ? 'PUBLISHED' : 'DRAFT';
    const created = await this.prisma.$transaction(async (tx) => {
      const out: PlannedShift[] = [];
      for (const o of occ) {
        const s = await tx.plannedShift.create({ data: { name: d.name, startsAt: o.startsAt, endsAt: o.endsAt, department: d.department || null, description: d.description || null, leaderId: d.leaderId || null, unit: d.unit || null, minStaff: d.minStaff, maxStaff: d.maxStaff ?? null, status, seriesId, createdById: actor.userId!, publishedAt: d.publish ? new Date() : null, assignments: { create: assignees.map((userId) => ({ userId, source: 'ASSIGNED', createdById: actor.userId })) } } });
        await this.audit.record(actor, { action: 'shiftplan.create', module: 'shiftplan', entityType: 'PlannedShift', entityId: s.id, after: { name: s.name, startsAt: s.startsAt, endsAt: s.endsAt, status, assignees: assignees.length, seriesId } }, tx);
        out.push(s);
      }
      return out;
    });
    if (d.publish) for (const s of created) await this.announceAssigned(s, assignees, 'shift.new');
    return { created: created.length, ids: created.map((s) => s.id), seriesId };
  }

  private async announceAssigned(s: PlannedShift, userIds: string[], event: 'shift.new' | 'shift.changed', why?: string) {
    if (!userIds.length) return;
    const when = `${s.startsAt.toLocaleString('de-DE', { timeZone: s.timezone, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}–${s.endsAt.toLocaleTimeString('de-DE', { timeZone: s.timezone, hour: '2-digit', minute: '2-digit' })}`;
    await this.notify.emit(event, userIds, {
      title: event === 'shift.new' ? `🗓️ Neue Schicht: ${s.name} (${when})` : `🔁 Schicht geändert: ${s.name} (${when})`,
      body: why, link: `/shiftplan?id=${s.id}`, entityType: 'PlannedShift', entityId: s.id, dedupeKey: `${s.id}:v${s.version}:${event}`,
      dmText: `${event === 'shift.new' ? 'Du wurdest für eine Schicht eingeplant' : 'Eine deiner Schichten wurde geändert'}: **${s.name}**, ${when}${why ? `\n${why}` : ''}`,
    });
  }

  async update(actor: Actor, id: string, d: ShiftInput & { version: number }) {
    this.validate(d);
    await this.checkRefs(d);
    const r = await this.load(id);
    if (!ACTIVE_SHIFT.includes(r.status)) throw new AppError('CONFLICT', 'Abgesagte oder abgeschlossene Schichten können nicht mehr geändert werden.');
    const active = r.assignments.filter((a) => a.status === 'ACTIVE');
    if (d.maxStaff != null && active.length > d.maxStaff) throw new AppError('CONFLICT', `Es sind schon ${active.length} Personen eingeteilt – mehr als die neue maximale Besetzung.`);
    const timeChanged = r.startsAt.getTime() !== d.startsAt.getTime() || r.endsAt.getTime() !== d.endsAt.getTime();
    if (timeChanged) {
      const names = await this.names(active.map((a) => a.userId));
      for (const a of active) {
        const msg = this.conflictText(names.get(a.userId) ?? 'Eine Person', await this.conflictsFor(a.userId, d.startsAt, d.endsAt, id));
        if (msg) throw new AppError('CONFLICT', msg);
      }
    }
    const after = await this.prisma.$transaction(async (tx) => {
      const n = await tx.plannedShift.updateMany({ where: { id, version: d.version, status: { in: ACTIVE_SHIFT } }, data: { name: d.name, startsAt: d.startsAt, endsAt: d.endsAt, department: d.department || null, description: d.description || null, leaderId: d.leaderId || null, unit: d.unit || null, minStaff: d.minStaff, maxStaff: d.maxStaff ?? null, version: { increment: 1 } } });
      if (!n.count) throw new AppError('CONFLICT', 'Die Schicht wurde inzwischen geändert. Bitte neu laden.');
      const s = await tx.plannedShift.findUniqueOrThrow({ where: { id } });
      await this.audit.record(actor, { action: 'shiftplan.update', module: 'shiftplan', entityType: 'PlannedShift', entityId: id, before: { name: r.name, startsAt: r.startsAt, endsAt: r.endsAt, leaderId: r.leaderId, minStaff: r.minStaff, maxStaff: r.maxStaff }, after: { name: s.name, startsAt: s.startsAt, endsAt: s.endsAt, leaderId: s.leaderId, minStaff: s.minStaff, maxStaff: s.maxStaff } }, tx);
      return s;
    });
    if (r.status === 'PUBLISHED') await this.announceAssigned(after, active.map((a) => a.userId), 'shift.changed', timeChanged ? 'Neue Zeiten – bitte prüfen.' : undefined);
    return this.get(actor, id);
  }

  async publish(actor: Actor, id: string) {
    const r = await this.load(id);
    if (r.status !== 'DRAFT') throw new AppError('CONFLICT', 'Nur Entwürfe können veröffentlicht werden.');
    if (r.endsAt.getTime() <= Date.now()) throw new AppError('CONFLICT', 'Die Schicht liegt in der Vergangenheit.');
    const s = await this.prisma.$transaction(async (tx) => {
      const n = await tx.plannedShift.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'PUBLISHED', publishedAt: new Date(), version: { increment: 1 } } });
      if (!n.count) throw new AppError('CONFLICT', 'Die Schicht wurde gerade schon veröffentlicht.');
      await this.audit.record(actor, { action: 'shiftplan.publish', module: 'shiftplan', entityType: 'PlannedShift', entityId: id }, tx);
      return tx.plannedShift.findUniqueOrThrow({ where: { id } });
    });
    await this.announceAssigned(s, r.assignments.filter((a) => a.status === 'ACTIVE').map((a) => a.userId), 'shift.new');
    const cfg = await this.config();
    if (cfg.channelId) {
      const when = `<t:${Math.floor(s.startsAt.getTime() / 1000)}:F> – <t:${Math.floor(s.endsAt.getTime() / 1000)}:t>`;
      await this.discord.postMessage(`shift-${s.id}`, cfg.channelId, { embeds: [{ title: `🗓️ Schicht: ${s.name}`.slice(0, 256), description: [when, s.department ? `**Abteilung:** ${s.department}` : null, `**Besetzung:** ${coverage(r.assignments.filter((a) => a.status === 'ACTIVE').length, s.minStaff, s.maxStaff).assigned}/${s.maxStaff ?? s.minStaff}`, cfg.selfSignup ? 'Anmelden: `/schichtplan anmelden`' : null].filter(Boolean).join('\n'), color: 0x3b82f6 }] });
    }
    return this.get(actor, id);
  }

  async cancel(actor: Actor, id: string, reason: string) {
    const r = await this.load(id);
    if (!ACTIVE_SHIFT.includes(r.status)) throw new AppError('CONFLICT', 'Die Schicht ist schon abgesagt oder abgeschlossen.');
    const s = await this.prisma.$transaction(async (tx) => {
      const n = await tx.plannedShift.updateMany({ where: { id, status: { in: ACTIVE_SHIFT } }, data: { status: 'CANCELLED', cancelReason: reason, version: { increment: 1 } } });
      if (!n.count) throw new AppError('CONFLICT', 'Die Schicht wurde gerade schon abgesagt.');
      await this.audit.record(actor, { action: 'shiftplan.cancel', module: 'shiftplan', entityType: 'PlannedShift', entityId: id, reason }, tx);
      return tx.plannedShift.findUniqueOrThrow({ where: { id } });
    });
    if (r.status === 'PUBLISHED') await this.announceAssigned(s, r.assignments.filter((a) => a.status === 'ACTIVE').map((a) => a.userId), 'shift.changed', `Abgesagt: ${reason}`);
    return this.get(actor, id);
  }

  /** Löschen nur ohne Nachweise: Entwurf, in der Zukunft, nie jemand zugewiesen. Sonst absagen. */
  async remove(actor: Actor, id: string) {
    const r = await this.load(id);
    if (r.status !== 'DRAFT' || r.assignments.length || r.startsAt.getTime() <= Date.now()) throw new AppError('CONFLICT', 'Diese Schicht hat schon Nachweise (veröffentlicht, Zuweisungen oder vergangen) – bitte absagen statt löschen.');
    await this.prisma.$transaction(async (tx) => {
      await tx.plannedShift.delete({ where: { id } });
      await this.audit.record(actor, { action: 'shiftplan.delete', module: 'shiftplan', entityType: 'PlannedShift', entityId: id, before: { name: r.name, startsAt: r.startsAt, endsAt: r.endsAt } }, tx);
    });
    return { deleted: true };
  }

  /** Kopieren: gleiche Angaben als Entwurf, neuer Beginn (Dauer bleibt), ohne Zuweisungen. */
  async copy(actor: Actor, id: string, startsAt: Date) {
    const r = await this.load(id);
    const endsAt = new Date(startsAt.getTime() + (r.endsAt.getTime() - r.startsAt.getTime()));
    return this.create(actor, { name: r.name, startsAt, endsAt, department: r.department, description: r.description, leaderId: r.leaderId, unit: r.unit, minStaff: r.minStaff, maxStaff: r.maxStaff, assigneeIds: [], publish: false, recurrence: null });
  }

  /** Zuweisen (Planung) bzw. selbst anmelden. Doppelte Anmeldung → Konflikt; frühere Abmeldung wird wieder aktiv. */
  private async join(actor: Actor, r: Row, userId: string, source: 'ASSIGNED' | 'SIGNUP') {
    if (!ACTIVE_SHIFT.includes(r.status)) throw new AppError('CONFLICT', 'Die Schicht ist abgesagt oder abgeschlossen.');
    if (r.startsAt.getTime() <= Date.now()) throw new AppError('CONFLICT', 'Die Schicht hat schon begonnen.');
    const existing = r.assignments.find((a) => a.userId === userId);
    if (existing?.status === 'ACTIVE') throw new AppError('CONFLICT', source === 'SIGNUP' ? 'Du bist für diese Schicht schon angemeldet.' : 'Diese Person ist schon eingeteilt.');
    const user = await this.prisma.user.findFirst({ where: { id: userId, active: true }, select: { displayName: true } });
    if (!user) throw new AppError('NOT_FOUND', 'Person nicht gefunden.');
    const msg = this.conflictText(source === 'SIGNUP' ? 'Du' : user.displayName, await this.conflictsFor(userId, r.startsAt, r.endsAt, r.id));
    if (msg) throw new AppError('CONFLICT', source === 'SIGNUP' ? msg.replace('Du ist', 'Du bist').replace('Du hat', 'Du hast') : msg);
    await this.prisma.$transaction(async (tx) => {
      // Besetzungsgrenze unter Sperre der Schicht prüfen (parallele Anmeldungen)
      await tx.$queryRaw`SELECT id FROM "PlannedShift" WHERE id = ${r.id}::uuid FOR UPDATE`;
      const count = await tx.shiftAssignment.count({ where: { shiftId: r.id, status: 'ACTIVE' } });
      if (r.maxStaff != null && count >= r.maxStaff) throw new AppError('CONFLICT', 'Die Schicht ist voll besetzt.');
      if (existing) {
        const n = await tx.shiftAssignment.updateMany({ where: { id: existing.id, status: 'WITHDRAWN' }, data: { status: 'ACTIVE', source, createdById: actor.userId, withdrawnAt: null } });
        if (!n.count) throw new AppError('CONFLICT', 'Schon angemeldet.');
      } else {
        try { await tx.shiftAssignment.create({ data: { shiftId: r.id, userId, source, createdById: actor.userId } }); }
        catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError('CONFLICT', 'Schon angemeldet.'); throw e; }
      }
      await this.audit.record(actor, { action: source === 'SIGNUP' ? 'shiftplan.signup' : 'shiftplan.assign', module: 'shiftplan', entityType: 'PlannedShift', entityId: r.id, after: { userId } }, tx);
    });
    if (r.status === 'PUBLISHED' && source === 'ASSIGNED') await this.announceAssigned(r, [userId], 'shift.new');
  }
  async assign(actor: Actor, id: string, userIds: string[]) {
    const r = await this.load(id);
    for (const u of [...new Set(userIds)]) await this.join(actor, await this.load(r.id), u, 'ASSIGNED');
    return this.get(actor, id);
  }
  async signup(actor: Actor, id: string) {
    if (!(await this.config()).selfSignup && !(await this.manager(actor))) throw new AppError('PERMISSION_DENIED', 'Selbst anmelden ist ausgeschaltet – die Schichtleitung teilt ein.');
    const r = await this.load(id);
    if (r.status !== 'PUBLISHED') throw new AppError('NOT_FOUND', 'Schicht nicht gefunden.');
    await this.join(actor, r, actor.userId!, 'SIGNUP');
    if (r.leaderId && r.leaderId !== actor.userId) await this.notify.emit('shift.changed', [r.leaderId], { title: `➕ Anmeldung für ${r.name}`, link: `/shiftplan?id=${r.id}`, entityType: 'PlannedShift', entityId: r.id, dedupeKey: `${r.id}:signup:${actor.userId}:${Date.now()}` });
    return this.get(actor, id);
  }

  /** Abmelden (selbst) bzw. austragen (Planung). Die Zuweisung bleibt als WITHDRAWN erhalten. */
  async leave(actor: Actor, id: string, userId: string, reason?: string) {
    const r = await this.load(id);
    const self = userId === actor.userId;
    if (!self && !(await this.manager(actor))) throw new AppError('PERMISSION_DENIED', 'Andere austragen darf nur die Schichtplanung.');
    if (self && r.startsAt.getTime() <= Date.now()) throw new AppError('CONFLICT', 'Die Schicht hat schon begonnen – bitte bei der Schichtleitung melden.');
    const a = r.assignments.find((x) => x.userId === userId && x.status === 'ACTIVE');
    if (!a) throw new AppError('CONFLICT', self ? 'Du bist für diese Schicht nicht angemeldet.' : 'Diese Person ist nicht eingeteilt.');
    await this.prisma.$transaction(async (tx) => {
      const n = await tx.shiftAssignment.updateMany({ where: { id: a.id, status: 'ACTIVE' }, data: { status: 'WITHDRAWN', withdrawnAt: new Date() } });
      if (!n.count) throw new AppError('CONFLICT', 'Schon abgemeldet.');
      await this.audit.record(actor, { action: self ? 'shiftplan.withdraw' : 'shiftplan.unassign', module: 'shiftplan', entityType: 'PlannedShift', entityId: id, after: { userId }, reason }, tx);
    });
    const notifyIds = self ? [r.leaderId, r.createdById].filter((x): x is string => !!x && x !== actor.userId) : [userId];
    if (r.status === 'PUBLISHED' && notifyIds.length) await this.notify.emit('shift.changed', notifyIds, { title: self ? `➖ Abmeldung von ${r.name}` : `➖ Du wurdest aus „${r.name}“ ausgetragen`, body: reason, link: `/shiftplan?id=${r.id}`, entityType: 'PlannedShift', entityId: r.id, dedupeKey: `${r.id}:leave:${userId}:${Date.now()}` });
    return this.get(actor, id);
  }

  /** „Schichtänderung melden“ (z. B. später da, Tausch gewünscht): geht an Leiter und Planer, im Audit protokolliert. */
  async report(actor: Actor, id: string, message: string) {
    const r = await this.load(id);
    if (r.status === 'DRAFT') throw new AppError('NOT_FOUND', 'Schicht nicht gefunden.');
    if (!r.assignments.some((a) => a.userId === actor.userId && a.status === 'ACTIVE') && r.leaderId !== actor.userId) throw new AppError('PERMISSION_DENIED', 'Änderungen melden können nur Eingeteilte.');
    const me = (await this.names([actor.userId!])).get(actor.userId!) ?? '—';
    await this.audit.record(actor, { action: 'shiftplan.report', module: 'shiftplan', entityType: 'PlannedShift', entityId: id, after: { message } });
    const targets = [...new Set([r.leaderId, r.createdById].filter((x): x is string => !!x && x !== actor.userId))];
    const n = targets.length ? await this.notify.emit('shift.changed', targets, { title: `📣 Meldung zu ${r.name} von ${me}`, body: message, link: `/shiftplan?id=${r.id}`, entityType: 'PlannedShift', entityId: id, dedupeKey: `${id}:report:${actor.userId}:${Date.now()}`, dmText: `**${me}** meldet zu „${r.name}“: ${message}` }) : 0;
    return { delivered: n };
  }

  /** Eigene kommende Schichten (Discord „Meine Schichten“, MDT). */
  async mine(actor: Actor, days = 14) {
    const now = new Date();
    const rows = await this.prisma.plannedShift.findMany({ where: { status: 'PUBLISHED', endsAt: { gt: now }, startsAt: { lt: new Date(now.getTime() + days * 24 * HOUR) }, assignments: { some: { userId: actor.userId!, status: 'ACTIVE' } } }, include: { assignments: true }, orderBy: { startsAt: 'asc' }, take: 50 });
    return this.view(rows, actor.userId!);
  }

  /** MDT: aktuelle bzw. nächste eigene Schicht mit Leiter, Einheit, Abteilung und Dienstzeiten. */
  async current(actor: Actor) {
    const items = await this.mine(actor, 7);
    const now = Date.now();
    const current = items.find((s) => new Date(s.startsAt).getTime() <= now && new Date(s.endsAt).getTime() > now) ?? null;
    return { current, next: items.find((s) => new Date(s.startsAt).getTime() > now) ?? null, upcoming: items.slice(0, 5) };
  }

  /**
   * Leitstelle: Besetzung der laufenden und heutigen Schichten – geplant vs. tatsächlich im Dienst (Stempeluhr) vs. abwesend.
   * Abwesenheitsgründe erscheinen nie.
   */
  async staffing(_actor: Actor, at = new Date()) {
    const dayEnd = new Date(at.getTime() + 12 * HOUR);
    const shifts = await this.prisma.plannedShift.findMany({ where: { status: 'PUBLISHED', startsAt: { lt: dayEnd }, endsAt: { gt: at } }, include: { assignments: { where: { status: 'ACTIVE' } } }, orderBy: { startsAt: 'asc' }, take: 50 });
    const onDuty = await this.prisma.dutySession.findMany({ where: { endedAt: null, status: { not: 'OFF_DUTY' } }, select: { userId: true, status: true, callsign: true, unitId: true } });
    const absent = await this.prisma.leaveRequest.findMany({ where: { status: 'APPROVED', startsAt: { lte: at }, endsAt: { gt: at } }, select: { userId: true } });
    const ids = [...shifts.flatMap((s) => [...s.assignments.map((a) => a.userId), ...(s.leaderId ? [s.leaderId] : [])]), ...onDuty.map((d) => d.userId), ...absent.map((a) => a.userId)];
    const names = await this.names(ids);
    const nm = (u: string) => ({ userId: u, name: names.get(u) ?? '—', status: onDuty.find((d) => d.userId === u)?.status ?? null, callsign: onDuty.find((d) => d.userId === u)?.callsign ?? null });
    const running = (s: PlannedShift) => s.startsAt.getTime() <= at.getTime();
    const rows = shifts.map((s) => {
      const cmp = compareStaffing(s.assignments.map((a) => a.userId), running(s) ? onDuty.map((d) => d.userId) : [], absent.map((a) => a.userId));
      return {
        id: s.id, name: s.name, startsAt: s.startsAt, endsAt: s.endsAt, department: s.department, unit: s.unit, running: running(s), leaderName: s.leaderId ? names.get(s.leaderId) ?? '—' : null,
        coverage: coverage(s.assignments.length, s.minStaff, s.maxStaff), presentCount: cmp.plannedPresent.length,
        plannedPresent: cmp.plannedPresent.map(nm), plannedMissing: cmp.plannedMissing.map(nm), plannedAbsent: cmp.plannedAbsent.map((u) => ({ userId: u, name: names.get(u) ?? '—' })),
      };
    });
    const plannedNow = new Set(shifts.filter(running).flatMap((s) => s.assignments.map((a) => a.userId)));
    return {
      at, shifts: rows,
      unplannedOnDuty: onDuty.filter((d) => !plannedNow.has(d.userId)).map((d) => nm(d.userId)),
      totals: { onDuty: onDuty.length, plannedNow: plannedNow.size, absentNow: absent.length },
    };
  }

  /** Auswahlliste für Zuweisungen/Leitung: aktive Personen mit Personalakte auf diesem Server (nur Name, Rang, Abteilung). */
  async people() {
    const rows = await this.prisma.personnel.findMany({ where: { employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] }, user: { active: true } }, select: { userId: true, rank: true, team: true, callsign: true, user: { select: { displayName: true } } }, orderBy: { user: { displayName: 'asc' } }, take: 1000 });
    return rows.map((r) => ({ userId: r.userId, name: r.user.displayName, rank: r.rank, department: r.team, callsign: r.callsign }));
  }

  async exportCsv(actor: Actor, f: { from?: Date; to?: Date; department?: string }) {
    const { items } = await this.list(actor, f);
    return toCsv(['Schicht', 'Beginn', 'Ende', 'Abteilung', 'Leitung', 'Einheit', 'Status', 'Mindestbesetzung', 'Maximal', 'Besetzt', 'Beamte'],
      items.map((s) => [s.name, new Date(s.startsAt).toLocaleString('de-DE', { timeZone: s.timezone }), new Date(s.endsAt).toLocaleString('de-DE', { timeZone: s.timezone }), s.department ?? '', s.leaderName ?? '', s.unit ?? '', s.statusLabel, s.minStaff, s.maxStaff ?? '', s.coverage.assigned, s.assignees.map((a) => a.name).join(', ')]));
  }

  /**
   * Jede Minute: vergangene veröffentlichte Schichten abschließen und Zugewiesene vor Beginn erinnern.
   * Genau einmal je Schicht und Person (Dubletten-Schutz der Benachrichtigung) – übersteht Neustarts und mehrere Instanzen.
   */
  async tick(now = new Date()) {
    const done = await this.prisma.plannedShift.updateMany({ where: { status: 'PUBLISHED', endsAt: { lte: now } }, data: { status: 'COMPLETED' } });
    const cfg = await this.config();
    let reminded = 0;
    if (cfg.reminderMinutes > 0) {
      const soon = await this.prisma.plannedShift.findMany({ where: { status: 'PUBLISHED', startsAt: { gt: now, lte: new Date(now.getTime() + cfg.reminderMinutes * 60_000) } }, include: { assignments: { where: { status: 'ACTIVE' } } }, take: 100 });
      for (const s of soon) {
        reminded += await this.notify.emit('calendar.reminder', s.assignments.map((a) => a.userId), { title: `⏰ Schicht „${s.name}“ beginnt ${s.startsAt.toLocaleTimeString('de-DE', { timeZone: s.timezone, hour: '2-digit', minute: '2-digit' })}`, link: `/shiftplan?id=${s.id}`, entityType: 'PlannedShift', entityId: s.id, dedupeKey: `${s.id}:reminder:${s.startsAt.getTime()}` });
      }
    }
    return { completed: done.count, reminded };
  }
}
