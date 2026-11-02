import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type Document } from '@prisma/client';
import { z } from 'zod';
import { canSeeDocument, DOCUMENT_ACCESS, DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABEL, DOCUMENT_MAX_BYTES, DOCUMENT_MIME_TYPES, type DocumentCategory } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { NotifyService } from '../notifications/notify.service';
import { MediaService } from '../media/media.service';
import { AppError } from '../common/errors';
import { webUrl } from '../common/web-url';

export const docMeta = z.object({
  title: z.string().trim().min(2).max(150), category: z.enum(DOCUMENT_CATEGORIES), description: z.string().trim().max(2000).nullish(),
  access: z.enum(DOCUMENT_ACCESS).default('ALL'), roleIds: z.array(z.string().uuid()).max(20).default([]),
});
/** Formularfelder kommen als Text (multipart): roleIds als kommagetrennte Liste. */
export const docForm = z.object({
  title: z.string().trim().min(2).max(150), category: z.enum(DOCUMENT_CATEGORIES), description: z.string().trim().max(2000).optional(),
  access: z.enum(DOCUMENT_ACCESS).default('ALL'), roleIds: z.string().max(800).optional(), note: z.string().trim().max(500).optional(),
});
type File = { originalname: string; mimetype: string; buffer: Buffer; size: number };

/**
 * Dokumentenverwaltung: Metadaten + Versionen (jede Version bleibt erhalten, Wiederherstellen erzeugt eine neue Version).
 * Zugriff serverseitig je Dokument (Zugriffsgruppe), Dateien nur über diesen Dienst (nie direkt über /media), Download im Audit.
 * Dateitypen per Allowlist + Signatur (MediaService), Größe max. 10 MB, Auslieferung nur als Anhang mit sandbox-CSP.
 */
