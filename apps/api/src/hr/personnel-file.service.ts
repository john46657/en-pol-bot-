import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { can, type PermissionContext } from '@enrp/shared';
import type { Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { NotifyService } from '../notifications/notify.service';
import { AppError } from '../common/errors';
import { loadEnv } from '../config/env';
import { OrgService } from '../org/org.service';
import { HrCoreService } from './hr-core.service';
import { QualificationRegistryService } from './qualification-registry.service';

const INACTIVE = ['RESIGNED', 'TERMINATED', 'INACTIVE'];
export interface NoteInput { summary: string; details?: string | null; category?: string | null; confidential?: boolean }

/**
 * Personalakte 2.0: ergänzt die bestehende Personalakte (HrPeopleService) um Diensthistorie, Personalvermerke mit Kategorie,
 * Vertraulichkeit und Änderungsverlauf, Dokumente, Qualifikationsregister, Organisationszugehörigkeit und Aktivitäten.
 *
 * Zugriff: `personnel.view` (alle Akten des Servers) ODER `personnel.view_unit` (nur Akten der Einheiten, die man führt bzw.
 * stellvertretend führt, inkl. Untereinheiten – Vererbung über das Organigramm). Fremde Akten verhalten sich wie „nicht gefunden“.
 * Vermerke: `personnel.notes_view`, vertrauliche zusätzlich `personnel.notes_confidential`. Dokumente: `personnel.documents`.
 */
@Injectable()
export class PersonnelFileService {
  constructor(private readonly core: HrCoreService, private readonly perms: PermissionService, private readonly org: OrgService, private readonly quals: QualificationRegistryService, private readonly notify: NotifyService) {}
  private get prisma() { return this.core.prisma; }

  /** Zugriff auf eine Akte prüfen; liefert den Rechte-Kontext für die Feinprüfung. */
  async access(actor: Actor, personnelId: string): Promise<{ ctx: PermissionContext; full: boolean; personnel: { id: string; userId: string; team: string | null; rank: string | null } }> {
    const ctx = await this.perms.contextFor(actor.userId!);
    const personnel = await this.prisma.personnel.findUnique({ where: { id: personnelId }, select: { id: true, userId: true, team: true, rank: true } });
    if (!personnel) throw new AppError('NOT_FOUND', 'Personalakte nicht gefunden.');
    if (can(ctx, 'personnel.view')) return { ctx, full: true, personnel };
    if (can(ctx, 'personnel.view_unit') && (await this.org.scopeOf(actor.userId!)).has(personnelId)) return { ctx, full: false, personnel };
    throw new AppError('NOT_FOUND', 'Personalakte nicht gefunden.');
  }

  /** Personalübersicht für Führungskräfte mit `personnel.view_unit` (nur zuständige Akten). */
  async unitOverview(actor: Actor) {
    const ids = [...(await this.org.scopeOf(actor.userId!))];
    const rows = await this.prisma.personnel.findMany({ where: { id: { in: ids } }, include: { user: { select: { displayName: true, robloxUsername: true } } }, take: 2000 });
    return rows.map((p) => ({ id: p.id, name: p.user.displayName, robloxName: p.user.robloxUsername, rank: p.rank, department: p.team, status: p.employmentStatus, serviceNumber: p.serviceNumber, callsign: p.callsign, joinDate: p.joinDate }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  private async dutyStatus(userId: string) {
    const s = await this.prisma.dutySession.findFirst({ where: { userId, endedAt: null }, orderBy: { startedAt: 'desc' }, select: { status: true, startedAt: true, callsign: true } });
    return { status: s?.status ?? 'OFF_DUTY', since: s?.startedAt ?? null, callsign: s?.callsign ?? null };
  }

  /** Bereiche der Personalakte 2.0 (Grunddaten liefert weiterhin GET /hr/people/:id). Lesen wird protokolliert. */
  async summary(actor: Actor, personnelId: string) {
    const { ctx, full, personnel: p } = await this.access(actor, personnelId);
    const since = new Date(Date.now() - 90 * 86_400_000);
    const [duty, units, quals, sessions, reports, trainings, exams, practical] = await Promise.all([
      this.dutyStatus(p.userId),
      this.org.unitsOf(p.id, p.team),
      this.quals.ofPersonnel(p.id),
      this.prisma.dutySession.findMany({ where: { userId: p.userId, startedAt: { gte: since } }, orderBy: { startedAt: 'desc' }, take: 200, select: { id: true, status: true, startedAt: true, endedAt: true, callsign: true } }),
      this.prisma.dutyReport.findMany({ where: { authorId: p.userId }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, number: true, templateName: true, period: true, periodStart: true, status: true, createdAt: true } }),
      this.prisma.hrTrainingProgress.findMany({ where: { personnelId: p.id }, include: { training: { select: { name: true } } }, orderBy: { updatedAt: 'desc' } }),
      this.prisma.hrExamAttempt.findMany({ where: { personnelId: p.id, status: 'GRADED' }, include: { exam: { select: { title: true } } }, orderBy: { gradedAt: 'desc' }, take: 100 }),
      this.prisma.hrPracticalAssessment.findMany({ where: { personnelId: p.id, status: 'COMPLETED' }, include: { exam: { select: { title: true } } }, orderBy: { completedAt: 'desc' }, take: 100 }),
    ]);
    const minutes = sessions.reduce((n, s) => n + (s.status === 'ON_DUTY' ? Math.max(0, ((s.endedAt ?? new Date()).getTime() - s.startedAt.getTime()) / 60_000) : 0), 0);
    const showNotes = can(ctx, 'personnel.notes_view');
    const showDocs = can(ctx, 'personnel.documents');
    const showActivity = can(ctx, 'personnel.view_sensitive') || can(ctx, 'promotion.view_history');
    await this.core.audit.record(actor, { action: 'personnel.file.read', module: 'personnel', entityType: 'Personnel', entityId: p.id, after: { scope: full ? 'ALL' : 'UNIT' } });
    return {
      id: p.id, access: full ? 'ALL' : 'UNIT',
      dutyStatus: duty, units,
      qualifications: quals,
      dutyHistory: { days: 90, minutesOnDuty: Math.round(minutes), sessions: sessions.slice(0, 50) },
      dutyReports: reports,
      trainings: trainings.map((t) => ({ id: t.id, name: t.training.name, status: t.status, progress: t.progress, completedAt: t.completedAt, certificateNo: t.certificateNo })),
      exams: exams.map((e) => ({ id: e.id, title: e.exam.title, score: e.score, maxScore: e.maxScore, passed: e.passed, gradedAt: e.gradedAt })),
      practicalExams: practical.map((a) => ({ id: a.id, title: a.exam.title, total: a.total, maxPoints: a.maxPoints, passed: a.passed, completedAt: a.completedAt })),
      permissions: { notes: showNotes, notesCreate: can(ctx, 'personnel.notes_create'), confidential: can(ctx, 'personnel.notes_confidential'), documents: showDocs, activity: showActivity, qualificationGrant: can(ctx, 'qualification.grant'), qualificationRevoke: can(ctx, 'qualification.revoke') },
    };
  }

  // ───────── Personalvermerke ─────────
  private noteWhere(ctx: PermissionContext, personnelId: string): Prisma.PersonnelRecordWhereInput {
    return { personnelId, type: 'NOTE', deletedAt: null, ...(can(ctx, 'personnel.notes_confidential') ? {} : { confidential: false }) };
  }

  async notes(actor: Actor, personnelId: string, q: { category?: string }) {
    const { ctx } = await this.access(actor, personnelId);
    if (!can(ctx, 'personnel.notes_view')) throw new AppError('PERMISSION_DENIED', 'Personalvermerke ansehen braucht das Recht personnel.notes_view.');
    const rows = await this.prisma.personnelRecord.findMany({ where: { ...this.noteWhere(ctx, personnelId), ...(q.category ? { data: { path: ['category'], equals: q.category } } : {}) }, orderBy: { createdAt: 'desc' }, take: 500, include: { _count: { select: { revisions: true } } } });
    const names = await this.names(rows.map((r) => r.createdById));
    return rows.map((r) => ({ id: r.id, summary: r.summary, details: r.details, category: (r.data as { category?: string } | null)?.category ?? null, confidential: r.confidential, createdAt: r.createdAt, updatedAt: r.updatedAt, author: names.get(r.createdById) ?? '—', authorId: r.createdById, revisions: r._count.revisions }));
  }

  async addNote(actor: Actor, personnelId: string, d: NoteInput) {
    const { ctx, personnel } = await this.access(actor, personnelId);
    if (!can(ctx, 'personnel.notes_create')) throw new AppError('PERMISSION_DENIED', 'Vermerke erstellen braucht das Recht personnel.notes_create.');
    if (d.confidential && !can(ctx, 'personnel.notes_confidential')) throw new AppError('PERMISSION_DENIED', 'Vertrauliche Vermerke braucht das Recht personnel.notes_confidential.');
    if (personnel.userId === actor.userId) throw new AppError('CONFLICT', 'In der eigenen Personalakte kannst du keine Vermerke anlegen.');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.personnelRecord.create({ data: { personnelId, type: 'NOTE', summary: d.summary, details: d.details ?? null, confidential: !!d.confidential, data: d.category ? { category: d.category } : Prisma.DbNull, createdById: actor.userId! } });
      // Inhalte vertraulicher Vermerke nicht ins Audit-Log kopieren
      await this.core.audit.record(actor, { action: 'personnel.note.create', module: 'personnel', entityType: 'PersonnelRecord', entityId: r.id, after: { personnelId, category: d.category ?? null, confidential: r.confidential, ...(r.confidential ? {} : { summary: r.summary }) } }, tx);
      return r;
    });
  }

  /** Bearbeiten: Verfasser oder personnel.edit; der vorherige Stand wird als Revision gespeichert. */
  async editNote(actor: Actor, noteId: string, d: Partial<NoteInput> & { reason?: string }) {
    const before = await this.prisma.personnelRecord.findUnique({ where: { id: noteId } });
    if (!before || before.type !== 'NOTE' || before.deletedAt) throw new AppError('NOT_FOUND', 'Vermerk nicht gefunden.');
    const { ctx } = await this.access(actor, before.personnelId);
    if (!can(ctx, 'personnel.notes_view') || (before.confidential && !can(ctx, 'personnel.notes_confidential'))) throw new AppError('NOT_FOUND', 'Vermerk nicht gefunden.');
    if (before.createdById !== actor.userId && !can(ctx, 'personnel.edit')) throw new AppError('PERMISSION_DENIED', 'Nur der Verfasser oder jemand mit personnel.edit kann den Vermerk ändern.');
    if (d.confidential !== undefined && d.confidential !== before.confidential && !can(ctx, 'personnel.notes_confidential')) throw new AppError('PERMISSION_DENIED', 'Die Vertraulichkeit ändern braucht personnel.notes_confidential.');
    const oldCat = (before.data as { category?: string } | null)?.category ?? null;
    return this.prisma.$transaction(async (tx) => {
      await tx.personnelRecordRevision.create({ data: { recordId: noteId, summary: before.summary, details: before.details, category: oldCat, confidential: before.confidential, editedById: actor.userId!, reason: d.reason?.trim() || null } });
      const after = await tx.personnelRecord.update({ where: { id: noteId }, data: {
        ...(d.summary !== undefined ? { summary: d.summary } : {}), ...(d.details !== undefined ? { details: d.details } : {}),
        ...(d.confidential !== undefined ? { confidential: d.confidential } : {}), ...(d.category !== undefined ? { data: d.category ? { category: d.category } : Prisma.DbNull } : {}),
      } });
      const conf = before.confidential || after.confidential;
      await this.core.audit.record(actor, { action: 'personnel.note.update', module: 'personnel', entityType: 'PersonnelRecord', entityId: noteId, reason: d.reason, before: conf ? { confidential: before.confidential } : { summary: before.summary, category: oldCat }, after: conf ? { confidential: after.confidential } : { summary: after.summary, category: d.category ?? oldCat } }, tx);
      return after;
    });
  }

  async noteRevisions(actor: Actor, noteId: string) {
    const n = await this.prisma.personnelRecord.findUnique({ where: { id: noteId } });
    if (!n || n.type !== 'NOTE') throw new AppError('NOT_FOUND', 'Vermerk nicht gefunden.');
    const { ctx } = await this.access(actor, n.personnelId);
    if (!can(ctx, 'personnel.notes_view') || (n.confidential && !can(ctx, 'personnel.notes_confidential'))) throw new AppError('NOT_FOUND', 'Vermerk nicht gefunden.');
    const revs = await this.prisma.personnelRecordRevision.findMany({ where: { recordId: noteId }, orderBy: { createdAt: 'desc' } });
    const names = await this.names(revs.map((r) => r.editedById));
    // vertrauliche frühere Stände nur mit Recht
    return revs.filter((r) => !r.confidential || can(ctx, 'personnel.notes_confidential')).map((r) => ({ ...r, editedBy: names.get(r.editedById) ?? '—' }));
  }

  // ───────── Dokumente ─────────
  async documents(actor: Actor, personnelId: string, includeArchived = false) {
    const { ctx } = await this.access(actor, personnelId);
    if (!can(ctx, 'personnel.documents')) throw new AppError('PERMISSION_DENIED', 'Dokumente braucht das Recht personnel.documents.');
    const rows = await this.prisma.personnelDocument.findMany({ where: { personnelId, ...(includeArchived ? {} : { archivedAt: null }), ...(can(ctx, 'personnel.notes_confidential') ? {} : { confidential: false }) }, include: { media: { select: { originalName: true, mime: true, size: true } } }, orderBy: { createdAt: 'desc' } });
    const names = await this.names(rows.map((r) => r.uploadedById));
    return rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, note: r.note, confidential: r.confidential, fileName: r.media.originalName, mime: r.media.mime, size: r.media.size, uploadedBy: names.get(r.uploadedById) ?? '—', createdAt: r.createdAt, archivedAt: r.archivedAt }));
  }

  /** Datei vorher über POST /media (linkedType PersonnelDocument, linkedId = Akte) hochladen, dann hier zuordnen. */
  async addDocument(actor: Actor, personnelId: string, d: { mediaId: string; kind: string; title: string; note?: string | null; confidential?: boolean }) {
    const { ctx } = await this.access(actor, personnelId);
    if (!can(ctx, 'personnel.documents')) throw new AppError('PERMISSION_DENIED', 'Dokumente braucht das Recht personnel.documents.');
    if (d.confidential && !can(ctx, 'personnel.notes_confidential')) throw new AppError('PERMISSION_DENIED', 'Vertrauliche Dokumente braucht personnel.notes_confidential.');
    const m = await this.prisma.media.findUnique({ where: { id: d.mediaId } });
    if (!m || m.linkedType !== 'PersonnelDocument' || m.linkedId !== personnelId) throw new AppError('VALIDATION_FAILED', 'Die Datei gehört nicht zu dieser Personalakte.');
    if (await this.prisma.personnelDocument.findFirst({ where: { mediaId: d.mediaId } })) throw new AppError('CONFLICT', 'Die Datei ist schon zugeordnet.');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.personnelDocument.create({ data: { personnelId, mediaId: d.mediaId, kind: d.kind, title: d.title, note: d.note ?? null, confidential: !!d.confidential, uploadedById: actor.userId! } });
      await this.core.audit.record(actor, { action: 'personnel.document.add', module: 'personnel', entityType: 'PersonnelDocument', entityId: r.id, after: { personnelId, kind: r.kind, title: r.confidential ? '(vertraulich)' : r.title, mediaId: r.mediaId, hash: m.hash } }, tx);
      return r;
    });
  }

  async archiveDocument(actor: Actor, docId: string) {
    const doc = await this.prisma.personnelDocument.findUnique({ where: { id: docId } });
    if (!doc || doc.archivedAt) throw new AppError('NOT_FOUND', 'Dokument nicht gefunden.');
    const { ctx } = await this.access(actor, doc.personnelId);
    if (!can(ctx, 'personnel.documents') || (doc.confidential && !can(ctx, 'personnel.notes_confidential'))) throw new AppError('NOT_FOUND', 'Dokument nicht gefunden.');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.personnelDocument.update({ where: { id: docId }, data: { archivedAt: new Date(), archivedById: actor.userId } });
      await this.core.audit.record(actor, { action: 'personnel.document.archive', module: 'personnel', entityType: 'PersonnelDocument', entityId: docId }, tx);
      return r;
    });
  }

  /** Download mit Akten- und Vertraulichkeitsprüfung; jeder Abruf wird protokolliert. */
  async downloadDocument(actor: Actor, docId: string) {
    const doc = await this.prisma.personnelDocument.findUnique({ where: { id: docId }, include: { media: true } });
    if (!doc) throw new AppError('NOT_FOUND', 'Dokument nicht gefunden.');
    const { ctx } = await this.access(actor, doc.personnelId);
    if (!can(ctx, 'personnel.documents') || (doc.confidential && !can(ctx, 'personnel.notes_confidential'))) throw new AppError('NOT_FOUND', 'Dokument nicht gefunden.');
    const data = await readFile(path.join(path.resolve(loadEnv().STORAGE_DIR), doc.media.storageKey)).catch(() => { throw new AppError('NOT_FOUND', 'Die Datei fehlt im Speicher.'); });
    await this.core.audit.record(actor, { action: 'personnel.document.download', module: 'personnel', entityType: 'PersonnelDocument', entityId: docId });
    return { media: doc.media, data };
  }

  // ───────── Aktivitäten ─────────
  async activity(actor: Actor, personnelId: string, page = 1) {
    const { ctx } = await this.access(actor, personnelId);
    if (!can(ctx, 'personnel.view_sensitive') && !can(ctx, 'promotion.view_history')) throw new AppError('PERMISSION_DENIED', 'Aktivitäten braucht personnel.view_sensitive oder promotion.view_history.');
    const [records, docs] = await Promise.all([
      this.prisma.personnelRecord.findMany({ where: { personnelId }, select: { id: true } }),
      this.prisma.personnelDocument.findMany({ where: { personnelId }, select: { id: true } }),
    ]);
    const where: Prisma.AuditLogWhereInput = { OR: [{ entityType: 'Personnel', entityId: personnelId }, { entityType: 'PersonnelRecord', entityId: { in: records.map((r) => r.id) } }, { entityType: 'PersonnelDocument', entityId: { in: docs.map((d) => d.id) } }], action: { notIn: ['personnel.read', 'personnel.file.read'] } };
    const take = 50;
    const [total, rows] = await Promise.all([this.prisma.auditLog.count({ where }), this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (Math.max(1, page) - 1) * take, take })]);
    const names = await this.names(rows.map((r) => r.actorUserId));
    return { total, page, rows: rows.map((h) => ({ id: h.id, action: h.action, at: h.createdAt, actor: h.actorUserId ? names.get(h.actorUserId) ?? '—' : 'System', before: h.before, after: h.after, reason: h.reason })) };
  }

  // ───────── Auskunft für MDT, Leitstelle und Bot (ohne vertrauliche Inhalte) ─────────

  /** Dienstrelevante Personalinformationen (kein Vermerk, keine Verwarnung, keine Dokumente). Serverseitige Suche + Seiten. */
  async directory(q: { q?: string; onDuty?: boolean; page?: number }) {
    const take = 50; const page = Math.max(1, q.page ?? 1);
    const where: Prisma.PersonnelWhereInput = {
      employmentStatus: { notIn: INACTIVE },
      ...(q.q ? { OR: [{ user: { displayName: { contains: q.q, mode: 'insensitive' } } }, { callsign: { contains: q.q, mode: 'insensitive' } }, { serviceNumber: { contains: q.q, mode: 'insensitive' } }, { rank: { contains: q.q, mode: 'insensitive' } }, { team: { contains: q.q, mode: 'insensitive' } }] } : {}),
      ...(q.onDuty ? { user: { dutySessions: { some: { endedAt: null, status: 'ON_DUTY' } } } } : {}),
    };
    const [total, people] = await Promise.all([this.prisma.personnel.count({ where }), this.prisma.personnel.findMany({ where, include: { user: { select: { displayName: true } } }, orderBy: { user: { displayName: 'asc' } }, skip: (page - 1) * take, take })]);
    const ids = people.map((p) => p.id);
    const [sessions, quals, structure] = await Promise.all([
      this.prisma.dutySession.findMany({ where: { userId: { in: people.map((p) => p.userId) }, endedAt: null }, select: { userId: true, status: true, startedAt: true, callsign: true } }),
      this.prisma.personnelQualification.findMany({ where: { personnelId: { in: ids }, status: 'ACTIVE', AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] }, { OR: [{ definitionId: null }, { definition: { operational: true } }] }] }, select: { personnelId: true, name: true, definition: { select: { color: true } } } }),
      this.org.summary(),
    ]);
    return {
      total, page, pageSize: take,
      rows: people.map((p) => {
        const s = sessions.find((x) => x.userId === p.userId);
        return {
          id: p.id, name: p.user.displayName, rank: p.rank, department: p.team, callsign: s?.callsign ?? p.callsign, serviceNumber: p.serviceNumber,
          dutyStatus: s?.status ?? 'OFF_DUTY', onDutySince: s?.startedAt ?? null,
          qualifications: quals.filter((q2) => q2.personnelId === p.id).map((q2) => ({ name: q2.name, color: q2.definition?.color ?? null })),
          units: structure.filter((u) => u.departmentName === p.team || u.leader?.id === p.id || u.deputy?.id === p.id).map((u) => ({ id: u.id, name: u.name, role: u.leader?.id === p.id ? 'LEADER' : u.deputy?.id === p.id ? 'DEPUTY' : 'MEMBER' })),
        };
      }),
    };
  }

  /** Bot: Auskunft per Discord-ID (Rechte wie im Dashboard: personnel.view oder zuständige Führungskraft). */
  async lookup(actor: Actor, discordId: string) {
    const link = await this.prisma.discordLink.findUnique({ where: { discordId } });
    const p = link ? await this.prisma.personnel.findFirst({ where: { userId: link.userId }, include: { user: { select: { displayName: true, robloxUsername: true } } } }) : null;
    if (!p) throw new AppError('NOT_FOUND', 'Zu diesem Mitglied gibt es keine Personalakte.');
    await this.access(actor, p.id);
    const [duty, units, quals] = await Promise.all([this.dutyStatus(p.userId), this.org.unitsOf(p.id, p.team), this.quals.ofPersonnel(p.id, true)]);
    await this.core.audit.record(actor, { action: 'personnel.file.lookup', module: 'personnel', entityType: 'Personnel', entityId: p.id, after: { via: 'discord' } });
    return { id: p.id, name: p.user.displayName, robloxName: p.user.robloxUsername, rank: p.rank, department: p.team, status: p.employmentStatus, serviceNumber: p.serviceNumber, callsign: p.callsign, joinDate: p.joinDate, dutyStatus: duty, units: units.map((u) => ({ name: u.name, role: u.role, supervisor: u.supervisor?.name ?? null })), qualifications: quals.map((q) => q.name) };
  }

  /** Personalstatus ändern (Grunddaten): bestehende Funktion nutzen, betroffene Person privat benachrichtigen (neutral). */
  async notifyChanged(personnelId: string, title: string) {
    const p = await this.prisma.personnel.findUnique({ where: { id: personnelId }, select: { userId: true } });
    if (p) await this.notify.notify([p.userId], { type: 'PERSONNEL', title, entityType: 'Personnel', entityId: personnelId });
  }

  private async names(ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => !!x))];
    return new Map((await this.prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  }
}
