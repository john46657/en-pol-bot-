import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentActor } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { LOCK_TYPE_KEYS, LocksService, type LockType } from './locks.service';

const typeParam = z.enum(LOCK_TYPE_KEYS);
const acquireBody = z.object({ force: z.boolean().optional() });

/** Rechte je Datensatzart werden im Service geprüft (Ansehen bzw. Bearbeiten des jeweiligen Moduls). */
@ApiTags('locks')
@Controller('locks')
export class LocksController {
  constructor(private readonly locks: LocksService) {}

  @Get(':type/:id')
  status(@CurrentActor() a: Actor, @Param('type', zodBody(typeParam)) type: LockType, @Param('id', ParseUUIDPipe) id: string) { return this.locks.status(a, type, id); }

  @Post(':type/:id') @HttpCode(200)
  acquire(@CurrentActor() a: Actor, @Param('type', zodBody(typeParam)) type: LockType, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(acquireBody)) b: z.infer<typeof acquireBody>) { return this.locks.acquire(a, type, id, b.force); }

  @Delete(':type/:id') @HttpCode(204)
  async release(@CurrentActor() a: Actor, @Param('type', zodBody(typeParam)) type: LockType, @Param('id', ParseUUIDPipe) id: string) { await this.locks.release(a, type, id); }
}
