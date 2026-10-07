import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { VoiceSupportRoom } from '@enrp/shared';
import { roomsSchema, VoiceSupportService } from './voice-support.service';
import { BotService, CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { currentGuild } from '../common/guild-context';

const sf = z.string().regex(/^\d{15,25}$/);
const guildQ = z.object({ guildId: sf.optional() });
const casesQ = z.object({ guildId: sf.optional(), status: z.enum(['OPEN', 'WAITING', 'CLAIMED', 'DECLINED', 'ABANDONED', 'CLOSED']).optional() });
const voice = z.object({ guildId: sf, channelId: sf, discordId: sf, userName: z.string().trim().min(1).max(100).default('?') });
const staff = z.object({ discordId: sf, name: z.string().trim().min(1).max(100), roleIds: z.array(sf).max(250).default([]), admin: z.boolean().default(false) });

/** Dashboard: Räume (Tickets → Sprach-Support) und Fälle. */
@ApiTags('voice-support')
@Controller('voice-support')
export class VoiceSupportController {
  constructor(private readonly s: VoiceSupportService) {}
  @Get('rooms') @RequirePermission('ticket.view')
  rooms(@Query(zodBody(guildQ)) q: z.infer<typeof guildQ>) { return this.s.rooms(q.guildId ?? currentGuild()); }
  @Put('rooms') @RequirePermission('ticket.settings')
  save(@CurrentActor() a: Actor, @Query(zodBody(guildQ)) q: z.infer<typeof guildQ>, @Body(zodBody(roomsSchema)) b: VoiceSupportRoom[]) { return this.s.saveRooms(a, b, q.guildId ?? currentGuild()); }
  @Get('cases') @RequirePermission('ticket.view')
  cases(@Query(zodBody(casesQ)) q: z.infer<typeof casesQ>) { return this.s.cases({ guildId: q.guildId ?? currentGuild(), status: q.status }); }
}

/** Dienstweg des Bots. Team-Aktionen tragen Discord-ID, Name und Rollen der klickenden Person (Team-Rolle des Raums). */
@ApiTags('bot')
@Controller('bot/voice-support')
export class BotVoiceSupportController {
  constructor(private readonly s: VoiceSupportService) {}
  @BotService() @Get('rooms') rooms(@Query(zodBody(guildQ)) q: z.infer<typeof guildQ>) { return this.s.rooms(q.guildId); }
  @BotService() @Post('join') @HttpCode(200) join(@Body(zodBody(voice)) b: z.infer<typeof voice>) { return this.s.join(b); }
  @BotService() @Post('left') @HttpCode(200) left(@Body(zodBody(voice)) b: z.infer<typeof voice>) { return this.s.left(b); }
  @BotService() @Post('empty') @HttpCode(200) empty(@Body(zodBody(z.object({ channelId: sf }))) b: { channelId: string }) { return this.s.channelEmpty(b.channelId); }
  @BotService() @Post('cases/:id/posted') @HttpCode(204)
  async posted(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ messageId: sf }))) b: { messageId: string }) { await this.s.posted(id, b.messageId); }
  @BotService() @Post('cases/:id/claim') @HttpCode(200) claim(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(staff)) b: z.infer<typeof staff>) { return this.s.claim(id, b); }
  @BotService() @Post('cases/:id/channel') @HttpCode(200)
  channel(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ channelId: sf.nullable(), created: z.boolean(), threadId: sf.nullable() }))) b: { channelId: string | null; created: boolean; threadId: string | null }) { return this.s.channel(id, b); }
  @BotService() @Post('cases/:id/decline') @HttpCode(200)
  decline(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(staff.extend({ reason: z.string().trim().max(500).optional() }))) b: z.infer<typeof staff> & { reason?: string }) { return this.s.decline(id, b, b.reason); }
  @BotService() @Post('cases/:id/message') @HttpCode(200)
  message(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(staff.extend({ text: z.string().trim().min(1).max(2000) }))) b: z.infer<typeof staff> & { text: string }) { return this.s.sendMessage(id, b, b.text); }
  @BotService() @Post('cases/:id/close') @HttpCode(200) close(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(staff)) b: z.infer<typeof staff>) { return this.s.close(id, b); }
  @BotService() @Post('cases/:id/rating') @HttpCode(200)
  rate(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ discordId: sf, stars: z.number().int().min(1).max(5) }))) b: { discordId: string; stars: number }) { return this.s.rate(id, b.discordId, b.stars); }
}
