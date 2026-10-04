import { BadRequestException, Controller, Get, Header, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AREAS, areaCounts, exportCsv, query, type AuditQuery } from '@nexus/audit';
import { auditRepository } from '@nexus/database';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';

const date = (v: string | undefined, label: string): Date | undefined => {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Ungültiges Datum (${label}).`);
  return d;
};

/** Audit-Auswertung: suchen/filtern (audit.view), CSV-Export (audit.export, wird selbst protokolliert). */
@ApiTags('Audit')
@ApiBearerAuth()
@Controller('guilds/:guildId/audit-log')
export class AuditController {
  private toQuery(guildId: string, q: Record<string, string | undefined>): AuditQuery {
    return { guildId, area: q['area'] || undefined, action: q['action'] || undefined, actorId: q['actorId'] || undefined, resourceType: q['resourceType'] || undefined, resourceId: q['resourceId'] || undefined, result: q['result'] || undefined, search: q['search'] || undefined, from: date(q['from'], 'von'), to: date(q['to'], 'bis') };
  }

  @Get('areas')
  @RequirePermissions('audit.view')
  async areas(@GuildId() guildId: string) {
    return { areas: AREAS.map((a) => ({ key: a.key, label: a.label })), counts: await areaCounts(guildId) };
  }

  @Get()
  @RequirePermissions('audit.view')
  list(@GuildId() guildId: string, @Query() q: Record<string, string | undefined>) {
    return query({ ...this.toQuery(guildId, q), cursor: q['cursor'] || undefined, limit: Number(q['limit']) || 50 });
  }

  @Get('export')
  @RequirePermissions('audit.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="audit-log.csv"')
  async export(@GuildId() guildId: string, @Query() q: Record<string, string | undefined>, @CurrentUser() user: RequestUser) {
    const filter = this.toQuery(guildId, q);
    const r = await exportCsv(filter);
    // Auch der Export ist nachvollziehbar
    await auditRepository.log({ guildId, actorId: user.id, action: 'audit.exported', resource: ['AuditLog', 'export'], after: { rows: r.rows, truncated: r.truncated, filter: { ...q } } as never, permission: 'audit.export' });
    return new StreamableFile(Buffer.from(`${r.csv}`, 'utf8'));
  }
}
