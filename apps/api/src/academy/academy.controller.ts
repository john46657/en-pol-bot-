import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AcademyService } from './academy.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const course = z.object({ title: z.string().trim().min(3).max(120), description: z.string().max(2000).optional(), passScore: z.number().int().min(1).max(100).optional(), instructorId: z.string().uuid().optional() });

@ApiTags('academy')
@Controller('academy')
export class AcademyController {
  constructor(private readonly a: AcademyService) {}
  @Get('courses') @RequirePermission('academy.view')
  courses() { return this.a.courses(); }
  @Post('courses') @RequirePermission('academy.manage')
  create(@CurrentActor() ac: Actor, @Body(zodBody(course)) b: z.infer<typeof course>) { return this.a.createCourse(ac, b); }
  @Post('courses/:id/enroll') @RequirePermission('academy.manage')
  enroll(@CurrentActor() ac: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ personnelId: z.string().uuid() }))) b: { personnelId: string }) { return this.a.enroll(ac, id, b.personnelId); }
  @Post('enrollments/:id/grade') @RequirePermission('academy.manage')
  grade(@CurrentActor() ac: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ score: z.number().int().min(0).max(100) }))) b: { score: number }) { return this.a.grade(ac, id, b.score); }
}
