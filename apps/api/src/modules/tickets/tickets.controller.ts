import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseFilters } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { permissions } from '@nexus/permissions';
import { claim, closeTicket, deleteCategory, getTicket, listCategories, listTickets, release, renderTranscript, restTicketDiscord, saveCategory, setParticipant, setPriority, stats, ticketHistory, type Actor } from '@nexus/tickets';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { Access, type RequestAccess } from '../../common/decorators/scope.decorator.js';
import { TicketErrorFilter } from './tickets-error.filter.js';

type Body_ = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Tickets: Übersicht/Archiv/Transkript (tickets.view), Bearbeitung (tickets.handle), Kategorien (tickets.manage). */
@ApiTags('Tickets')
@ApiBearerAuth()
@UseFilters(TicketErrorFilter)
@Controller('guilds/:guildId/tickets')
export class TicketsController {
  constructor(private readonly config: ConfigService) {}
  private discord() {
    return restTicketDiscord(this.config.get<string>('DISCORD_TOKEN') ?? '');
  }
  private async actor(a: RequestAccess, user: RequestUser): Promise<Actor> {
    return { userId: user.id, roleIds: a.roleIds, manage: a.bypass || (await permissions.can(a, 'tickets.manage')), handle: a.bypass || (await permissions.can(a, 'tickets.handle')) };
  }

  @Get()
  @RequirePermissions('tickets.view')
  list(@GuildId() guildId: string, @Query() q: Record<string, string | undefined>) {
    return listTickets({ guildId, open: q['open'] === 'true', closed: q['closed'] === 'true', status: q['status'], categoryId: q['categoryId'] || undefined, userId: q['userId'] || undefined, claimedBy: q['claimedBy'] || undefined, priority: q['priority'] || undefined, query: q['query'], cursor: q['cursor'] || undefined, limit: Number(q['limit']) || 50 });
  }

  @Get('stats')
  @RequirePermissions('tickets.view')
  stats(@GuildId() guildId: string) {
    return stats(guildId);
  }

  @Get('categories')
  @RequirePermissions('tickets.view')
  categories(@GuildId() guildId: string) {
    return listCategories(guildId);
  }

  @Put('categories')
  @RequirePermissions('tickets.manage')
  saveCategory(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    const roles = b['staffRoleIds'];
    return saveCategory(guildId, { id: str(b['id']), name: str(b['name']) ?? '', description: str(b['description']), emoji: str(b['emoji']), discordCategoryId: str(b['discordCategoryId']), staffRoleIds: Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : undefined, defaultPriority: str(b['defaultPriority']), maxOpenPerUser: typeof b['maxOpenPerUser'] === 'number' ? b['maxOpenPerUser'] : undefined, active: typeof b['active'] === 'boolean' ? b['active'] : undefined }, user.id);
  }

  @Delete('categories/:id')
  @RequirePermissions('tickets.manage')
  async deleteCategory(@GuildId() guildId: string, @Param('id') id: string, @CurrentUser() user: RequestUser) {
    await deleteCategory(guildId, id, user.id);
    return { ok: true };
  }

  @Get(':id')
  @RequirePermissions('tickets.view')
  async view(@GuildId() guildId: string, @Param('id') id: string) {
    const ticket = await getTicket(guildId, id);
    return { ticket, events: await ticketHistory(guildId, id), transcriptText: ticket.status === 'CLOSED' ? renderTranscript(ticket) : null };
  }

  @Post(':id/claim')
  @RequirePermissions('tickets.handle')
  async claim(@GuildId() guildId: string, @Param('id') id: string, @Access() access: RequestAccess, @CurrentUser() user: RequestUser) {
    return claim(guildId, id, await this.actor(access, user), this.discord());
  }

  @Post(':id/release')
  @RequirePermissions('tickets.handle')
  async release(@GuildId() guildId: string, @Param('id') id: string, @Access() access: RequestAccess, @CurrentUser() user: RequestUser) {
    return release(guildId, id, await this.actor(access, user), this.discord());
  }

  @Post(':id/priority')
  @RequirePermissions('tickets.handle')
  async priority(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @Access() access: RequestAccess, @CurrentUser() user: RequestUser) {
    return setPriority(guildId, id, str(b['priority']) ?? '', await this.actor(access, user));
  }

  @Post(':id/participants')
  @RequirePermissions('tickets.handle')
  async participant(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @Access() access: RequestAccess, @CurrentUser() user: RequestUser) {
    return setParticipant(guildId, id, str(b['userId']) ?? '', b['add'] !== false, await this.actor(access, user), this.discord());
  }

  @Post(':id/close')
  @RequirePermissions('tickets.handle')
  async close(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @Access() access: RequestAccess, @CurrentUser() user: RequestUser) {
    return closeTicket(guildId, id, str(b['reason']), await this.actor(access, user), this.discord());
  }
}
