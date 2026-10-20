import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { RadioWhitelistService } from './radio-whitelist.service';
import { BotService, CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { AppError } from '../common/errors';

const snowflake = z.string().regex(/^\d{15,25}$/, 'Ungültige Discord-ID.');
const target = z.object({ userId: z.string().uuid().optional(), discordId: snowflake.optional() }).refine((v) => !!v.userId !== !!v.discordId, 'Bitte genau einen Benutzer oder eine Discord-ID angeben.');
const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).nullish().transform((v) => (v ? v : null));
const date = z.coerce.date();
const reason = text(1000).min(3, 'Bitte eine Begründung angeben (mind. 3 Zeichen).');
const version = z.number().int().positive().optional();
const statusFilter = z.enum(['active', 'suspended', 'expired', 'pending', 'disabled', 'revoked', 'all', 'open']).default('open');
const page = { page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50), q: z.string().trim().max(100).optional() };

const listQ = z.object({ status: statusFilter, ...page });
const createB = z.object({ discordId: snowflake, discordName: optText(100), rank: optText(80), department: optText(80), externalName: optText(100), reason, expiresAt: date.nullish(), status: z.enum(['ACTIVE', 'PENDING']).default('ACTIVE') });
const updateB = z.object({ version: z.number().int().positive(), discordName: optText(100).optional(), rank: optText(80).optional(), department: optText(80).optional(), externalName: optText(100).optional(), reason: optText(1000).optional() });
const activateB = z.object({ reason: optText(1000), expiresAt: date.nullish(), version });
const reasonB = z.object({ reason, version });
const extendB = z.object({ expiresAt: date.nullable(), reason: optText(1000), version });
const suspendB = z.object({ reason, until: date.nullish(), version });
const unsuspendB = z.object({ reason: optText(1000), version });
const restoreB = z.object({ reason, expiresAt: date.nullish() });
const discordIdB = z.object({ discordId: snowflake });
const requestsQ = z.object({ status: z.enum(['PENDING', 'DONE', 'ALL']).default('PENDING'), ...page });
const decideB = z.object({ decision: z.enum(['APPROVE', 'REJECT']), reason: optText(1000), expiresAt: date.nullish() });
const roleIds = z.array(snowflake).max(50);
const rolesB = z.object({
  roleSync: z.object({ enabled: z.boolean(), roleOnly: z.boolean().default(false), grantRoleIds: roleIds, requiredRoleIds: roleIds, onRoleGain: z.enum(['ACTIVATE', 'PENDING', 'NONE']), onRoleLoss: z.enum(['REVOKE', 'DISABLE', 'NONE']), manualOnRoleLoss: z.enum(['KEEP', 'DISABLE', 'REVOKE']) }),
  radioRoleIds: roleIds,
});
const panelB = z.object({ channelId: snowflake.nullable(), title: text(256).min(1), text: text(4000).min(1), buttonLabel: text(80).min(1), color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Farbe als #RRGGBB.') });
const formField = z.object({ key: z.string().regex(/^[a-z0-9_]{1,30}$/, 'Feld-Schlüssel: nur a–z, 0–9, _'), label: text(45).min(1), placeholder: text(100).default(''), paragraph: z.boolean(), required: z.boolean(), maxLength: z.number().int().min(1).max(1000) });
const formB = z.object({ title: text(45).min(1), fields: z.array(formField).min(1).max(5, 'Discord erlaubt höchstens 5 Felder.') })
  .refine((f) => new Set(f.fields.map((x) => x.key)).size === f.fields.length, 'Jedes Feld braucht einen eigenen Schlüssel.')
  .refine((f) => f.fields.some((x) => x.key === 'reason'), 'Das Feld „Begründung“ (reason) muss enthalten sein.');
const requestsB = z.object({ requests: z.object({ enabled: z.boolean(), preventDuplicates: z.boolean(), notifyChannelId: snowflake.nullable(), approveRoleIds: z.array(snowflake).max(10).default([]), panel: panelB, form: formB }), notifyMembers: z.boolean() });
const integrationB = z.object({
  provider: z.enum(['NONE', 'ZELLO_WORK', 'ZELLO_APP', 'OTHER_MANUAL']), displayName: text(80).min(1), network: optText(63), channel: optText(100), adminUsername: optText(100),
  password: z.string().max(200).optional(), apiKey: z.string().max(500).optional(), clearCredentials: z.boolean().optional(), autoSync: z.boolean(), version: z.number().int().positive(),
});
const exportQ = z.object({ status: statusFilter });
const importB = z.object({ csv: z.string().min(1).max(2_000_000), dryRun: z.boolean().default(true) });
const logsQ = z.object(page);
type Z<T extends z.ZodTypeAny> = z.infer<T>;

/** 🎙️ Funk-Whitelist im Dashboard. Jede Route mit eigenem, granularem Recht (deny-by-default). */
@ApiTags('radio-whitelist')
@Controller('radio-whitelist')
export class RadioWhitelistController {
  constructor(private readonly s: RadioWhitelistService) {}

  @Get('grants') @RequirePermission('radiowhitelist.view')
  list(@Query(zodBody(listQ)) q: Z<typeof listQ>) { return this.s.list(q); }
  @Get('summary') @RequirePermission('radiowhitelist.view')
  summary() { return this.s.counts(); }
  @Get('grants/:id') @RequirePermission('radiowhitelist.view')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.s.get(id); }

  @Post('grants') @RequirePermission('radiowhitelist.grant')
  create(@CurrentActor() a: Actor, @Body(zodBody(createB)) b: Z<typeof createB>) { return this.s.create(a, b); }
  @Patch('grants/:id') @RequirePermission('radiowhitelist.grant')
  update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(updateB)) b: Z<typeof updateB>) { return this.s.update(a, id, b); }
  @Post('grants/:id/activate') @HttpCode(200) @RequirePermission('radiowhitelist.grant')
  activate(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(activateB)) b: Z<typeof activateB>) { return this.s.activate(a, id, b); }
  @Post('grants/:id/deactivate') @HttpCode(200) @RequirePermission('radiowhitelist.grant')
  deactivate(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(reasonB)) b: Z<typeof reasonB>) { return this.s.deactivate(a, id, b); }
  @Post('grants/:id/extend') @HttpCode(200) @RequirePermission('radiowhitelist.grant')
  extend(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(extendB)) b: Z<typeof extendB>) { return this.s.extend(a, id, b); }
  @Post('grants/:id/restore') @HttpCode(200) @RequirePermission('radiowhitelist.grant')
  restore(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(restoreB)) b: Z<typeof restoreB>) { return this.s.restore(a, id, b); }
  @Post('grants/:id/discord-id') @HttpCode(200) @RequirePermission('radiowhitelist.grant')
  discordId(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(discordIdB)) b: Z<typeof discordIdB>) { return this.s.setDiscordId(a, id, b.discordId); }
  @Post('grants/:id/external-done') @HttpCode(200) @RequirePermission('radiowhitelist.grant')
  externalDone(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.markExternalDone(a, id); }
  @Post('grants/:id/suspend') @HttpCode(200) @RequirePermission('radiowhitelist.suspend')
  suspend(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(suspendB)) b: Z<typeof suspendB>) { return this.s.suspend(a, id, b); }
  @Post('grants/:id/unsuspend') @HttpCode(200) @RequirePermission('radiowhitelist.suspend')
  unsuspend(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(unsuspendB)) b: Z<typeof unsuspendB>) { return this.s.unsuspend(a, id, b); }
  @Post('grants/:id/revoke') @HttpCode(200) @RequirePermission('radiowhitelist.remove')
  revoke(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(reasonB)) b: Z<typeof reasonB>) { return this.s.revoke(a, id, b); }

  @Get('requests') @RequirePermission('radiowhitelist.requests')
  requests(@Query(zodBody(requestsQ)) q: Z<typeof requestsQ>) { return this.s.listRequests(q); }
  @Post('requests/:id/decision') @HttpCode(200) @RequirePermission('radiowhitelist.requests')
  decide(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(decideB)) b: Z<typeof decideB>) { return this.s.decide(a, id, b); }

  @Get('config') @RequirePermission('radiowhitelist.view')
  config() { return this.s.config(); }
  @Put('config/roles') @RequirePermission('radiowhitelist.roles')
  roles(@CurrentActor() a: Actor, @Body(zodBody(rolesB)) b: Z<typeof rolesB>) { return this.s.updateRoleConfig(a, b); }
  @Put('config/requests') @RequirePermission('radiowhitelist.requests')
  requestConfig(@CurrentActor() a: Actor, @Body(zodBody(requestsB)) b: Z<typeof requestsB>) { return this.s.updateRequestConfig(a, b); }
  @Post('request-panel') @HttpCode(202) @RequirePermission('radiowhitelist.requests')
  requestPanel(@CurrentActor() a: Actor) { return this.s.postRequestPanel(a); }
  @Get('role-sync') @RequirePermission('radiowhitelist.view')
  roleSyncStatus() { return this.s.roleSyncStatus(); }
  @Post('role-sync/run') @HttpCode(202) @RequirePermission('radiowhitelist.roles')
  roleSync(@CurrentActor() a: Actor) { return this.s.requestRoleSync(a); }

  @Get('integration') @RequirePermission('radiowhitelist.view')
  integration() { return this.s.integration(); }
  @Put('integration') @RequirePermission('radiowhitelist.integration')
  saveIntegration(@CurrentActor() a: Actor, @Body(zodBody(integrationB)) b: Z<typeof integrationB>) { return this.s.updateIntegration(a, b); }
  @Post('integration/test') @HttpCode(200) @RequirePermission('radiowhitelist.integration')
  test(@CurrentActor() a: Actor) { return this.s.testConnection(a); }
  @Post('integration/sync') @HttpCode(200) @RequirePermission('radiowhitelist.integration')
  sync(@CurrentActor() a: Actor) { return this.s.runSync(a); }

  @Get('export') @RequirePermission('radiowhitelist.view')
  async export(@Query(zodBody(exportQ)) q: Z<typeof exportQ>, @Res() res: Response) {
    const csv = await this.s.exportCsv(q.status);
    res.type('text/csv; charset=utf-8').setHeader('content-disposition', `attachment; filename="funk-whitelist-${new Date().toISOString().slice(0, 10)}.csv"`).send(csv);
  }
  @Post('import') @HttpCode(200) @RequirePermission('radiowhitelist.grant')
  import(@CurrentActor() a: Actor, @Body(zodBody(importB)) b: Z<typeof importB>) { return this.s.importCsv(a, b.csv, b.dryRun); }

  @Get('logs') @RequirePermission('radiowhitelist.logs')
  logs(@Query(zodBody(logsQ)) q: Z<typeof logsQ>) { return this.s.logs(q); }

  // ---- bisherige Schnittstelle (Bot-Befehl /funkfreigabe, Altversionen) ----
  @Get() @RequirePermission('radiowhitelist.view')
  legacyList() { return this.s.legacyList(); }
  /** Nur Ja/Nein für eine Person (wie bisher für das ganze Team). */
  @Get('check') @RequirePermission('team.view')
  check(@Query(zodBody(target)) q: Z<typeof target>) { return this.s.legacyCheck(q); }
  @Post() @HttpCode(200) @RequirePermission('radiowhitelist.grant')
  add(@CurrentActor() a: Actor, @Body(zodBody(target)) b: Z<typeof target>) { return this.s.legacyAdd(a, b); }
  @Post('remove') @HttpCode(200) @RequirePermission('radiowhitelist.remove')
  remove(@CurrentActor() a: Actor, @Body(zodBody(target)) b: Z<typeof target>) { return this.s.legacyRemove(a, b); }
}

