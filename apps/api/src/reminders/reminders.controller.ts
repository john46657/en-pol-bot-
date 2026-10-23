import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { REMINDER_MAX_MS, REMINDER_MIN_MS, REMINDER_TEXT_MAX } from '@enrp/shared';
import { BotService } from '../authz/decorators';
import { zodBody } from '../common/zod.pipe';
import { RemindersService } from './reminders.service';

const sf = z.string().regex(/^\d{15,25}$/);
const create = z.object({ discordId: sf, guildId: sf.nullish(), channelId: sf.nullish(), text: z.string().max(REMINDER_TEXT_MAX * 2), dm: z.boolean(), delayMs: z.number().int().min(REMINDER_MIN_MS).max(REMINDER_MAX_MS) });
const who = z.object({ discordId: sf });
const snooze = z.object({ discordId: sf, fire: z.number().int().min(1), minutes: z.number().int() });
const done = z.object({ discordId: sf, fire: z.number().int().min(1) });

/** Erinnerungen für den Bot (`/remind-me`, `/erinnerungen`, Buttons) – ohne verknüpftes Konto nutzbar, immer nur die eigenen. */
@ApiTags('bot')
@Controller('bot/reminders')
export class BotRemindersController {
  constructor(private readonly r: RemindersService) {}
  @BotService() @Post()
  create(@Body(zodBody(create)) b: z.infer<typeof create>) { return this.r.create(b); }
  @BotService() @Get()
  list(@Query(zodBody(who)) q: z.infer<typeof who>) { return this.r.list(q.discordId); }
  @BotService() @Delete(':id')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Query(zodBody(who)) q: z.infer<typeof who>) { return this.r.cancel(id, q.discordId); }
  @BotService() @Post(':id/snooze') @HttpCode(200)
  snooze(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(snooze)) b: z.infer<typeof snooze>) { return this.r.snooze(id, b.discordId, b.fire, b.minutes); }
  @BotService() @Post(':id/done') @HttpCode(200)
  done(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(done)) b: z.infer<typeof done>) { return this.r.done(id, b.discordId, b.fire); }
}
