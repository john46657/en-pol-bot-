import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TicketsService } from './tickets.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { pageQuery } from '../common/pagination';

const create = z.object({ personId: z.string().uuid().optional(), erlcPlayer: z.object({ serverId: z.string().uuid(), name: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_]+$/) }).optional(), notifyInGame: z.boolean().optional(), legalCodeId: z.string().uuid().optional(), reason: z.string().trim().min(3).max(1000), amount: z.number().min(0).max(1_000_000).optional(), notes: z.string().max(5000).optional(), reportId: z.string().uuid().optional() });
const voidSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const listQuery = pageQuery.extend({ personId: z.string().uuid().optional() });

@ApiTags('tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get() @RequirePermission('tickets.view')
  list(@Query(zodBody(listQuery)) q: z.infer<typeof listQuery>) { return this.tickets.list(q, q.personId); }

  /** Spieler im Spiel (ER:LC) für „Strafzettel an Spieler im Spiel“. */
  @Get('erlc-players') @RequirePermission('tickets.create')
  erlcPlayers() { return this.tickets.erlcPlayers(); }
  @Get(':id') @RequirePermission('tickets.view')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.tickets.get(id); }

  @Post() @RequirePermission('tickets.create')
  create(@CurrentActor() a: Actor, @Body(zodBody(create)) b: z.infer<typeof create>) { return this.tickets.issue(a, b); }

  @Post(':id/void') @RequirePermission('tickets.void')
  void(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(voidSchema)) b: z.infer<typeof voidSchema>) { return this.tickets.void(a, id, b.reason); }
}