@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly perms: PermissionService, private readonly notify: NotifyService, private readonly media: MediaService) {}

  private async who(userId: string) {
    const [view, manage, confidential, roleIds] = await Promise.all([this.perms.has(userId, 'documents.view'), this.perms.has(userId, 'documents.manage'), this.perms.has(userId, 'documents.confidential'), this.perms.roleIdsFor(userId)]);
    return { view, manage, confidential, roleIds };
  }
  private async assertSee(actor: Actor, d: Document) {
    if (!canSeeDocument(d, await this.who(actor.userId!))) throw new AppError('NOT_FOUND', 'Dokument nicht gefunden.'); // ohne Recht: wie nicht vorhanden
  }
  private parseRoles(raw?: string) { return (raw ?? '').split(',').map((x) => x.trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 20); }
  private checkFile(file?: File): File {
    if (!file) throw new AppError('VALIDATION_FAILED', 'Bitte eine Datei auswählen.');
    if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(file.mimetype)) throw new AppError('VALIDATION_FAILED', 'Erlaubt sind PDF, Text (.txt) und Bilder (PNG, JPG, WebP).');
    if (file.size > DOCUMENT_MAX_BYTES) throw new AppError('VALIDATION_FAILED', 'Die Datei ist zu groß (max. 10 MB).');
    return file;
  }
  private async checkAccess(actor: Actor, access: string, roleIds: string[]) {
    if (access === 'CONFIDENTIAL' && !(await this.perms.has(actor.userId!, 'documents.confidential'))) throw new AppError('PERMISSION_DENIED', 'Vertrauliche Dokumente anlegen darf nur, wer „documents.confidential“ hat.');
    if (access === 'ROLES' && !roleIds.length) throw new AppError('VALIDATION_FAILED', 'Bitte mindestens eine Rolle für die Zugriffsgruppe wählen.');
    if (roleIds.length && (await this.prisma.role.count({ where: { id: { in: roleIds } } })) !== roleIds.length) throw new AppError('VALIDATION_FAILED', 'Unbekannte Rolle in der Zugriffsgruppe.');
  }

  private view(d: Document & { versions?: { number: number; note: string | null; createdAt: Date; createdById: string; restoredFrom: number | null; mediaId: string }[] }, names: Map<string, string>, mediaInfo?: Map<string, { originalName: string; size: number; mime: string }>) {
    return {
      id: d.id, title: d.title, category: d.category, categoryLabel: DOCUMENT_CATEGORY_LABEL[d.category as DocumentCategory] ?? d.category, description: d.description, access: d.access, roleIds: d.roleIds,
      status: d.status, currentVersion: d.currentVersion, url: webUrl(`/documents?id=${d.id}`), createdAt: d.createdAt, updatedAt: d.updatedAt, createdByName: names.get(d.createdById) ?? '—', updatedByName: d.updatedById ? names.get(d.updatedById) ?? '—' : null, version: d.version,
      ...(d.versions ? { versions: d.versions.map((v) => ({ number: v.number, note: v.note, createdAt: v.createdAt, by: names.get(v.createdById) ?? '—', restoredFrom: v.restoredFrom, file: mediaInfo?.get(v.mediaId) ?? null })) } : {}),
    };
  }
  private async names(ids: string[]) { return new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName])); }

  /** Suche/Filter; nur sichtbare Dokumente (Zugriffsgruppe), Archiv nur für Verwalter. */
  async list(actor: Actor, f: { q?: string; category?: string; archived?: boolean }) {
    const u = await this.who(actor.userId!);
    const rows = await this.prisma.document.findMany({
      where: { status: f.archived && u.manage ? 'ARCHIVED' : 'ACTIVE', ...(f.category ? { category: f.category } : {}), ...(f.q ? { OR: [{ title: { contains: f.q, mode: 'insensitive' } }, { description: { contains: f.q, mode: 'insensitive' } }] } : {}) },
      orderBy: [{ category: 'asc' }, { title: 'asc' }], take: 500,
    });
    const visible = rows.filter((d) => canSeeDocument(d, u));
    const names = await this.names(visible.flatMap((d) => [d.createdById, ...(d.updatedById ? [d.updatedById] : [])]));
    return { canUpload: await this.perms.has(actor.userId!, 'documents.upload'), canManage: u.manage, canConfidential: u.confidential, items: visible.map((d) => this.view(d, names)) };
  }

  async get(actor: Actor, id: string) {
    const d = await this.prisma.document.findUnique({ where: { id }, include: { versions: { orderBy: { number: 'desc' } } } });
    if (!d) throw new AppError('NOT_FOUND', 'Dokument nicht gefunden.');
    await this.assertSee(actor, d);
    const media = await this.prisma.media.findMany({ where: { id: { in: d.versions.map((v) => v.mediaId) } }, select: { id: true, originalName: true, size: true, mime: true } });
    return this.view(d, await this.names([d.createdById, ...(d.updatedById ? [d.updatedById] : []), ...d.versions.map((v) => v.createdById)]), new Map(media.map((m) => [m.id, m])));
  }

  async create(actor: Actor, meta: z.infer<typeof docForm>, file?: File) {
    const f = this.checkFile(file);
    const roleIds = this.parseRoles(meta.roleIds);
    await this.checkAccess(actor, meta.access, roleIds);
    // erst die Datei prüfen/speichern (Signatur, Größe) – ohne gültige Datei entsteht kein Dokument
    const docId = randomUUID();
    const m = await this.media.upload(actor, f, { linkedType: 'Document', linkedId: docId });
    const doc = await this.prisma.$transaction(async (tx) => {
      const x = await tx.document.create({ data: { id: docId, title: meta.title, category: meta.category, description: meta.description || null, access: meta.access, roleIds, createdById: actor.userId!, currentVersion: 1, versions: { create: { number: 1, mediaId: m.id, note: meta.note || 'Erste Version', createdById: actor.userId! } } } });
      await this.audit.record(actor, { action: 'documents.create', module: 'documents', entityType: 'Document', entityId: x.id, after: { title: x.title, category: x.category, access: x.access, file: m.originalName, hash: m.hash } }, tx);
      return x;
    });
    // Hinweis nur bei frei zugänglichen Dokumenten (vertrauliche/rollenbeschränkte nicht breit ankündigen)
    if (meta.access === 'ALL') await this.notify.emitPermission('document.new', 'documents.view', { title: `📄 Neues Dokument: ${doc.title}`, link: `/documents?id=${doc.id}`, entityType: 'Document', entityId: doc.id, dedupeKey: doc.id, dm: false }, { exceptUserId: actor.userId });
    return this.get(actor, doc.id);
  }

  /** Neue Version hochladen – die bisherige bleibt erhalten. */
  async addVersion(actor: Actor, id: string, note: string | undefined, file?: File) {
    const f = this.checkFile(file);
    const d = await this.prisma.document.findUnique({ where: { id } });
    if (!d) throw new AppError('NOT_FOUND', 'Dokument nicht gefunden.');
    await this.assertSee(actor, d);
    if (d.status !== 'ACTIVE') throw new AppError('CONFLICT', 'Archivierte Dokumente bitte erst wiederherstellen.');
    const m = await this.media.upload(actor, f, { linkedType: 'Document', linkedId: id });
    await this.nextVersion(actor, d, m.id, note || null, null, { file: m.originalName, hash: m.hash });
    return this.get(actor, id);
  }

  private async nextVersion(actor: Actor, d: Document, mediaId: string, note: string | null, restoredFrom: number | null, extra: Record<string, unknown>) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${d.id}::uuid FOR UPDATE`;
      const max = (await tx.documentVersion.aggregate({ where: { documentId: d.id }, _max: { number: true } }))._max.number ?? 0;
      await tx.documentVersion.create({ data: { documentId: d.id, number: max + 1, mediaId, note, restoredFrom, createdById: actor.userId! } });
      await tx.document.update({ where: { id: d.id }, data: { currentVersion: max + 1, updatedById: actor.userId, version: { increment: 1 } } });
      await this.audit.record(actor, { action: restoredFrom ? 'documents.restore_version' : 'documents.update', module: 'documents', entityType: 'Document', entityId: d.id, before: { version: d.currentVersion }, after: { version: max + 1, restoredFrom, ...extra } }, tx);
    });
  }

  /** Ältere Version wiederherstellen = als neue Version übernehmen (nichts geht verloren). */
  async restoreVersion(actor: Actor, id: string, number: number) {
    const d = await this.prisma.document.findUnique({ where: { id }, include: { versions: true } });
    if (!d) throw new AppError('NOT_FOUND', 'Dokument nicht gefunden.');
    await this.assertSee(actor, d);
    const v = d.versions.find((x) => x.number === number);
    if (!v) throw new AppError('NOT_FOUND', 'Version nicht gefunden.');
    if (number === d.currentVersion) throw new AppError('CONFLICT', 'Das ist schon die aktuelle Version.');
    await this.nextVersion(actor, d, v.mediaId, `Wiederhergestellt aus Version ${number}`, number, {});
    return this.get(actor, id);
  }

  async updateMeta(actor: Actor, id: string, m: z.infer<typeof docMeta> & { version: number }) {
    const d = await this.prisma.document.findUnique({ where: { id } });
    if (!d) throw new AppError('NOT_FOUND', 'Dokument nicht gefunden.');
    await this.assertSee(actor, d);
    await this.checkAccess(actor, m.access, m.roleIds);
    if (d.access === 'CONFIDENTIAL' && m.access !== 'CONFIDENTIAL' && !(await this.perms.has(actor.userId!, 'documents.confidential'))) throw new AppError('PERMISSION_DENIED', 'Vertraulichkeit aufheben darf nur, wer „documents.confidential“ hat.');
    await this.prisma.$transaction(async (tx) => {
      const n = await tx.document.updateMany({ where: { id, version: m.version }, data: { title: m.title, category: m.category, description: m.description || null, access: m.access, roleIds: m.roleIds, updatedById: actor.userId, version: { increment: 1 } } });
      if (!n.count) throw new AppError('CONFLICT', 'Das Dokument wurde inzwischen geändert. Bitte neu laden.');
      await this.audit.record(actor, { action: d.access !== m.access || JSON.stringify(d.roleIds) !== JSON.stringify(m.roleIds) ? 'documents.access' : 'documents.meta', module: 'documents', entityType: 'Document', entityId: id, before: { title: d.title, category: d.category, access: d.access, roleIds: d.roleIds }, after: { title: m.title, category: m.category, access: m.access, roleIds: m.roleIds } }, tx);
    });
    return this.get(actor, id);
  }

  async setArchived(actor: Actor, id: string, archived: boolean) {
    const d = await this.prisma.document.findUnique({ where: { id } });
    if (!d) throw new AppError('NOT_FOUND', 'Dokument nicht gefunden.');
    await this.assertSee(actor, d);
    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({ where: { id }, data: { status: archived ? 'ARCHIVED' : 'ACTIVE', archivedAt: archived ? new Date() : null, updatedById: actor.userId, version: { increment: 1 } } });
      await this.audit.record(actor, { action: archived ? 'documents.archive' : 'documents.unarchive', module: 'documents', entityType: 'Document', entityId: id }, tx);
    });
    return this.get(actor, id);
  }

  /** Download (aktuelle oder bestimmte Version) – Zugriff je Abruf geprüft und im Audit festgehalten. */
  async download(actor: Actor, id: string, number?: number) {
    const d = await this.prisma.document.findUnique({ where: { id }, include: { versions: true } });
    if (!d) throw new AppError('NOT_FOUND', 'Dokument nicht gefunden.');
    await this.assertSee(actor, d);
    const v = d.versions.find((x) => x.number === (number ?? d.currentVersion));
    if (!v) throw new AppError('NOT_FOUND', 'Version nicht gefunden.');
    if (number && number !== d.currentVersion && !(await this.perms.has(actor.userId!, 'documents.upload'))) throw new AppError('PERMISSION_DENIED', 'Ältere Versionen sehen nur Bearbeiter.');
    const file = await this.media.readDocumentFile(v.mediaId);
    await this.audit.record(actor, { action: 'documents.download', module: 'documents', entityType: 'Document', entityId: id, after: { version: v.number, access: d.access } });
    return { ...file, filename: file.media.originalName };
  }
}

export type DocumentRow = Prisma.DocumentGetPayload<{ include: { versions: true } }>;
