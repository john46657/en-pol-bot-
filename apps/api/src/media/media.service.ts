import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { AppError } from '../common/errors';
import { loadEnv } from '../config/env';

export const MAX_BYTES = 10 * 1024 * 1024;
/** MIME-Allowlist inkl. Magic-Byte-Signatur. Der vom Client gemeldete Typ allein wird NIE vertraut. */
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/gif': (b) => b.subarray(0, 4).toString('ascii') === 'GIF8',
  'image/webp': (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  'application/pdf': (b) => b.subarray(0, 5).toString('ascii') === '%PDF-',
  'text/plain': (b) => !b.subarray(0, 4096).includes(0),
};
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'application/pdf': 'pdf', 'text/plain': 'txt' };
/** Welche Permission zum Anhängen/Ansehen an einem Entitätstyp nötig ist. */
const WRITE: Record<string, string> = { CadMap: 'cad.manage_map', Evidence: 'evidence.create', Report: 'reports.create', Complaint: 'complaints.create', Incident: 'incidents.edit', Person: 'persons.edit', Investigation: 'investigations.edit', Vehicle: 'vehicles.edit' };
const READ: Record<string, string> = { CadMap: 'cad.view', Evidence: 'evidence.view', Report: 'reports.view', Complaint: 'complaints.view', Incident: 'incidents.view', Person: 'persons.view', Investigation: 'investigations.view', Vehicle: 'vehicles.view' };

@Injectable()
export class MediaService {
  private readonly dir = path.resolve(loadEnv().STORAGE_DIR);
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly perms: PermissionService) {}

  async upload(actor: Actor, file: { originalname: string; mimetype: string; buffer: Buffer; size: number }, link: { linkedType: string; linkedId: string }, maxBytes = MAX_BYTES) {
    const need = WRITE[link.linkedType];
    if (!need) throw new AppError('VALIDATION_FAILED', 'Dateien können hier nicht angehängt werden.');
    await this.perms.assert(actor.userId!, need);
    if (file.size > maxBytes || file.buffer.length > maxBytes) throw new AppError('VALIDATION_FAILED', `Die Datei ist zu groß (max. ${Math.round(maxBytes / 1048576)} MB).`);
    const check = SIGNATURES[file.mimetype];
    if (!check || !check(file.buffer)) throw new AppError('VALIDATION_FAILED', 'Dieser Dateityp ist nicht erlaubt oder der Inhalt passt nicht zum Dateityp.');
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = `${randomUUID()}.${EXT[file.mimetype]}`; // Zufallsname + feste Endung: Dateinamen des Clients landen nie im Dateisystem
    await mkdir(this.dir, { recursive: true });
    await writeFile(path.join(this.dir, storageKey), file.buffer, { mode: 0o640 });
    const safeName = path.basename(file.originalname).replace(/[^\w.\- ]/g, '_').slice(0, 120);
    return this.prisma.$transaction(async (tx) => {
      const m = await tx.media.create({ data: { originalName: safeName, mime: file.mimetype, size: file.size, hash, storageKey, uploaderId: actor.userId!, linkedType: link.linkedType, linkedId: link.linkedId } });
      await this.audit.record(actor, { action: 'media.upload', module: 'media', entityType: 'Media', entityId: m.id, after: { linkedType: m.linkedType, linkedId: m.linkedId, mime: m.mime, size: m.size, hash } }, tx);
      return { id: m.id, originalName: m.originalName, mime: m.mime, size: m.size, hash: m.hash };
    });
  }

  async download(actor: Actor, id: string) {
    const m = await this.prisma.media.findUnique({ where: { id } });
    const need = m?.linkedType ? READ[m.linkedType] : undefined;
    // Ohne Leserecht auf die verknüpfte Entität verhält sich die Datei wie nicht vorhanden.
    if (!m || !need || !(await this.perms.has(actor.userId!, need))) throw new AppError('NOT_FOUND', 'Datei nicht gefunden.');
    return { media: m, data: await readFile(path.join(this.dir, m.storageKey)) };
  }

  list(actor: Actor, linkedType: string, linkedId: string) {
    return this.perms.assert(actor.userId!, READ[linkedType] ?? '!none').then(() => this.prisma.media.findMany({ where: { linkedType, linkedId }, select: { id: true, originalName: true, mime: true, size: true, hash: true, createdAt: true }, orderBy: { createdAt: 'desc' } }));
  }
}
