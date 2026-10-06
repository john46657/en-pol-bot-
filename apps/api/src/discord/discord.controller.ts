import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { DiscordService } from './discord.service';
import { DiscordLiveService } from './discord-live.service';
import { ApplicationsService } from '../applications/applications.service';
import { DangerService } from '../danger/danger.service';
import { DutyService } from '../duty/duty.service';
import { PrismaService } from '../prisma/prisma.service';
import { BotService, CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const sf = z.string().regex(/^\d{15,25}$/);
const guildsBody = z.object({ guilds: z.array(z.object({
  id: sf, name: z.string().max(100), icon: z.string().url().max(300).nullable(),
  channels: z.array(z.object({ id: sf, name: z.string().max(100), type: z.enum(['text', 'category', 'voice', 'other']), parentId: sf.nullable(), position: z.number().int() })).max(500),
  roles: z.array(z.object({ id: sf, name: z.string().max(100), color: z.number().int().min(0), position: z.number().int() })).max(250),
})).max(50) });
const redeem = z.object({ code: z.string().trim().min(8).max(12), discordId: z.string().regex(/^\d{15,25}$/) });
const ack = z.object({ ok: z.boolean(), error: z.string().max(300).optional() });
const outboxQ = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });
const rate = process.env.NODE_ENV === 'test' ? 10_000 : 20;
const stateKey = z.string().regex(/^[a-z0-9:_-]{1,64}$/);
const stateBody = z.object({ value: z.unknown() });
const avatar = z.string().url().max(300).nullable();
const membersBody = z.object({ members: z.array(z.object({
  id: sf, guildId: sf, username: z.string().max(100), displayName: z.string().max(100), avatar, status: z.enum(['online', 'idle', 'dnd', 'offline', 'unknown']),
  roleIds: z.array(sf).max(250), joinedAt: z.string().datetime().nullable(),
})).max(5000) });
const voiceBody = z.object({ channels: z.array(z.object({
  id: sf, guildId: sf, name: z.string().max(100), parentId: sf.nullable(), parentName: z.string().max(100).nullable(), position: z.number().int(),
  members: z.array(z.object({ id: sf, displayName: z.string().max(100), avatar, selfMute: z.boolean(), selfDeaf: z.boolean(), serverMute: z.boolean(), serverDeaf: z.boolean(), video: z.boolean(), streaming: z.boolean(), since: z.string().datetime().nullable() })).max(500),
})).max(500) });
const openQ = z.object({ discordId: z.string().regex(/^\d{15,25}$/) });
const application = z.object({ guildId: z.string().regex(/^\d{15,25}$/).optional(), robloxUsername: z.string().trim().min(1).max(64), robloxUserId: z.string().max(20).optional(), discordId: z.string().regex(/^\d{15,25}$/), discordName: z.string().trim().max(100).optional(), durationSec: z.number().int().min(0).max(86_400).optional(), joinedAt: z.coerce.date().optional(), answers: z.record(z.string(), z.union([z.string().max(5000), z.array(z.string().max(100)).max(25)])) });

/** Web-Seite: eigenes Konto verknüpfen. Authentifiziert per Session; Bot-Zugang ist hier nicht erlaubt. */
@ApiTags('discord')
@Controller('discord')
export class DiscordController {
  constructor(private readonly d: DiscordService) {}
  @Get('link') link(@CurrentActor() a: Actor) { return this.d.status(a.userId!); }
  /** Server des Bots mit Channels und Rollen (Namen + Auswahllisten im Dashboard). */
  @Get('guilds') @RequirePermission('dashboard.view') guilds() { return this.d.guilds(); }
  @Post('link-code') @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 10, ttl: 60_000 } })
  linkCode(@CurrentActor() a: Actor) { return this.d.createLinkCode(a); }
  @Delete('link') @HttpCode(204) unlinkSelf(@CurrentActor() a: Actor) { return this.d.unlink(a, a.userId!); }
  @Delete('links/:userId') @HttpCode(204) @RequirePermission('users.manage')
  unlinkUser(@CurrentActor() a: Actor, @Param('userId', ParseUUIDPipe) userId: string) { return this.d.unlink(a, userId); }
}

