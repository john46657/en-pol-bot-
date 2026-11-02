import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { EVENT_CATEGORIES } from '@enrp/shared';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { CalendarService, createEventBody, eventInput } from './calendar.service';
import { MeetingsService, meetingBody, minutesBody, taskBody } from './meetings.service';

const listQ = z.object({ from: z.coerce.date(), to: z.coerce.date(), category: z.enum(EVENT_CATEGORIES).optional(), department: z.string().max(64).optional(), mine: z.enum(['true', 'false']).optional() });
const upcomingQ = z.object({ days: z.coerce.number().int().min(1).max(60).default(14), scope: z.enum(['mine', 'all']).default('all') });
const reasonBody = z.object({ reason: z.string().trim().min(3).max(500) });
const respondBody = z.object({ status: z.enum(['ACCEPTED', 'DECLINED', 'EXCUSED']), note: z.string().trim().max(300).optional() });
const inviteBody = z.object({ userIds: z.array(z.string().uuid()).min(1).max(200) });
const attendanceBody = z.object({ entries: z.array(z.object({ userId: z.string().uuid(), status: z.enum(['ATTENDED', 'ABSENT', 'EXCUSED']) })).min(1).max(500) });
const meetingsQ = z.object({ scope: z.enum(['upcoming', 'past']).default('upcoming') });
const taskStatus = z.object({ status: z.enum(['OPEN', 'DONE', 'CANCELLED']) });

/** Zentraler Kalender. Ansehen/teilnehmen: calendar.view · anlegen/ändern/absagen: calendar.manage (Besprechungen: Organisator). */
@ApiTags('calendar')
@Controller('calendar')
export class CalendarController {
  constructor(private readonly s: CalendarService) {}
  @Get() @RequirePermission('calendar.view')
  list(@CurrentActor() a: Actor, @Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.s.list(a, { ...q, mine: q.mine === 'true' }); }
  @Get('upcoming') @RequirePermission('calendar.view')
  upcoming(@CurrentActor() a: Actor, @Query(zodBody(upcomingQ)) q: z.infer<typeof upcomingQ>) { return this.s.upcoming(a, q.days, q.scope); }
  @Get(':id') @RequirePermission('calendar.view')
  get(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.get(a, id); }
  @Post() @RequirePermission('calendar.manage')
  create(@CurrentActor() a: Actor, @Body(zodBody(createEventBody)) b: z.infer<typeof createEventBody>) { return this.s.create(a, b); }
  /** Ändern/Verschieben: Recht im Service (Kalenderverwaltung oder Organisator der Besprechung) */
  @Patch(':id') @RequirePermission('calendar.view')
  update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(eventInput.extend({ version: z.number().int().min(1) }))) b: z.infer<typeof eventInput> & { version: number }) { return this.s.update(a, id, b); }
  @Post(':id/cancel') @HttpCode(200) @RequirePermission('calendar.view')
  cancel(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(reasonBody)) b: z.infer<typeof reasonBody>) { return this.s.cancel(a, id, b.reason); }
  @Post(':id/invite') @HttpCode(200) @RequirePermission('calendar.view')
  invite(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(inviteBody)) b: z.infer<typeof inviteBody>) { return this.s.invite(a, id, b.userIds); }
  @Post(':id/respond') @HttpCode(200) @RequirePermission('calendar.view')
  respond(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(respondBody)) b: z.infer<typeof respondBody>) { return this.s.respond(a, id, b.status, b.note); }
  @Post(':id/attendance') @HttpCode(200) @RequirePermission('calendar.view')
  attendance(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(attendanceBody)) b: z.infer<typeof attendanceBody>) { return this.s.attendance(a, id, b.entries); }
}

/** Besprechungsmanager. Ansehen: meetings.view · anlegen: meetings.organize · Protokoll: Organisator/meetings.minutes · privat: meetings.view_private. */
@ApiTags('meetings')
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly s: MeetingsService) {}
  @Get() @RequirePermission('meetings.view')
  list(@CurrentActor() a: Actor, @Query(zodBody(meetingsQ)) q: z.infer<typeof meetingsQ>) { return this.s.list(a, q); }
  @Get('tasks') @RequirePermission('meetings.view')
  tasks(@CurrentActor() a: Actor) { return this.s.openTasks(a); }
  @Get(':id') @RequirePermission('meetings.view')
  get(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.get(a, id); }
  @Get(':id/participants.csv') @RequirePermission('meetings.view')
  async csv(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="teilnehmer.csv"' }).send(`﻿${await this.s.exportParticipants(a, id)}`);
  }
  @Post() @RequirePermission('meetings.organize')
  create(@CurrentActor() a: Actor, @Body(zodBody(meetingBody)) b: z.infer<typeof meetingBody>) { return this.s.create(a, b); }
  @Patch(':id') @RequirePermission('meetings.view')
  update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(meetingBody.extend({ version: z.number().int().min(1) }))) b: z.infer<typeof meetingBody> & { version: number }) { return this.s.update(a, id, b); }
  @Post(':id/cancel') @HttpCode(200) @RequirePermission('meetings.view')
  cancel(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(reasonBody)) b: z.infer<typeof reasonBody>) { return this.s.cancel(a, id, b.reason); }
  @Patch(':id/minutes') @RequirePermission('meetings.view')
  minutes(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(minutesBody)) b: z.infer<typeof minutesBody>) { return this.s.saveMinutes(a, id, b); }
  @Post(':id/conduct') @HttpCode(200) @RequirePermission('meetings.view')
  conduct(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.conduct(a, id); }
  @Post(':id/tasks') @RequirePermission('meetings.view')
  addTask(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(taskBody)) b: z.infer<typeof taskBody>) { return this.s.addTask(a, id, b); }
  @Patch('tasks/:taskId') @RequirePermission('meetings.view')
  setTask(@CurrentActor() a: Actor, @Param('taskId', ParseUUIDPipe) id: string, @Body(zodBody(taskStatus)) b: z.infer<typeof taskStatus>) { return this.s.setTask(a, id, b.status); }
}