const botRequestB = z.object({ guildId: snowflake.nullable(), discordId: snowflake, discordName: optText(100), rank: optText(80), department: optText(80), reason: text(1000).min(3, 'Bitte begründe deinen Antrag.'), answers: z.record(z.string().regex(/^[a-z0-9_]{1,30}$/), z.string().max(1000)).optional() });
const snapshotB = z.object({ guildId: snowflake, full: z.boolean().default(false), members: z.array(z.object({ discordId: snowflake, name: optText(100), roleIds: z.array(snowflake).max(250).nullable() })).max(1000) });

/** Bot-Dienst (nur mit Bot-Token): Anträge aus Discord, Rollenstände für den Abgleich, Status für das Mitglied. */
@ApiTags('bot')
@Controller('bot/radio-whitelist')
@BotService()
export class RadioWhitelistBotController {
  constructor(private readonly s: RadioWhitelistService) {}
  @Post('requests')
  request(@Body(zodBody(botRequestB)) b: Z<typeof botRequestB>) { return this.s.createRequest(b); }
  @Get('status/:discordId')
  status(@Param('discordId') id: string) {
    if (!/^\d{15,25}$/.test(id)) throw new AppError('VALIDATION_FAILED', 'Ungültige Discord-ID.');
    return this.s.memberStatus(id);
  }
  @Get('sync-targets')
  targets() { return this.s.syncTargets(); }
  @Post('roles') @HttpCode(200)
  roles(@Body(zodBody(snapshotB)) b: Z<typeof snapshotB>) { return this.s.applyRoleSnapshot(b.guildId, b.members, b.full); }
}
