import { Body, Controller, Get, Param, Post, Query, UseFilters } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TYPE_LABEL, TYPES, createRestriction, listRestrictions, revokeRestriction } from '@nexus/restrictions';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { RestrictionErrorFilter } from './restriction-error.filter.js';

type Body_ = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
/** ISO-Datum oder leer; ungültige Angaben ergeben ein ungültiges Datum, das der Dienst ablehnt. */
const date = (v: unknown): Date | undefined => (typeof v === 'string' && v.trim() ? new Date(v) : undefined);

/** Sperren (Bewerbung, Ticket, Fraktion, Funk): ansehen, verhängen, aufheben. */
@ApiTags('Restrictions')
@ApiBearerAuth()
@UseFilters(RestrictionErrorFilter)
@Controller('guilds/:guildId/restrictions')
export class RestrictionsController {
  @Get('types')
  @RequirePermissions('restrictions.view')
  types() {
    return TYPES.map((t) => ({ type: t, label: TYPE_LABEL[t] }));
  }

  @Get()
  @RequirePermissions('restrictions.view')
  list(@GuildId() guildId: string, @Query() q: Record<string, string | undefined>) {
    return listRestrictions({ guildId, userId: q['userId'] || undefined, type: q['type'], status: q['status'], limit: Number(q['limit']) || 100 });
  }

  @Post()
  @RequirePermissions('restrictions.create')
  create(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return createRestriction({ guildId, actorId: user.id, userId: str(b['userId']) ?? '', type: str(b['type']) ?? '', reason: str(b['reason']) ?? '', note: str(b['note']), startsAt: date(b['startsAt']), endsAt: date(b['endsAt']) ?? null });
  }

  @Post(':id/revoke')
  @RequirePermissions('restrictions.revoke')
  revoke(@GuildId() guildId: string, @Param('id') id: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return revokeRestriction(guildId, id, str(b['reason']), user.id);
  }
}
