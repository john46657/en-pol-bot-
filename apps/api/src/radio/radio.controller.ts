import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { RadioService } from './radio.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const target = z.object({ userId: z.string().uuid().optional(), discordId: z.string().regex(/^\d{15,25}$/).optional() }).refine((v) => !!v.userId !== !!v.discordId, 'Bitte genau einen Benutzer oder eine Discord-ID angeben.');

@ApiTags('radio')
@Controller('radio-whitelist')
export class RadioController {
  constructor(private readonly r: RadioService) {}
  @Get() @RequirePermission('team.view')
  list() { return this.r.list(); }
  @Get('check') @RequirePermission('team.view')
  check(@Query(zodBody(target)) q: z.infer<typeof target>) { return this.r.check(q); }
  @Post() @HttpCode(200) @RequirePermission('personnel.edit')
  add(@CurrentActor() a: Actor, @Body(zodBody(target)) b: z.infer<typeof target>) { return this.r.add(a, b); }
  @Post('remove') @HttpCode(200) @RequirePermission('personnel.edit')
  remove(@CurrentActor() a: Actor, @Body(zodBody(target)) b: z.infer<typeof target>) { return this.r.remove(a, b); }
}
