import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import { zodBody } from '../common/zod.pipe';

const create = z.object({
  code: z.string().trim().min(1).max(32), title: z.string().trim().min(1).max(200), description: z.string().max(5000).optional(),
  category: z.string().trim().min(1).max(64), penalty: z.object({ fine: z.number().min(0).optional(), jailMinutes: z.number().min(0).optional() }),
});

/** Gesetzeskatalog liegt in der Datenbank – nie im Frontend hartcodiert. */
@ApiTags('legal-codes')
@Controller('legal-codes')
export class LegalCodesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get() @RequirePermission('tickets.view')
  list() { return this.prisma.legalCode.findMany({ where: { active: true }, orderBy: { code: 'asc' } }); }

  @Post() @RequirePermission('settings.manage')
  async create(@CurrentActor() a: Actor, @Body(zodBody(create)) b: z.infer<typeof create>) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.legalCode.create({ data: b });
      await this.audit.record(a, { action: 'legalcode.create', module: 'settings', entityType: 'LegalCode', entityId: c.id, after: c }, tx);
      return c;
    });
  }
}
