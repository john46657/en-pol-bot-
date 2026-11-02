import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { PLANNED_SHIFT_STATUSES } from '@enrp/shared';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { createShiftBody, shiftInput, shiftplanConfigSchema, ShiftPlanService, type ShiftplanConfig } from './shiftplan.service';

const listQ = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), department: z.string().max(64).optional(), status: z.enum(PLANNED_SHIFT_STATUSES).optional(), mine: z.enum(['true', 'false']).optional() });
const updateBody = shiftInput.extend({ version: z.number().int().min(1) });
const reasonBody = z.object({ reason: z.string().trim().min(3).max(500) });
const optReason = z.object({ reason: z.string().trim().max(500).optional() });
const copyBody = z.object({ startsAt: z.coerce.date() });
const assignBody = z.object({ userIds: z.array(z.string().uuid()).min(1).max(50) });
const unassignBody = z.object({ userId: z.string().uuid(), reason: z.string().trim().max(500).optional() });
const reportBody = z.object({ message: z.string().trim().min(3).max(1000) });
const daysQ = z.object({ days: z.coerce.number().int().min(1).max(60).default(14) });

/** Schichtplanung. Ansehen: shiftplan.view · selbst an-/abmelden: shiftplan.signup · planen: shiftplan.manage. */
@ApiTags('shiftplan')
@Controller('shiftplan')
export class ShiftPlanController {
  constructor(private readonly s: ShiftPlanService) {}

  @Get() @RequirePermission('shiftplan.view')
  list(@CurrentActor() a: Actor, @Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.s.list(a, { ...q, mine: q.mine === 'true' }); }
  @Get('config') @RequirePermission('shiftplan.view')
  config() { return this.s.config(); }
  @Put('config') @RequirePermission('shiftplan.manage')
  saveConfig(@CurrentActor() a: Actor, @Body(zodBody(shiftplanConfigSchema)) b: ShiftplanConfig) { return this.s.saveConfig(a, b); }
  @Get('mine') @RequirePermission('shiftplan.view')
  mine(@CurrentActor() a: Actor, @Query(zodBody(daysQ)) q: z.infer<typeof daysQ>) { return this.s.mine(a, q.days); }
  /** MDT: aktuelle/nächste eigene Schicht */
  @Get('current') @RequirePermission('shiftplan.view')
  current(@CurrentActor() a: Actor) { return this.s.current(a); }
  /** Leitstelle: geplante vs. tatsächliche Besetzung */
  @Get('staffing') @RequirePermission('shiftplan.view')
  staffing(@CurrentActor() a: Actor) { return this.s.staffing(a); }
  /** Personen für Zuweisung/Leitung (nur für die Planung) */
  @Get('people') @RequirePermission('shiftplan.manage')
  people() { return this.s.people(); }
  @Get('export') @RequirePermission('shiftplan.view')
  async export(@CurrentActor() a: Actor, @Query(zodBody(listQ)) q: z.infer<typeof listQ>, @Res() res: Response) {
    const csv = await this.s.exportCsv(a, q);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="schichtplan.csv"' }).send(`﻿${csv}`);
  }
  @Get(':id') @RequirePermission('shiftplan.view')
  get(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.get(a, id); }

  @Post() @RequirePermission('shiftplan.manage')
  create(@CurrentActor() a: Actor, @Body(zodBody(createShiftBody)) b: z.infer<typeof createShiftBody>) { return this.s.create(a, b); }
  @Patch(':id') @RequirePermission('shiftplan.manage')
  update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(updateBody)) b: z.infer<typeof updateBody>) { return this.s.update(a, id, b); }
  @Post(':id/publish') @HttpCode(200) @RequirePermission('shiftplan.manage')
  publish(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.publish(a, id); }
  @Post(':id/cancel') @HttpCode(200) @RequirePermission('shiftplan.manage')
  cancel(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(reasonBody)) b: z.infer<typeof reasonBody>) { return this.s.cancel(a, id, b.reason); }
  @Post(':id/copy') @RequirePermission('shiftplan.manage')
  copy(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(copyBody)) b: z.infer<typeof copyBody>) { return this.s.copy(a, id, b.startsAt); }
  @Delete(':id') @RequirePermission('shiftplan.manage')
  remove(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.remove(a, id); }
  @Post(':id/assign') @HttpCode(200) @RequirePermission('shiftplan.manage')
  assign(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(assignBody)) b: z.infer<typeof assignBody>) { return this.s.assign(a, id, b.userIds); }
  @Post(':id/unassign') @HttpCode(200) @RequirePermission('shiftplan.manage')
  unassign(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(unassignBody)) b: z.infer<typeof unassignBody>) { return this.s.leave(a, id, b.userId, b.reason); }

  @Post(':id/signup') @HttpCode(200) @RequirePermission('shiftplan.signup')
  signup(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.signup(a, id); }
  @Post(':id/withdraw') @HttpCode(200) @RequirePermission('shiftplan.signup')
  withdraw(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(optReason)) b: z.infer<typeof optReason>) { return this.s.leave(a, id, a.userId!, b.reason); }
  @Post(':id/report') @HttpCode(200) @RequirePermission('shiftplan.view')
  report(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(reportBody)) b: z.infer<typeof reportBody>) { return this.s.report(a, id, b.message); }
}
