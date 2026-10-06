import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TeamChanceService, teamChanceSchema } from './teamchance.service';
import { BotService, CurrentActor, Public, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const guildQ = z.object({ guildId: z.string().regex(/^\d{15,25}$/).optional() });
/** Öffentliche Felder (Bewerbungsseite, Discord) – keine Channel-/Rollen-IDs. */
const publicView = (s: Awaited<ReturnType<TeamChanceService['status']>>) => ({ isOpen: s.isOpen, reason: s.reason, title: s.title, description: s.description, opensAt: s.opensAt, closesAt: s.closesAt, remaining: s.remaining, restrictApplications: s.restrictApplications });

@ApiTags('teamchance')
@Controller()
export class TeamChanceController {
  constructor(private readonly s: TeamChanceService) {}
  @Get('teamchance') @RequirePermission('teamchance.view') get() { return this.s.status(); }
  @Put('teamchance') @RequirePermission('teamchance.manage') save(@CurrentActor() a: Actor, @Body(zodBody(teamChanceSchema)) b: z.infer<typeof teamChanceSchema>) { return this.s.save(a, b); }
  @Public() @Get('teamchance/public') async pub(@Query(zodBody(guildQ)) q: z.infer<typeof guildQ>) { return publicView(await this.s.status(q.guildId ?? null)); }
  @BotService() @Get('bot/teamchance') async bot(@Query(zodBody(guildQ)) q: z.infer<typeof guildQ>) { return publicView(await this.s.status(q.guildId ?? null)); }
}
