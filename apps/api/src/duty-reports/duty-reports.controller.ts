import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { reportTemplateSchema, type ReportTemplate } from '@enrp/shared';
import { DutyReportsService } from './duty-reports.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { currentGuild } from '../common/guild-context';
import { AppError } from '../common/errors';

const values = z.record(z.string().max(40), z.union([z.string().max(4000), z.number()]));
const create = z.object({ templateId: z.string().uuid(), periodStart: z.string().date().optional(), values, guildId: z.string().regex(/^\d{15,25}$/).nullable().optional(), source: z.enum(['WEB', 'DISCORD']).optional() });
const edit = z.object({ values, version: z.number().int().optional() });
const reviewBody = z.object({ decision: z.enum(['REVIEWED', 'RETURNED', 'SUBMITTED']).optional(), note: z.string().trim().max(1000).optional() }).default({});
const listQ = z.object({ templateId: z.string().uuid().optional(), authorId: z.string().uuid().optional(), from: z.string().date().optional(), to: z.string().date().optional(), q: z.string().max(80).optional(), status: z.enum(['SUBMITTED', 'REVIEWED', 'RETURNED']).optional(), mine: z.coerce.boolean().optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50) });

/** 🗓️ Tages-/Wochenberichte (auch vom Discord-Bot im Namen des verknüpften Benutzers benutzt). */
@ApiTags('duty-reports')
@Controller('duty-reports')
export class DutyReportsController {
  constructor(private readonly s: DutyReportsService) {}
  @Get('templates') @RequirePermission('dutyreports.view') templates(@Query('active') active?: string) { return this.s.listTemplates(currentGuild(), active === '1'); }
  @Put('templates/:id') @RequirePermission('dutyreports.manage')
  saveTemplate(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(reportTemplateSchema)) b: ReportTemplate) { if (b.id !== id) throw new AppError('VALIDATION_FAILED', 'ID passt nicht.'); return this.s.saveTemplate(a, b); }
  /** Vorbelegung (z. B. Dienstzeit aus den Dienst-Sitzungen) für ein neues Formular. */
  @Get('templates/:id/prefill') @RequirePermission('dutyreports.create') prefill(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Query('date') date?: string) { return this.s.prefill(a, id, date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined); }
  @Post('templates/:id/duplicate') @RequirePermission('dutyreports.manage') dup(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.duplicateTemplate(a, id); }
  @Delete('templates/:id') @HttpCode(204) @RequirePermission('dutyreports.manage') removeTemplate(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.removeTemplate(a, id); }

  @Get() @RequirePermission('dutyreports.view') list(@CurrentActor() a: Actor, @Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.s.list(a, q, q.page, q.pageSize); }
  @Get(':id') @RequirePermission('dutyreports.view') get(@CurrentActor() a: Actor, @Param('id') id: string) { return this.s.get(a, id.slice(0, 40)); }
  @Post() @RequirePermission('dutyreports.create') create(@CurrentActor() a: Actor, @Body(zodBody(create)) b: z.infer<typeof create>) { return this.s.create(a, b); }
  @Patch(':id') @RequirePermission('dutyreports.view') edit(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(edit)) b: z.infer<typeof edit>) { return this.s.update(a, id, b); }
  @Post(':id/review') @HttpCode(200) @RequirePermission('dutyreports.review')
  review(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(reviewBody)) b: z.infer<typeof reviewBody>) { return this.s.review(a, id, b); }
  @Delete(':id') @HttpCode(204) @RequirePermission('dutyreports.edit_all') remove(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.remove(a, id); }
}
