import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { DOCUMENT_CATEGORIES, DOCUMENT_MAX_BYTES } from '@enrp/shared';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { docForm, docMeta, DocumentsService } from './documents.service';

const listQ = z.object({ q: z.string().max(100).optional(), category: z.enum(DOCUMENT_CATEGORIES).optional(), archived: z.enum(['true', 'false']).optional() });
const versionForm = z.object({ note: z.string().trim().max(500).optional() });
const archiveBody = z.object({ archived: z.boolean() });
const upload = FileInterceptor('file', { limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1 } });

/** Dokumente. Ansehen: documents.view (+ Zugriffsgruppe je Dokument) · hochladen/neue Version: documents.upload · Zugriff/Archiv/Wiederherstellen: documents.manage. */
@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly s: DocumentsService) {}
  @Get() @RequirePermission('documents.view') list(@CurrentActor() a: Actor, @Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.s.list(a, { ...q, archived: q.archived === 'true' }); }
  @Get(':id') @RequirePermission('documents.view') get(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.get(a, id); }
  @Get(':id/download') @RequirePermission('documents.view')
  async download(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Query('version') version: string | undefined, @Res() res: Response) {
    const n = version && /^\d{1,6}$/.test(version) ? Number(version) : undefined;
    const f = await this.s.download(a, id, n);
    // nie inline: Download erzwingen, keine Ausführung/Darstellung im App-Ursprung
    res.set({ 'Content-Type': f.media.mime, 'Content-Disposition': `attachment; filename="${encodeURIComponent(f.filename)}"`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, no-store' });
    res.send(f.data);
  }
  @Post() @RequirePermission('documents.upload') @UseInterceptors(upload)
  create(@CurrentActor() a: Actor, @UploadedFile() file: Express.Multer.File | undefined, @Body(zodBody(docForm)) b: z.infer<typeof docForm>) { return this.s.create(a, b, file); }
  @Post(':id/versions') @RequirePermission('documents.upload') @UseInterceptors(upload)
  addVersion(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body(zodBody(versionForm)) b: z.infer<typeof versionForm>) { return this.s.addVersion(a, id, b.note, file); }
  @Post(':id/versions/:n/restore') @HttpCode(200) @RequirePermission('documents.manage')
  restore(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('n', ParseIntPipe) n: number) { return this.s.restoreVersion(a, id, n); }
  @Patch(':id') @RequirePermission('documents.manage')
  meta(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(docMeta.extend({ version: z.number().int().min(1) }))) b: z.infer<typeof docMeta> & { version: number }) { return this.s.updateMeta(a, id, b); }
  @Post(':id/archive') @HttpCode(200) @RequirePermission('documents.manage')
  archive(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(archiveBody)) b: z.infer<typeof archiveBody>) { return this.s.setArchived(a, id, b.archived); }
}