/** Dienst-zu-Dienst-Endpunkte des Bots (Header `Authorization: Bot <BOT_API_TOKEN>`); ohne Benutzerkontext. */
@ApiTags('bot')
@Controller('bot')
export class BotController {
  constructor(private readonly d: DiscordService, private readonly live: DiscordLiveService, private readonly duty: DutyService, private readonly danger: DangerService, private readonly applications: ApplicationsService, private readonly prisma: PrismaService) {}
  @BotService() @Throttle({ default: { limit: rate, ttl: 60_000 } }) @Post('link') @HttpCode(200)
  redeem(@Body(zodBody(redeem)) b: z.infer<typeof redeem>) { return this.d.redeem(b.code, b.discordId); }
  @BotService() @Get('config') config() { return this.d.channels(); }
  @BotService() @Put('guilds') @HttpCode(204) async guilds(@Body(zodBody(guildsBody)) b: z.infer<typeof guildsBody>) { await this.d.saveGuilds(b.guilds); }
  @BotService() @Get('outbox') outbox(@Query(zodBody(outboxQ)) q: z.infer<typeof outboxQ>) { return this.d.pending(q.limit); }
  @BotService() @Post('outbox/:id/ack') @HttpCode(204)
  ack(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(ack)) b: z.infer<typeof ack>) { return this.d.ack(id, b.ok, b.error); }

  /** Teamübersicht für die selbst aktualisierende Teamliste in Discord (nur Anzeigefelder). */
  @BotService() @Get('team')
  async team() {
    const rows = await this.duty.overview();
    const order = (((await this.prisma.systemSetting.findUnique({ where: { key: 'team.rankOrder' } }))?.value as string[] | undefined) ?? []);
    return { rankOrder: order, members: rows.map((r) => ({ name: r.name, rank: r.rank, callsign: r.callsign, team: r.team, dutyStatus: r.dutyStatus, unit: r.unit?.callsign ?? null })) };
  }

  /** Teammitglieder (Avatar, Name, Online-Status, Rollen) – der Bot meldet mindestens alle 60 Sekunden. */
  @BotService() @Get('team-roles') async teamRoles() { return { roleIds: await this.live.teamRoleIds() }; }
  @BotService() @Put('members') @HttpCode(204) members(@Body(zodBody(membersBody)) b: z.infer<typeof membersBody>) { this.live.setMembers(b.members); }
  /** Voice-Channels mit Personen (getrennt von der Teamliste). */
  @BotService() @Put('voice') @HttpCode(204) voice(@Body(zodBody(voiceBody)) b: z.infer<typeof voiceBody>) { this.live.setVoice(b.channels); }

  @BotService() @Get('danger') dangerState() { return this.danger.get(); }

  @BotService() @Get('state/:key') async getState(@Param('key', zodBody(stateKey)) key: string) { return { value: await this.d.getState(key) }; }
  @BotService() @Put('state/:key') @HttpCode(204)
  async setState(@Param('key', zodBody(stateKey)) key: string, @Body(zodBody(stateBody)) b: z.infer<typeof stateBody>) { await this.d.setState(key, b.value); }

  /** Bewerbung aus Discord. Eigener Dienstweg (mit Bot-Token), damit das öffentliche Rate-Limit pro IP nicht alle Discord-Bewerber gemeinsam trifft. */
  @BotService() @Get('application/open')
  openApplication(@Query(zodBody(openQ)) q: z.infer<typeof openQ>) { return this.applications.openForDiscord(q.discordId); }
  @BotService() @Throttle({ default: { limit: rate, ttl: 60_000 } }) @Post('application') @HttpCode(201)
  submitApplication(@Body(zodBody(application)) b: z.infer<typeof application>) { return this.applications.submit({ robloxUsername: b.robloxUsername, robloxUserId: b.robloxUserId, answers: b.answers }, { discordId: b.discordId, discordName: b.discordName, durationSec: b.durationSec, joinedAt: b.joinedAt, guildId: b.guildId }); }
}
