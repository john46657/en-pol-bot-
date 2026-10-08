import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { loggingConfigSchema, type LoggingConfig } from '@enrp/shared';
import { LoggingService } from './logging.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

/** Administration → Logging: welche Aktionen in welchen Discord-Kanal gemeldet werden. */
@ApiTags('logging')
@Controller('logging')
export class LoggingController {
  constructor(private readonly s: LoggingService) {}
  @Get() @RequirePermission('settings.view') get() { return this.s.get(); }
  @Get('types') @RequirePermission('settings.view') types() { return this.s.types(); }
  @Put() @RequirePermission('settings.manage') save(@CurrentActor() a: Actor, @Body(zodBody(loggingConfigSchema)) b: LoggingConfig) { return this.s.save(a, b); }
  @Post('test') @HttpCode(200) @RequirePermission('settings.manage') test(@CurrentActor() a: Actor, @Body(zodBody(z.object({ category: z.string().max(32) }))) b: { category: string }) { return this.s.test(a, b.category); }
}
