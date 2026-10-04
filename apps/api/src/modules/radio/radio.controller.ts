import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseFilters } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { listGuildMembers } from '@nexus/discord';
import { RadioError, accessHistory, checkMember, listAccess, listChannels, removeAccess, removeChannel, saveChannel, setAccess } from '@nexus/radio';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { RadioErrorFilter } from './radio-error.filter.js';

type Body_ = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Funk-Whitelist und Funkkanäle. Durchgesetzt wird im Bot (Sprachkanal); hier wird verwaltet. */
@ApiTags('Radio')
@ApiBearerAuth()
@UseFilters(RadioErrorFilter)
@Controller('guilds/:guildId/radio')
export class RadioController {
  constructor(private readonly config: ConfigService) {}
  private token() {
    return this.config.get<string>('DISCORD_TOKEN') ?? '';
  }

  @Get('whitelist')
  @RequirePermissions('radio.view')
  async list(@GuildId() guildId: string, @Query() q: Record<string, string | undefined>) {
    const query = q['query']?.trim();
    let userIds: string[] | undefined;
    let names: Record<string, string> = {};
    if (query) {
      const hits = await listGuildMembers(this.token(), guildId, { query, limit: 50 });
      userIds = hits.map((m) => m.userId);
      names = Object.fromEntries(hits.map((m) => [m.userId, m.globalName ?? m.username]));
    }
    const page = await listAccess({ guildId, userIds, level: q['level'] || undefined, special: q['special'] === 'true' ? true : q['special'] === 'false' ? false : undefined, cursor: q['cursor'] || undefined, limit: Number(q['limit']) || 50 });
    return { ...page, names };
  }

  @Get('member-search')
  @RequirePermissions('radio.whitelist.manage')
  async memberSearch(@GuildId() guildId: string, @Query('query') query?: string) {
    const q = query?.trim();
    if (!q || q.length < 2) return [];
    return (await listGuildMembers(this.token(), guildId, { query: q, limit: 15 })).map((m) => ({ id: m.userId, username: m.username, displayName: m.globalName ?? m.username }));
  }

  @Post('whitelist')
  @RequirePermissions('radio.whitelist.manage')
  add(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return setAccess({ guildId, userId: str(b['userId']) ?? '', level: str(b['level']) ?? '', special: typeof b['special'] === 'boolean' ? b['special'] : undefined, reason: str(b['reason']), actorId: user.id });
  }

  @Delete('whitelist/:userId')
  @RequirePermissions('radio.whitelist.manage')
  async remove(@GuildId() guildId: string, @Param('userId') userId: string, @Query('reason') reason: string | undefined, @CurrentUser() user: RequestUser) {
    await removeAccess(guildId, userId, user.id, reason);
    return { ok: true };
  }

  @Get('whitelist/:userId/history')
  @RequirePermissions('radio.view')
  history(@GuildId() guildId: string, @Param('userId') userId: string) {
    return accessHistory(guildId, userId);
  }

  /** Was darf dieses Mitglied in welchem Funkkanal? (inkl. Dienststatus) */
  @Get('check/:userId')
  @RequirePermissions('radio.view')
  check(@GuildId() guildId: string, @Param('userId') userId: string) {
    return checkMember(guildId, userId);
  }

  @Get('channels')
  @RequirePermissions('radio.view')
  channels(@GuildId() guildId: string) {
    return listChannels(guildId);
  }

  @Put('channels')
  @RequirePermissions('radio.channel.manage')
  saveChannel(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    if (typeof b['channelId'] !== 'string') throw new RadioError('invalid', 'Kanal fehlt.');
    return saveChannel(guildId, { channelId: b['channelId'], name: str(b['name']) ?? '', area: str(b['area']), requiresDuty: typeof b['requiresDuty'] === 'boolean' ? b['requiresDuty'] : undefined, active: typeof b['active'] === 'boolean' ? b['active'] : undefined }, user.id);
  }

  @Delete('channels/:channelId')
  @RequirePermissions('radio.channel.manage')
  async removeChannel(@GuildId() guildId: string, @Param('channelId') channelId: string, @CurrentUser() user: RequestUser) {
    await removeChannel(guildId, channelId, user.id);
    return { ok: true };
  }
}
