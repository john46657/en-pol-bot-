import { Body, Controller, createParamDecorator, Delete, ExecutionContext, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CAD_LINK_ACTIONS, CAD_LINK_SEND_TYPES } from '@enrp/shared';
import { CurrentActor, Public, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { AppError } from '../common/errors';
import { currentGuild } from '../common/guild-context';
import type { AppRequest } from '../common/request-context';
import { PermissionService } from '../authz/permission.service';
import { MediaService } from '../media/media.service';
import { CadService, type CadActor } from './cad.service';
import { CadConfigService, cadConfigSchema } from './cad-config.service';
import { ErlcService, erlcServerInput } from './erlc.service';
import { ErlcSyncService } from './erlc-sync.service';
import { fetchMapImage, imageSize } from './map-image';

const MAP_MAX_BYTES = 40 * 1024 * 1024;
const sf = z.string().regex(/^\d{15,25}$/);
const isBot = (r: AppRequest) => typeof r.headers.authorization === 'string' && r.headers.authorization.startsWith('Bot ');
/** Akteur inkl. Discord-Server der Anfrage und – nur vom Bot – Discord-ID/Rollen des Aufrufers. */
const Cad = createParamDecorator((_d: unknown, ctx: ExecutionContext): CadActor & { roles: string[] } => {
  const r = ctx.switchToHttp().getRequest<AppRequest>();
  const bot = isBot(r);
  const discordId = bot && typeof r.headers['x-discord-user'] === 'string' ? r.headers['x-discord-user'] : null;
  const roles = bot && typeof r.headers['x-discord-roles'] === 'string' ? r.headers['x-discord-roles'].split(',').filter((x) => /^\d{15,25}$/.test(x)).slice(0, 100) : [];
  return { userId: r.user?.id ?? null, robloxUserId: r.user?.robloxUserId ?? null, requestId: r.requestId, guildId: currentGuild(), discordId, roles };
});

const opt = (s: z.ZodTypeAny) => s.nullish();
const text = (max: number) => z.string().trim().max(max);
const coord = z.number().finite().min(-100000).max(100000);
const incidentBody = z.object({
  title: z.string().trim().min(2).max(200), type: opt(text(32)), keyword: opt(text(80)), priority: z.string().max(32).optional(), status: z.string().max(32).optional(),
  location: opt(text(200)), description: opt(text(5000)), involved: opt(text(2000)), requiredUnits: opt(text(500)), internalNotes: opt(text(5000)),
  mapX: opt(coord), mapZ: opt(coord), dispatcherId: opt(z.string().uuid()), restrictRoleIds: z.array(z.string().uuid()).max(20).optional(),
});
const unitBody = z.object({
  callsign: z.string().trim().min(2).max(16).regex(/^[A-Za-z0-9-_ ]+$/), name: opt(text(60)), type: opt(text(32)), color: opt(z.string().regex(/^#[0-9a-fA-F]{6}$/)), icon: opt(text(16)),
  status: z.string().max(32).optional(), discordRoleId: opt(sf), guildId: opt(sf), erlcTeam: opt(text(40)), operational: z.boolean().optional(), vehicle: opt(text(64)), notes: opt(text(1000)),
  mapX: opt(coord), mapZ: opt(coord), statusRoleIds: z.array(sf).max(20).optional(),
});
const memberBody = z.object({
  userId: opt(z.string().uuid()), discordId: opt(sf), discordName: opt(text(64)), robloxName: opt(text(40)), robloxId: opt(z.string().regex(/^\d{1,20}$/)), erlcName: opt(text(40)),
  team: opt(text(40)), unitId: opt(z.string().uuid()), zelloName: opt(text(64)), callsign: opt(text(24)), department: opt(text(60)), rank: opt(text(60)),
  extra: z.record(z.string().max(32), z.union([z.string().max(200), z.number()])).nullish(),
});
const mapObjectBody = z.object({
  kind: z.enum(['POI', 'ZONE']), name: z.string().trim().min(1).max(80), description: opt(text(1000)), category: opt(text(40)), layer: z.string().max(32),
  icon: opt(text(16)), color: opt(z.string().regex(/^#[0-9a-fA-F]{6}$/)), x: opt(coord), z: opt(coord), points: z.array(z.tuple([coord, coord])).max(200).nullish(),
  roleIds: z.array(z.string().uuid()).max(30).optional(), incidentType: opt(text(32)), autoAction: opt(z.enum(['notify', 'warn'])),
});
const linkBody = z.object({
  name: z.string().trim().min(2).max(80), sourceGuildId: sf, targetGuildId: sf, active: z.boolean().optional(),
  sendTypes: z.array(z.enum(CAD_LINK_SEND_TYPES)).max(CAD_LINK_SEND_TYPES.length).optional(), allowActions: z.array(z.enum(CAD_LINK_ACTIONS)).max(CAD_LINK_ACTIONS.length).optional(),
  roleIds: z.array(sf).max(30).optional(), channels: z.record(z.enum(CAD_LINK_SEND_TYPES), z.array(sf).max(10)).optional(), notify: z.boolean().optional(),
});
const listQ = z.object({ active: z.enum(['true', 'false']).optional(), q: z.string().max(80).optional(), take: z.coerce.number().int().min(1).max(300).optional() });
const statusBody = z.object({ status: z.string().min(1).max(32), note: z.string().trim().max(500).optional() });
const radioBody = z.object({ text: z.string().trim().min(1).max(500), unitId: opt(z.string().uuid()), incidentId: opt(z.string().uuid()), incidentNumber: opt(text(32)), callsign: opt(text(24)) });

@ApiTags('cad')
@Controller('cad')
export class CadController {
  constructor(private readonly s: CadService, private readonly cfg: CadConfigService, private readonly perms: PermissionService, private readonly media: MediaService) {}

  // Konfiguration
  @Get('config') @RequirePermission('cad.view')
  config() { return this.cfg.get(); }
  @Put('config') @RequirePermission('cad.manage_settings')
  saveConfig(@CurrentActor() a: Actor, @Body(zodBody(cadConfigSchema.omit({ map: true }).partial())) b: Record<string, unknown>) { return this.cfg.save(a, b); }
  @Put('config/map') @RequirePermission('cad.manage_map')
  saveMap(@CurrentActor() a: Actor, @Body(zodBody(cadConfigSchema.shape.map.partial())) b: Record<string, unknown>) { return this.cfg.save(a, { map: b as never }); }
  /** Kartenbild hochladen (ER:LC-Karte, bis 40 MB) – wird danach als Kartenhintergrund gesetzt. */
  @Post('map/image') @RequirePermission('cad.manage_map') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAP_MAX_BYTES, files: 1 } }))
  async mapImage(@CurrentActor() a: Actor, @UploadedFile() file: Express.Multer.File | undefined, @Body(zodBody(z.object({ width: z.coerce.number().int().min(100).max(20000).optional(), height: z.coerce.number().int().min(100).max(20000).optional() }))) b: { width?: number; height?: number }) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.mimetype)) throw new AppError('VALIDATION_FAILED', 'Bitte ein Bild (PNG, JPG oder WebP) hochladen.');
    const m = await this.media.upload(a, file, { linkedType: 'CadMap', linkedId: 'map' }, MAP_MAX_BYTES);
    return this.cfg.save(a, { map: { imageUrl: `/api/v1/media/${m.id}`, ...(b.width ? { width: b.width, originX: b.width / 2 } : {}), ...(b.height ? { height: b.height, originY: b.height / 2 } : {}) } as never });
  }
  /** Kartenbild von einer https-Adresse übernehmen: der Server lädt es herunter und speichert es wie einen Upload (fremde Bild-Server blockiert die Sicherheitsrichtlinie). */
  @Post('map/image-url') @RequirePermission('cad.manage_map')
  async mapImageUrl(@CurrentActor() a: Actor, @Body(zodBody(z.object({ url: z.string().trim().url().max(500) }))) b: { url: string }) {
    const file = await fetchMapImage(b.url, MAP_MAX_BYTES);
    const dims = imageSize(file.buffer);
    const m = await this.media.upload(a, file, { linkedType: 'CadMap', linkedId: 'map' }, MAP_MAX_BYTES);
    return this.cfg.save(a, { map: { imageUrl: `/api/v1/media/${m.id}`, ...(dims ? { width: dims.width, height: dims.height, originX: dims.width / 2, originY: dims.height / 2 } : {}) } as never });
  }

  @Get('overview') @RequirePermission('cad.view')
  overview(@Cad() a: CadActor) { return this.s.overview(a); }
  @Get('map') @RequirePermission('cad.view')
  map(@Cad() a: CadActor) { return this.s.mapData(a); }

  // Einsätze
  @Get('incidents') @RequirePermission('cad.view')
  async incidents(@Cad() a: CadActor & { roles: string[] }, @Query(zodBody(listQ)) q: z.infer<typeof listQ>) { await this.s.assertCrossServer(a, 'view_incidents', a.roles); return this.s.listIncidents({ active: q.active === 'true', q: q.q, take: q.take }, a); }
  @Get('incidents/:id') @RequirePermission('cad.view')
  async incident(@Cad() a: CadActor & { roles: string[] }, @Param('id', ParseUUIDPipe) id: string) { await this.s.assertCrossServer(a, 'view_incidents', a.roles); return this.s.getIncident(id, a); }
  @Post('incidents') @RequirePermission('cad.create_incident')
  createIncident(@Cad() a: CadActor, @Body(zodBody(incidentBody)) b: z.infer<typeof incidentBody>) { return this.s.createIncident(a, b); }
  @Patch('incidents/:id') @RequirePermission('cad.edit_incident')
  updateIncident(@Cad() a: CadActor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(incidentBody.partial())) b: Partial<z.infer<typeof incidentBody>>) { return this.s.updateIncident(a, id, b); }
  @Post('incidents/:id/status') @HttpCode(200) @RequirePermission('cad.edit_incident')
  async status(@Cad() a: CadActor & { roles: string[] }, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(statusBody)) b: z.infer<typeof statusBody>) { await this.s.assertCrossServer(a, 'dispatch', a.roles); return this.s.setStatus(a, id, b.status, b.note); }
  @Post('incidents/:id/notes') @HttpCode(204) @RequirePermission('cad.edit_incident')
  note(@Cad() a: CadActor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ text: z.string().trim().min(1).max(2000) }))) b: { text: string }) { return this.s.addNote(a, id, b.text); }
  @Post('incidents/:id/units') @HttpCode(200) @RequirePermission('cad.assign_unit')
  async assign(@Cad() a: CadActor & { roles: string[] }, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ unitId: z.string().uuid() }))) b: { unitId: string }) { await this.s.assertCrossServer(a, 'dispatch', a.roles); return this.s.assignUnit(a, id, b.unitId); }
  @Delete('incidents/:id/units/:unitId') @HttpCode(204) @RequirePermission('cad.assign_unit')
  clear(@Cad() a: CadActor, @Param('id', ParseUUIDPipe) id: string, @Param('unitId', ParseUUIDPipe) unitId: string) { return this.s.clearUnit(a, id, unitId); }

  // Einheiten
  @Get('units') @RequirePermission('cad.view')
  async units(@Cad() a: CadActor & { roles: string[] }) { await this.s.assertCrossServer(a, 'view_incidents', a.roles); return this.s.listUnits(); }
  @Post('units') @RequirePermission('cad.manage_units')
  createUnit(@Cad() a: CadActor, @Body(zodBody(unitBody)) b: z.infer<typeof unitBody>) { return this.s.createUnit(a, b); }
  @Patch('units/:id') @RequirePermission('cad.manage_units')
  updateUnit(@Cad() a: CadActor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(unitBody.partial())) b: Partial<z.infer<typeof unitBody>>) { return this.s.updateUnit(a, id, b); }
  @Delete('units/:id') @HttpCode(204) @RequirePermission('cad.manage_units')
  deleteUnit(@Cad() a: CadActor, @Param('id', ParseUUIDPipe) id: string) { return this.s.deleteUnit(a, id); }
  /** Leitstelle oder die Besatzung selbst (auch vom verbundenen SEK/K9-Server, falls freigegeben). */
  @Post('units/:id/status') @HttpCode(200) @RequirePermission('cad.view')
  unitStatus(@Cad() a: CadActor & { roles: string[] }, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ status: z.string().min(1).max(32) }))) b: { status: string }) { return this.s.setUnitStatus(a, id, b.status, a.roles); }

  // Notrufe
  @Get('calls') @RequirePermission('cad.view')
  async calls(@Cad() a: CadActor & { roles: string[] }, @Query(zodBody(z.object({ status: z.enum(['OPEN', 'CLAIMED', 'CLOSED', 'ALL']).optional() }))) q: { status?: string }) { await this.s.assertCrossServer(a, 'view_incidents', a.roles); return this.s.listCalls({ status: q.status ?? 'ALL' }); }
  @Post('calls/:id/:action') @HttpCode(200) @RequirePermission('cad.view')
  async callAction(@Cad() a: CadActor & { roles: string[] }, @Param('id', ParseUUIDPipe) id: string, @Param('action') action: string, @Body() body: unknown) {
    await this.s.assertCrossServer(a, 'dispatch', a.roles);
    const need = (p: string) => this.perms.assert(a.userId!, p);
    if (action === 'claim' || action === 'close' || action === 'reopen') { await need('cad.edit_incident'); return this.s.callAction(a, id, action); }
    if (action === 'incident') { await need('cad.create_incident'); return this.s.incidentFromCall(a, id, zodBody(incidentBody.partial()).transform(body ?? {})); }
    if (action === 'assign') { await need('cad.assign_unit'); return this.s.assignToCall(a, id, zodBody(z.object({ unitId: z.string().uuid() })).transform(body).unitId); }
    throw new AppError('NOT_FOUND', 'Unbekannte Aktion.');
  }

  // Funk
  @Get('radio') @RequirePermission('cad.view')
  radio(@Query(zodBody(z.object({ incidentId: z.string().uuid().optional(), take: z.coerce.number().int().min(1).max(200).optional() }))) q: { incidentId?: string; take?: number }) { return this.s.listRadio(q); }
  /** Einheiten, als die man funken darf (Leitstelle: alle; sonst nur die eigene). */
  @Get('radio/units') @RequirePermission('cad.radio')
  radioUnits(@Cad() a: CadActor) { return this.s.radioUnits(a); }
  @Post('radio') @RequirePermission('cad.radio')
  sendRadio(@Cad() a: CadActor & { roles: string[] }, @Body(zodBody(radioBody)) b: z.infer<typeof radioBody>) { return this.s.sendRadio(a, b, a.roles); }
  @Post('announcements') @RequirePermission('cad.create_incident')
  announce(@Cad() a: CadActor, @Body(zodBody(z.object({ text: z.string().trim().min(3).max(1500) }))) b: { text: string }) { return this.s.announce(a, b.text); }

  // Zuordnungen (Teamübersicht)
  @Get('members') @RequirePermission('cad.view')
  members() { return this.s.listMembers(); }
  @Post('members') @RequirePermission('cad.manage_units')
  createMember(@Cad() a: CadActor, @Body(zodBody(memberBody)) b: z.infer<typeof memberBody>) { return this.s.saveMember(a, null, b); }
  @Patch('members/:id') @RequirePermission('cad.manage_units')
  updateMember(@Cad() a: CadActor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(memberBody.partial())) b: Partial<z.infer<typeof memberBody>>) { return this.s.saveMember(a, id, b); }
  @Delete('members/:id') @HttpCode(204) @RequirePermission('cad.manage_units')
  deleteMember(@Cad() a: CadActor, @Param('id', ParseUUIDPipe) id: string) { return this.s.deleteMember(a, id); }

  // Karte
  @Get('map/objects') @RequirePermission('cad.view')
  objects(@Cad() a: CadActor) { return this.s.listMapObjects(a); }
  @Post('map/objects') @RequirePermission('cad.manage_map')
  createObject(@Cad() a: CadActor, @Body(zodBody(mapObjectBody)) b: z.infer<typeof mapObjectBody>) { return this.s.saveMapObject(a, null, b); }
  @Patch('map/objects/:id') @RequirePermission('cad.manage_map')
  updateObject(@Cad() a: CadActor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(mapObjectBody.partial())) b: Partial<z.infer<typeof mapObjectBody>>) { return this.s.saveMapObject(a, id, b); }
  @Delete('map/objects/:id') @HttpCode(204) @RequirePermission('cad.manage_map')
  deleteObject(@Cad() a: CadActor, @Param('id', ParseUUIDPipe) id: string) { return this.s.deleteMapObject(a, id); }

  // Server-Verbindungen
  @Get('links') @RequirePermission('cad.view')
  links() { return this.s.listLinks(); }
  @Post('links') @RequirePermission('cad.manage_cross_server')
  createLink(@Cad() a: CadActor, @Body(zodBody(linkBody)) b: z.infer<typeof linkBody>) { return this.s.saveLink(a, null, b); }
  @Patch('links/:id') @RequirePermission('cad.manage_cross_server')
  updateLink(@Cad() a: CadActor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(linkBody.partial())) b: Partial<z.infer<typeof linkBody>>) { return this.s.saveLink(a, id, b); }
  @Delete('links/:id') @HttpCode(204) @RequirePermission('cad.manage_cross_server')
  deleteLink(@Cad() a: CadActor, @Param('id', ParseUUIDPipe) id: string) { return this.s.deleteLink(a, id); }

  @Get('logs') @RequirePermission('cad.view_logs')
  logs() { return this.s.logs(); }
}

