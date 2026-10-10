import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { academyConfigSchema, AcademyService, announceSchema, type AcademyConfig, type Announce } from './academy.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const course = z.object({ title: z.string().trim().min(3).max(120), description: z.string().max(2000).optional(), passScore: z.number().int().min(1).max(100).optional(), instructorId: z.string().uuid().optional(), announce: announceSchema.optional() });

@ApiTags('academy')
@Controller('academy')
export class AcademyController {
  constructor(private readonly a: AcademyService) {}
  @Get('courses') @RequirePermission('academy.view')
  courses() { return this.a.courses(); }
  @Get('courses/:id') @RequirePermission('academy.view')
  course(@Param('id', ParseUUIDPipe) id: string) { return this.a.course(id); }
  @Post('courses') @RequirePermission('academy.manage')
  create(@CurrentActor() ac: Actor, @Body(zodBody(course)) b: z.infer<typeof course>) { const { announce, ...d } = b; return this.a.createCourse(ac, d, announce); }
  /** Standard-Kanal und Ping-Rollen für Ankündigungen. */
  @Get('config') @RequirePermission('academy.view') config() { return this.a.config(); }
  @Put('config') @RequirePermission('academy.manage') saveConfig(@CurrentActor() ac: Actor, @Body(zodBody(academyConfigSchema)) b: AcademyConfig) { return this.a.saveConfig(ac, b); }
  @Post('courses/:id/announce') @HttpCode(202) @RequirePermission('academy.manage')
  announce(@CurrentActor() ac: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(announceSchema)) b: Announce) { return this.a.announce(ac, id, b); }
  @Post('courses/:id/enroll') @RequirePermission('academy.manage')
  enroll(@CurrentActor() ac: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ personnelId: z.string().uuid() }))) b: { personnelId: string }) { return this.a.enroll(ac, id, b.personnelId); }
  @Post('enrollments/:id/grade') @RequirePermission('academy.manage')
  grade(@CurrentActor() ac: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ score: z.number().int().min(0).max(100) }))) b: { score: number }) { return this.a.grade(ac, id, b.score); }
}
