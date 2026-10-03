import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AdminService } from './admin.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const layout = z.object({ layout: z.array(z.unknown()).nullable() });
const evQ = z.object({ take: z.coerce.number().int().min(1).max(500).default(100), type: z.string().max(40).optional() });

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly a: AdminService) {}
  @Get('settings') @RequirePermission('settings.view')
  settings() { return this.a.getSettings(); }
  @Put('settings/:key') @RequirePermission('settings.manage')
  set(@CurrentActor() ac: Actor, @Param('key') key: string, @Body(zodBody(z.object({ value: z.unknown() }))) b: { value: unknown }) { return this.a.setSetting(ac, key, b.value); }
  @Get('security-events') @RequirePermission('audit.view')
  events(@Query(zodBody(evQ)) q: z.infer<typeof evQ>) { return this.a.securityEvents(q.take, q.type); }
  @Post('retention/run') @RequirePermission('settings.manage')
  retention(@CurrentActor() ac: Actor) { return this.a.runRetention(ac); }
  @Get('dashboard/layout') @RequirePermission('dashboard.view')
  getLayout(@CurrentActor() ac: Actor) { return this.a.getLayout(ac.userId!); }
  @Put('dashboard/layout') @RequirePermission('dashboard.customize')
  setLayout(@CurrentActor() ac: Actor, @Body(zodBody(layout)) b: z.infer<typeof layout>) { return this.a.setLayout(ac, b.layout); }
}
