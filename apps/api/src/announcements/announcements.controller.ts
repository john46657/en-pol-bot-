import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ANNOUNCEMENT_STATUSES } from '@enrp/shared';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { announceConfigSchema, announcementBody, AnnouncementsService, ANNOUNCEMENT_TEMPLATES } from './announcements.service';

const listQ = z.object({ status: z.enum(ANNOUNCEMENT_STATUSES).optional() });
const previewBody = announcementBody.pick({ type: true, content: true, mentionRoleIds: true });
const reasonBody = z.object({ reason: z.string().trim().min(3).max(500) });

/** Ankündigungen. Ansehen: announce.view · Entwürfe: announce.create · veröffentlichen/planen/zurückziehen: announce.publish · Rollen erwähnen: announce.mention. */
@ApiTags('announcements')
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly s: AnnouncementsService) {}
  @Get() @RequirePermission('announce.view') list(@Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.s.list(q); }
  @Get('templates') @RequirePermission('announce.view') templates() { return ANNOUNCEMENT_TEMPLATES; }
  @Get('config') @RequirePermission('announce.view') config() { return this.s.config(); }
  @Put('config') @RequirePermission('announce.manage') saveConfig(@CurrentActor() a: Actor, @Body(zodBody(announceConfigSchema)) b: z.infer<typeof announceConfigSchema>) { return this.s.saveConfig(a, b); }
  @Post('preview') @HttpCode(200) @RequirePermission('announce.view') preview(@Body(zodBody(previewBody)) b: z.infer<typeof previewBody>) { return this.s.preview(b); }
  @Get(':id') @RequirePermission('announce.view') get(@Param('id', ParseUUIDPipe) id: string) { return this.s.get(id); }
  @Post() @RequirePermission('announce.create') create(@CurrentActor() a: Actor, @Body(zodBody(announcementBody)) b: z.infer<typeof announcementBody>) { return this.s.create(a, b); }
  @Patch(':id') @RequirePermission('announce.create') update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(announcementBody.extend({ version: z.number().int().min(1) }))) b: z.infer<typeof announcementBody> & { version: number }) { return this.s.update(a, id, b); }
  @Post(':id/publish') @HttpCode(200) @RequirePermission('announce.publish') publish(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.publish(a, id); }
  @Post(':id/retract') @HttpCode(200) @RequirePermission('announce.publish') retract(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(reasonBody)) b: z.infer<typeof reasonBody>) { return this.s.retract(a, id, b.reason); }
}
