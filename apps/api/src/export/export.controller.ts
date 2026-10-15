import { recordWhere } from '../common/guild-context';
import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { can } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import { AuditService, Actor } from '../audit/audit.service';
import { CurrentActor } from '../authz/decorators';
import { AppError } from '../common/errors';
import { zodBody } from '../common/zod.pipe';

const q = z.object({ format: z.enum(['csv', 'json', 'pdf']).default('csv'), q: z.string().max(100).optional() });
const MAX_ROWS = 1000;
type Row = Record<string, string | number | boolean | null>;

/** Spaltenwhitelist je Entität – keine Roh-Dumps, keine internen Felder. */
const SOURCES: Record<string, { permission: string; load: (p: PrismaService, term?: string) => Promise<Row[]> }> = {
  persons: { permission: 'persons.view', load: async (p, t) => (await p.person.findMany({ where: { ...recordWhere(), status: 'ACTIVE', ...(t ? { robloxUsername: { contains: t, mode: 'insensitive' } } : {}) }, take: MAX_ROWS, orderBy: { robloxUsername: 'asc' } })).map((x) => ({ id: x.id, robloxUsername: x.robloxUsername, robloxUserId: x.robloxUserId, createdAt: x.createdAt.toISOString() })) },
  vehicles: { permission: 'vehicles.view', load: async (p) => (await p.vehicle.findMany({ where: recordWhere(), take: MAX_ROWS, orderBy: { plate: 'asc' } })).map((x) => ({ id: x.id, plate: x.plate, model: x.model, color: x.color, status: x.status })) },
  tickets: { permission: 'tickets.view', load: async (p) => (await p.ticket.findMany({ take: MAX_ROWS, orderBy: { issuedAt: 'desc' } })).map((x) => ({ number: x.number, personId: x.personId, reason: x.reason, amount: Number(x.amount), status: x.status, issuedAt: x.issuedAt.toISOString() })) },
  incidents: { permission: 'incidents.view', load: async (p) => (await p.incident.findMany({ take: MAX_ROWS, orderBy: { createdAt: 'desc' } })).map((x) => ({ number: x.number, title: x.title, priority: x.priority, status: x.status, location: x.location, createdAt: x.createdAt.toISOString() })) },
  audit: { permission: 'audit.export', load: async (p) => (await p.auditLog.findMany({ take: MAX_ROWS, orderBy: { createdAt: 'desc' } })).map((x) => ({ createdAt: x.createdAt.toISOString(), actorUserId: x.actorUserId, action: x.action, module: x.module, entityType: x.entityType, entityId: x.entityId, reason: x.reason, requestId: x.requestId })) },
};

/** CSV-Injection-Schutz: Zellen, die mit = + - @ beginnen, werden entschärft. */
const cell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: Row[]) => (rows.length ? [Object.keys(rows[0]!).join(','), ...rows.map((r) => Object.values(r).map(cell).join(','))].join('\n') : '');

@ApiTags('export')
@Controller('export')
export class ExportController {
  constructor(private readonly prisma: PrismaService, private readonly perms: PermissionService, private readonly audit: AuditService) {}

  @Get(':entity')
  async export(@CurrentActor() actor: Actor, @Param('entity') entity: string, @Query(zodBody(q)) f: z.infer<typeof q>, @Res() res: Response) {
    const src = SOURCES[entity];
    if (!src) throw new AppError('NOT_FOUND', 'Unbekannter Export.');
    const ctx = await this.perms.contextFor(actor.userId!);
    if (!can(ctx, src.permission)) throw new AppError('PERMISSION_DENIED', 'Dafür fehlt dir die Berechtigung.');
    const rows = await src.load(this.prisma, f.q);
    await this.audit.record(actor, { action: 'export', module: 'export', entityType: entity, after: { format: f.format, rows: rows.length } });
    const name = `${entity}-${new Date().toISOString().slice(0, 10)}.${f.format}`;
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    if (f.format === 'json') { res.type('application/json').send(JSON.stringify(rows)); return; }
    if (f.format === 'csv') { res.type('text/csv; charset=utf-8').send(toCsv(rows)); return; }
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    res.type('application/pdf');
    doc.pipe(res);
    doc.fontSize(14).text(`EN Polizei — ${entity} export`, { underline: true }).moveDown(0.5);
    doc.fontSize(8).text(`Generated ${new Date().toISOString()} • ${rows.length} rows • exported by ${actor.userId}`).moveDown();
    for (const r of rows) doc.text(Object.values(r).map((v) => (v ?? '—')).join('  |  '), { lineGap: 1 });
    doc.end();
  }
}
