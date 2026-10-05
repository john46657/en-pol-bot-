import { BadGatewayException, BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { assertGuildId, auditRepository, prisma } from '@nexus/database';
import { createChannelMessage } from '@nexus/discord';
import { MIN_INTERVAL_MINUTES, nextRun, parseTimeOfDay, scheduledPayload, type ScheduledPayload } from '@nexus/jobs';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { DiscordService } from '../guild/discord.service.js';

const HTTPS = /^https:\/\/\S+$/;
const TYPES = ['once', 'interval', 'daily', 'weekly'] as const;
type Body_ = Record<string, unknown>;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

/** Automatische Nachrichten: ansehen (messages.view), anlegen/ändern/löschen/jetzt senden (messages.manage). */
@ApiTags('Messages')
@ApiBearerAuth()
@Controller('guilds/:guildId/scheduled-messages')
export class ScheduledMessagesController {
  constructor(
    private readonly discord: DiscordService,
    private readonly config: ConfigService,
  ) {}

  /** Eingabe prüfen und in Datenbankfelder übersetzen (inkl. nächstem Termin). */
  private async parse(guildId: string, b: Body_) {
    const name = str(b['name'], 80);
    if (!name) throw new BadRequestException('Bitte einen Namen angeben.');
    const channelId = str(b['channelId'], 25) ?? '';
    const channels = new Set((await this.discord.listChannels(guildId, 'text')).map((c) => c.id));
    if (!channels.has(channelId)) throw new BadRequestException('Der Kanal gehört nicht zu diesem Server oder ist kein Textkanal.');
    const type = str(b['scheduleType'], 10) as (typeof TYPES)[number];
    if (!TYPES.includes(type)) throw new BadRequestException('Unbekannte Wiederholung.');
    const p = (b['payload'] ?? {}) as ScheduledPayload;
    const payload: ScheduledPayload = {
      ...(str(p.content, 2000) ? { content: str(p.content, 2000) } : {}),
      ...(p.embed && (str(p.embed.title, 256) || str(p.embed.description, 4000))
        ? { embed: Object.fromEntries(Object.entries({ title: str(p.embed.title, 256), description: str(p.embed.description, 4000), color: p.embed.color && /^#[0-9a-fA-F]{6}$/.test(p.embed.color) ? p.embed.color : undefined, imageUrl: p.embed.imageUrl && HTTPS.test(p.embed.imageUrl) ? p.embed.imageUrl : undefined, thumbnailUrl: p.embed.thumbnailUrl && HTTPS.test(p.embed.thumbnailUrl) ? p.embed.thumbnailUrl : undefined, footer: str(p.embed.footer, 2048) }).filter(([, v]) => v)) }
        : {}),
      ...(Array.isArray(p.buttons) && p.buttons.length ? { buttons: p.buttons.filter((x) => typeof x?.label === 'string' && x.label.trim() && typeof x.url === 'string' && HTTPS.test(x.url)).slice(0, 5).map((x) => ({ label: x.label.trim().slice(0, 80), url: x.url })) } : {}),
      ...(Array.isArray(p.mentionRoleIds) && p.mentionRoleIds.length ? { mentionRoleIds: p.mentionRoleIds.filter((x) => typeof x === 'string' && /^\d{5,25}$/.test(x)).slice(0, 10) } : {}),
    };
    if (!payload.content && !payload.embed) throw new BadRequestException('Die Nachricht braucht einen Text oder ein Embed mit Titel/Beschreibung.');
    const runAt = typeof b['runAt'] === 'string' && b['runAt'] ? new Date(b['runAt']) : null;
    if (runAt && Number.isNaN(runAt.getTime())) throw new BadRequestException('Ungültiger Zeitpunkt.');
    const intervalMinutes = typeof b['intervalMinutes'] === 'number' ? Math.trunc(b['intervalMinutes']) : null;
    const timeOfDay = str(b['timeOfDay'], 5) ?? null;
    const weekdays = Array.isArray(b['weekdays']) ? [...new Set(b['weekdays'].filter((w): w is number => Number.isInteger(w) && w >= 1 && w <= 7))].sort() : [];
    if (type === 'once' && (!runAt || runAt.getTime() <= Date.now())) throw new BadRequestException('Bitte einen Zeitpunkt in der Zukunft angeben.');
    if (type === 'interval' && (!intervalMinutes || intervalMinutes < MIN_INTERVAL_MINUTES || intervalMinutes > 10_080)) throw new BadRequestException(`Das Intervall muss zwischen ${MIN_INTERVAL_MINUTES} Minuten und 7 Tagen liegen.`);
    if ((type === 'daily' || type === 'weekly') && !parseTimeOfDay(timeOfDay)) throw new BadRequestException('Bitte eine Uhrzeit im Format HH:MM angeben.');
    if (type === 'weekly' && weekdays.length === 0) throw new BadRequestException('Bitte mindestens einen Wochentag wählen.');
    const enabled = b['enabled'] !== false;
    const schedule = { scheduleType: type, runAt, intervalMinutes, timeOfDay, weekdays };
    return { name, channelId, payload, ...schedule, enabled, nextRunAt: enabled ? nextRun(schedule, new Date()) : null };
  }

  private async load(guildId: string, id: string) {
    const m = await prisma.scheduledMessage.findFirst({ where: { id, guildId: assertGuildId(guildId) } });
    if (!m) throw new NotFoundException('Nachricht nicht gefunden.');
    return m;
  }

  private audit(guildId: string, actorId: string, action: string, id: string, before?: unknown, after?: unknown) {
    return auditRepository.log({ guildId, actorId, action, resource: ['ScheduledMessage', id], ...(before ? { before: before as never } : {}), ...(after ? { after: after as never } : {}), permission: 'messages.manage' });
  }

  @Get()
  @RequirePermissions('messages.view')
  list(@GuildId() guildId: string) {
    return prisma.scheduledMessage.findMany({ where: { guildId: assertGuildId(guildId) }, orderBy: [{ enabled: 'desc' }, { nextRunAt: 'asc' }, { name: 'asc' }] });
  }

  @Post()
  @RequirePermissions('messages.manage')
  async create(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    const data = await this.parse(guildId, b);
    const row = await prisma.scheduledMessage.create({ data: { ...data, guildId, payload: data.payload as never, createdBy: user.id } });
    await this.audit(guildId, user.id, 'messages.scheduled.create', row.id, undefined, { name: row.name, channelId: row.channelId, scheduleType: row.scheduleType });
    return row;
  }

  @Put(':id')
  @RequirePermissions('messages.manage')
  async update(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    const before = await this.load(guildId, id);
    const data = await this.parse(guildId, b);
    const row = await prisma.scheduledMessage.update({ where: { id: before.id }, data: { ...data, payload: data.payload as never } });
    await this.audit(guildId, user.id, 'messages.scheduled.update', id, { name: before.name, enabled: before.enabled, scheduleType: before.scheduleType }, { name: row.name, enabled: row.enabled, scheduleType: row.scheduleType });
    return row;
  }

  @Delete(':id')
  @RequirePermissions('messages.manage')
  async remove(@GuildId() guildId: string, @Param('id') id: string, @CurrentUser() user: RequestUser) {
    const before = await this.load(guildId, id);
    await prisma.scheduledMessage.delete({ where: { id: before.id } });
    await this.audit(guildId, user.id, 'messages.scheduled.delete', id, { name: before.name });
    return { ok: true };
  }

  /** Sofort senden (zum Ausprobieren); der Zeitplan bleibt unverändert. */
  @Post(':id/send')
  @RequirePermissions('messages.manage')
  async send(@GuildId() guildId: string, @Param('id') id: string, @CurrentUser() user: RequestUser) {
    const m = await this.load(guildId, id);
    try {
      const r = await createChannelMessage(this.config.get<string>('DISCORD_TOKEN') ?? '', m.channelId, scheduledPayload(m.payload as ScheduledPayload));
      await this.audit(guildId, user.id, 'messages.scheduled.sent', id, undefined, { messageId: r.id });
      return { ok: true, messageId: r.id };
    } catch {
      throw new BadGatewayException('Der Bot konnte die Nachricht nicht senden (Rechte im Kanal prüfen).');
    }
  }
}
