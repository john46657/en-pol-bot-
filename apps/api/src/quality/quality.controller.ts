import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { QUALITY_TARGETS, qualityConfigSchema, type QualityConfig, type QualityTarget } from '@enrp/shared';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { QualityService } from './quality.service';

const target = z.enum(QUALITY_TARGETS);
const exceptionBody = z.object({ targetType: target, targetId: z.string().uuid(), code: z.string().trim().min(3).max(60), reason: z.string().trim().min(10, 'Bitte die Ausnahme nachvollziehbar begründen (mind. 10 Zeichen).').max(1000) });

@ApiTags('quality')
@Controller('quality')
export class QualityController {
  constructor(private readonly s: QualityService) {}
  @Get('config') @RequirePermission('quality.view') config() { return this.s.config(); }
  @Put('config') @RequirePermission('quality.manage') saveConfig(@CurrentActor() a: Actor, @Body(zodBody(qualityConfigSchema)) b: QualityConfig) { return this.s.saveConfig(a, b); }
  @Get('overview') @RequirePermission('quality.view') overview(@CurrentActor() a: Actor) { return this.s.overview(a); }
  @Get('check/:target/:id') @RequirePermission('quality.view')
  check(@CurrentActor() a: Actor, @Param('target', zodBody(target)) t: QualityTarget, @Param('id', ParseUUIDPipe) id: string) { return this.s.check(a, t, id); }
  @Post('exceptions') @RequirePermission('quality.exception') addException(@CurrentActor() a: Actor, @Body(zodBody(exceptionBody)) b: z.infer<typeof exceptionBody>) { return this.s.addException(a, b); }
  @Delete('exceptions/:id') @HttpCode(204) @RequirePermission('quality.exception')
  revoke(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ reason: z.string().trim().min(3).max(500) }))) b: { reason: string }) { return this.s.revokeException(a, id, b.reason); }
}
