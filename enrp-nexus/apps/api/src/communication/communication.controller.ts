import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CHANNELS, CommunicationService } from './communication.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';

const channel = z.enum(CHANNELS);
const post = z.object({ body: z.string().trim().min(1).max(4000), entityId: z.string().max(64).optional(), replyToId: z.string().uuid().optional() });
const listQ = z.object({ entityId: z.string().max(64).optional(), q: z.string().max(100).optional() });

@ApiTags('communication')
@Controller('communication')
export class CommunicationController {
  constructor(private readonly c: CommunicationService) {}
  @Get('channels/:channel/messages') @RequirePermission('communication.view')
  list(@CurrentActor() a: Actor, @Param('channel', zodBody(channel)) ch: z.infer<typeof channel>, @Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.c.list(a, ch, q.entityId, q.q); }
  @Post('channels/:channel/messages') @RequirePermission('communication.view')
  post(@CurrentActor() a: Actor, @Param('channel', zodBody(channel)) ch: z.infer<typeof channel>, @Body(zodBody(post)) b: z.infer<typeof post>) { return this.c.post(a, ch, b); }
  @Post('messages/:id/pin') @RequirePermission('communication.moderate')
  pin(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.c.moderate(a, id, 'pin'); }
  @Post('messages/:id/delete') @RequirePermission('communication.view')
  del(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.c.moderate(a, id, 'delete'); }
}
