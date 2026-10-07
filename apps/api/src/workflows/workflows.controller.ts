import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { workflowInput, WorkflowsService, type WorkflowInput } from './workflows.service';

@ApiTags('studio')
@Controller('studio/workflows')
export class WorkflowsController {
  constructor(private readonly s: WorkflowsService) {}

  @Get() @RequirePermission('studio.view')
  list() { return this.s.list(); }

  @Get(':id/runs') @RequirePermission('studio.view')
  runs(@Param('id', ParseUUIDPipe) id: string) { return this.s.runs(id); }

  @Post() @RequirePermission('studio.manage')
  create(@CurrentActor() a: Actor, @Body(zodBody(workflowInput)) b: WorkflowInput) { return this.s.create(a, b); }

  @Put(':id') @RequirePermission('studio.manage')
  update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(workflowInput)) b: WorkflowInput) { return this.s.update(a, id, b); }

  @Delete(':id') @HttpCode(204) @RequirePermission('studio.manage')
  async remove(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { await this.s.remove(a, id); }
}
