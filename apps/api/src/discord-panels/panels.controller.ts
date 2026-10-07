import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { formPanelSchema, staffListSchema, type FormPanel, type StaffList } from '@enrp/shared';
import { PanelsService } from './panels.service';
import { BotService, CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { currentGuild } from '../common/guild-context';
import { AppError } from '../common/errors';

const sf = z.string().regex(/^\d{15,25}$/);
const mode = z.object({ mode: z.enum(['update', 'new']).default('update') });
const same = (a: string, b: string) => { if (a !== b) throw new AppError('VALIDATION_FAILED', 'ID passt nicht.'); };

/** Discord-Nachrichten: Staff-Listen (Team) und Formular-Panels (Einstellungen). */
@ApiTags('discord-panels')
@Controller('discord-panels')
export class PanelsController {
  constructor(private readonly s: PanelsService) {}
  @Get('staff') @RequirePermission('team.view') staff() { return this.s.staffLists(currentGuild()); }
  @Put('staff/:id') @RequirePermission('team.manage')
  saveStaff(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(staffListSchema)) b: StaffList) { same(id, b.id); return this.s.saveStaff(a, b); }
  @Delete('staff/:id') @HttpCode(204) @RequirePermission('team.manage') removeStaff(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.removeStaff(a, id); }
  @Post('staff/:id/duplicate') @RequirePermission('team.manage') dupStaff(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.duplicateStaff(a, id); }
  @Get('staff-members') @RequirePermission('team.view') preview() { return this.s.previewStaff(currentGuild()); }
  @Post('staff/:id/send') @HttpCode(202) @RequirePermission('team.manage')
  sendStaff(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(mode)) b: z.infer<typeof mode>) { return this.s.sendStaff(a, id, b.mode); }

  @Get('forms') @RequirePermission('settings.view') forms() { return this.s.formPanels(currentGuild()); }
  @Put('forms/:id') @RequirePermission('settings.manage')
  saveForm(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(formPanelSchema)) b: FormPanel) { same(id, b.id); return this.s.saveForm(a, b); }
  @Delete('forms/:id') @HttpCode(204) @RequirePermission('settings.manage') removeForm(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.removeForm(a, id); }
  @Post('forms/:id/send') @HttpCode(202) @RequirePermission('settings.manage')
  sendForm(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(mode)) b: z.infer<typeof mode>) { return this.s.sendForm(a, id, b.mode); }
  @Get('forms/:id/submissions') @RequirePermission('settings.view') subs(@Param('id', ParseUUIDPipe) id: string) { return this.s.submissions(id); }
  @Delete('submissions/:id') @HttpCode(204) @RequirePermission('settings.manage') removeSub(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.removeSubmission(a, id); }
}

const submit = z.object({ guildId: sf.nullable(), discordId: sf, userName: z.string().min(1).max(100), avatar: z.string().url().max(300).optional(), values: z.record(z.string().max(40), z.string().max(4000)) });

@ApiTags('bot')
@Controller('bot/panels')
export class BotPanelsController {
  constructor(private readonly s: PanelsService) {}
  @BotService() @Get('staff') staff() { return this.s.botStaffLists(); }
  @BotService() @Get('forms/:id') form(@Param('id', ParseUUIDPipe) id: string) { return this.s.botForm(id); }
  @BotService() @Post('forms/:id/submit') @HttpCode(200)
  submit(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(submit)) b: z.infer<typeof submit>) { return this.s.botSubmit(id, b); }
  @BotService() @Post('submissions/:id/posted') @HttpCode(204)
  async posted(@Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ channelId: sf, messageId: sf }))) b: { channelId: string; messageId: string }) { await this.s.botSubmissionPosted(id, b.channelId, b.messageId); }
}
