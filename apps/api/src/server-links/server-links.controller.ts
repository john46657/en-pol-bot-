import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { linksSchema, ServerLinksService, type ServerLinks } from './server-links.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

/** Administration → Server-Verbund. */
@ApiTags('server-links')
@Controller('server-links')
export class ServerLinksController {
  constructor(private readonly s: ServerLinksService) {}
  @Get() @RequirePermission('settings.view') get() { return this.s.overview(); }
  @Put() @RequirePermission('settings.manage') save(@CurrentActor() a: Actor, @Body(zodBody(linksSchema)) b: ServerLinks) { return this.s.save(a, b); }
  @Post('move-shared') @HttpCode(200) @RequirePermission('settings.manage')
  move(@CurrentActor() a: Actor, @Body(zodBody(z.object({ guildId: z.string().regex(/^\d{15,25}$/) }))) b: { guildId: string }) { return this.s.moveShared(a, b.guildId); }
}
