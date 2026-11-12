import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { currentGuild } from '../common/guild-context';
import { zodBody } from '../common/zod.pipe';
import { SystemStatusService } from './system-status.service';

const q = z.object({ deep: z.enum(['0', '1']).optional() });

/**
 * Systemstatus für Dashboard, MDT und Leitstelle (`settings.view`). Die Diagnose (`deep=1`: Konfiguration, Speicher,
 * Administratorzugang) nur für globale Systemadministratoren – für alle anderen wird sie still weggelassen.
 */
@ApiTags('system')
@Controller('system')
export class SystemStatusController {
  constructor(private readonly s: SystemStatusService, private readonly perms: PermissionService) {}

  @Get('status') @RequirePermission('settings.view')
  async status(@CurrentActor() a: Actor, @Query(zodBody(q)) query: z.infer<typeof q>) {
    const owner = !!a.userId && (await this.perms.isOwner(a.userId));
    const res = await this.s.status({ guildId: currentGuild(), deep: query.deep === '1' && owner });
    return { ...res, canDiagnose: owner };
  }
}
