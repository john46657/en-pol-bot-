import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermission } from '../authz/decorators';
import { zodBody } from '../common/zod.pipe';
import { pageQuery, pageResult, skipTake } from '../common/pagination';

const q = pageQuery.extend({ module: z.string().optional(), entityType: z.string().optional(), entityId: z.string().optional() });

/** Nur lesend. Es gibt bewusst keine Schreib-/Lösch-Endpunkte für Audit-Logs. */
@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get() @RequirePermission('audit.view')
  async list(@Query(zodBody(q)) f: z.infer<typeof q>) {
    const where = { ...(f.module ? { module: f.module } : {}), ...(f.entityType ? { entityType: f.entityType } : {}), ...(f.entityId ? { entityId: f.entityId } : {}) };
    const [items, total] = await Promise.all([this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(f) }), this.prisma.auditLog.count({ where })]);
    return pageResult(items, total, f);
  }
}
