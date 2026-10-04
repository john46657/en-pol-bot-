import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res, UseFilters } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { permissions } from '@nexus/permissions';
import { TicketError, getSettings, loads, postPanel, saveSettings, transcriptFileName, claim, closeTicket, setWaiting, CLOSE_REASONS, deleteCategory, getTicket, listCategories, listTickets, release, renderTranscript, restTicketDiscord, saveCategory, setParticipant, setPriority, stats, ticketHistory, type Actor } from '@nexus/tickets';
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

  /** Server-Einstellungen des Ticket-Systems (Texte, Kanäle, Rollen, Verhalten). */
  @Get('settings')
  @RequirePermissions('tickets.view')
  settings(@GuildId() guildId: string) {
    return getSettings(guildId);
  }

  @Put('settings')
  @RequirePermissions('tickets.manage')
  saveSettings(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return saveSettings(guildId, b, user.id);
  }

  /** Auslastung je Kategorie (wie im Panel). */
  @Get('loads')
  @RequirePermissions('tickets.view')
  loads(@GuildId() guildId: string) {
    return loads(guildId);
  }

  /** Panel im konfigurierten (oder angegebenen) Kanal veröffentlichen. */
  @Post('panel')
  @RequirePermissions('tickets.manage')
  async panel(@GuildId() guildId: string, @Body() b: Body_) {
    const channelId = str(b['channelId']) ?? (await getSettings(guildId)).panelChannelId;
    if (!channelId || !/^\d{5,25}$/.test(channelId)) throw new TicketError('invalid', 'Bitte zuerst einen Panel-Kanal wählen.');
    return { messageId: await postPanel(guildId, channelId, this.discord()) };
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
    return saveCategory(guildId, { id: str(b['id']), name: str(b['name']) ?? '', description: str(b['description']), emoji: str(b['emoji']), discordCategoryId: str(b['discordCategoryId']), staffRoleIds: Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : undefined, defaultPriority: str(b['defaultPriority']), maxOpenPerUser: typeof b['maxOpenPerUser'] === 'number' ? b['maxOpenPerUser'] : undefined, active: typeof b['active'] === 'boolean' ? b['active'] : undefined, color: typeof b['color'] === 'number' ? b['color'] : b['color'] === null ? null : undefined, maxOpenTotal: typeof b['maxOpenTotal'] === 'number' ? b['maxOpenTotal'] : undefined, requiredRoleIds: Array.isArray(b['requiredRoleIds']) ? b['requiredRoleIds'].filter((r): r is string => typeof r === 'string') : undefined, nameTemplate: typeof b['nameTemplate'] === 'string' ? b['nameTemplate'] : b['nameTemplate'] === null ? null : undefined, formFields: Array.isArray(b['formFields']) ? (b['formFields'] as never) : b['formFields'] === null ? null : undefined, transcriptEnabled: typeof b['transcriptEnabled'] === 'boolean' ? b['transcriptEnabled'] : b['transcriptEnabled'] === null ? null : undefined }, user.id);
  }

  @Delete('categories/:id')
  @RequirePermissions('tickets.manage')
  async deleteCategory(@GuildId() guildId: string, @Param('id') id: string, @CurrentUser() user: RequestUser) {
    await deleteCategory(guildId, id, user.id);
    return { ok: true };
  }

  /** Gespeichertes HTML-Transcript als Download (nie inline: Inhalte stammen von Nutzern). */
  @Get(':id/transcript.html')
  @RequirePermissions('tickets.view')
  async transcript(@GuildId() guildId: string, @Param('id') id: string, @Res() res: Response) {
    const t = await getTicket(guildId, id);
    if (!t.transcriptHtml) throw new TicketError('not-found', 'Für dieses Ticket gibt es kein HTML-Transcript.');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${transcriptFileName(t, t.userId)}"`);
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; sandbox");
    res.send(t.transcriptHtml);
  }

  @Get('close-reasons')
  @RequirePermissions('tickets.view')
  closeReasons() {
    return CLOSE_REASONS;
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

  @Post(':id/waiting')
  @RequirePermissions('tickets.handle')
  async waiting(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @Access() access: RequestAccess, @CurrentUser() user: RequestUser) {
    return setWaiting(guildId, id, b['waiting'] !== false, await this.actor(access, user), this.discord());
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
