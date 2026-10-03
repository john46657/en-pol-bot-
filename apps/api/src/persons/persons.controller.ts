import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PersonsService } from './persons.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { pageQuery } from '../common/pagination';

const create = z.object({ robloxUsername: z.string().trim().min(1).max(64), robloxUserId: z.string().nullish(), aliases: z.array(z.string().max(64)).max(20).optional(), notes: z.string().max(5000).optional(), custom: z.record(z.string(), z.unknown()).optional() });
const update = z.object({ version: z.number().int(), robloxUsername: z.string().trim().min(1).max(64).optional(), aliases: z.array(z.string().max(64)).max(20).optional(), notes: z.string().max(5000).nullable().optional(), custom: z.record(z.string(), z.unknown()).optional() });
const merge = z.object({ targetId: z.string().uuid(), confirm: z.literal(true), reason: z.string().trim().min(3).max(500) });
const archive = z.object({ reason: z.string().trim().min(3).max(500) });

@ApiTags('persons')
@Controller('persons')
export class PersonsController {
  constructor(private readonly persons: PersonsService) {}

  @Get() @RequirePermission('persons.view')
  list(@Query(zodBody(pageQuery)) q: z.infer<typeof pageQuery>) { return this.persons.list(q); }

  @Get(':id') @RequirePermission('persons.view')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.persons.overview(id); }

  @Post() @RequirePermission('persons.create')
  create(@CurrentActor() a: Actor, @Body(zodBody(create)) b: z.infer<typeof create>) { return this.persons.create(a, b); }

  @Patch(':id') @RequirePermission('persons.edit')
  update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(update)) b: z.infer<typeof update>) {
    const { version, ...rest } = b;
    return this.persons.update(a, id, version, rest);
  }

  @Post(':id/archive') @RequirePermission('persons.archive')
  archive(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(archive)) b: z.infer<typeof archive>) { return this.persons.archive(a, id, b.reason); }

  @Post(':id/merge') @RequirePermission('persons.merge')
  merge(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(merge)) b: z.infer<typeof merge>) { return this.persons.merge(a, id, b.targetId, b.reason); }
}