const commandBody = z.object({ command: z.string().trim().min(2).max(500), confirm: z.boolean().optional() });

@ApiTags('erlc')
@Controller('erlc')
export class ErlcController {
  constructor(private readonly s: ErlcService, private readonly perms: PermissionService, private readonly records: ErlcSyncService) {}
  /** Personen-/Fahrzeugseite: wer bzw. was gerade im Spiel ist (aus der ER:LC-API), mit Link zur Akte. */
  @Get('live/persons') @RequirePermission('persons.view') livePersons() { return this.records.live('persons', currentGuild()); }
  @Get('live/vehicles') @RequirePermission('vehicles.view') liveVehicles() { return this.records.live('vehicles', currentGuild()); }
  @Get('servers') @RequirePermission('cad.view_erlc')
  async list(@CurrentActor() a: Actor) { return this.s.list(await this.perms.has(a.userId!, 'cad.manage_erlc')); }
  @Post('servers') @RequirePermission('cad.manage_erlc')
  create(@CurrentActor() a: Actor, @Body(zodBody(erlcServerInput)) b: z.infer<typeof erlcServerInput>) { return this.s.create(a, b); }
  @Patch('servers/:id') @RequirePermission('cad.manage_erlc')
  update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(erlcServerInput.partial())) b: Partial<z.infer<typeof erlcServerInput>>) { return this.s.update(a, id, b); }
  @Delete('servers/:id') @HttpCode(204) @RequirePermission('cad.manage_erlc')
  remove(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.remove(a, id); }
  @Post('servers/:id/test') @HttpCode(200) @RequirePermission('cad.manage_erlc')
  test(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.reconnect(a, id, 'test'); }
  @Post('servers/:id/reconnect') @HttpCode(200) @RequirePermission('cad.manage_erlc')
  reconnect(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.reconnect(a, id, 'reconnect'); }
  @Get('servers/:id/live') @RequirePermission('cad.view_erlc')
  live(@Param('id', ParseUUIDPipe) id: string) { return this.s.live(id); }
  @Post('servers/:id/command') @HttpCode(200) @RequirePermission('cad.erlc_command')
  command(@Cad() a: CadActor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(commandBody)) b: z.infer<typeof commandBody>) { return this.s.runCommand(a, id, b.command, !!b.confirm); }
  @Get('servers/:id/commands') @RequirePermission('cad.view_logs')
  commands(@Param('id', ParseUUIDPipe) id: string) { return this.s.commandLog(id); }

  /** Event-Webhook von ER:LC (öffentlich, aber nur mit gültiger Ed25519-Signatur von PRC). */
  @Post('webhook/:id/:token') @Public() @HttpCode(200)
  webhook(@Param('id', ParseUUIDPipe) id: string, @Param('token') token: string, @Req() req: AppRequest & { rawBody?: Buffer }, @Headers('x-signature-timestamp') ts?: string, @Headers('x-signature-ed25519') sig?: string) {
    return this.s.webhook(id, token, req.rawBody, ts, sig);
  }
}
