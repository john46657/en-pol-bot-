import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { MODULE_KEYS } from '@enrp/shared';
import { BotService, CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { homeGuild } from '../common/guild-context';
import { ModulesService } from './modules.service';

const moduleKey = z.string().refine((k) => MODULE_KEYS.includes(k), 'Unbekanntes Modul.');
const patchModule = z.object({ enabled: z.boolean(), version: z.number().int().min(0) }).strict();

/** Administration → Module. */
@ApiTags('modules')
@Controller('modules')
export class ModulesController {
  constructor(private readonly s: ModulesService) {}
  @Get() @RequirePermission('modules.view') list() { return this.s.list(); }
  @Patch(':moduleKey') @RequirePermission('modules.manage')
  set(@CurrentActor() a: Actor, @Param('moduleKey', zodBody(moduleKey)) key: string, @Body(zodBody(patchModule)) b: z.infer<typeof patchModule>) { return this.s.set(a, key, b.enabled, b.version); }
}

/** Für den Bot: Discord-Server dieses Systems und abgeschaltete Module (danach registriert er die Befehle). Nur per Bot-Token. */
@ApiTags('bot')
@Controller('bot/server')
export class BotServerController {
  constructor(private readonly s: ModulesService) {}
  @BotService() @Get() async get() { return { guildId: homeGuild(), disabled: [...(await this.s.disabled())] }; }
}
