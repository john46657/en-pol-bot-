"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErlcController = exports.CadController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const errors_1 = require("../common/errors");
const guild_context_1 = require("../common/guild-context");
const permission_service_1 = require("../authz/permission.service");
const media_service_1 = require("../media/media.service");
const cad_service_1 = require("./cad.service");
const cad_config_service_1 = require("./cad-config.service");
const erlc_service_1 = require("./erlc.service");
const erlc_sync_service_1 = require("./erlc-sync.service");
const MAP_MAX_BYTES = 40 * 1024 * 1024;
const sf = zod_1.z.string().regex(/^\d{15,25}$/);
const isBot = (r) => typeof r.headers.authorization === 'string' && r.headers.authorization.startsWith('Bot ');
/** Akteur inkl. Discord-Server der Anfrage und – nur vom Bot – Discord-ID/Rollen des Aufrufers. */
const Cad = (0, common_1.createParamDecorator)((_d, ctx) => {
    const r = ctx.switchToHttp().getRequest();
    const bot = isBot(r);
    const discordId = bot && typeof r.headers['x-discord-user'] === 'string' ? r.headers['x-discord-user'] : null;
    const roles = bot && typeof r.headers['x-discord-roles'] === 'string' ? r.headers['x-discord-roles'].split(',').filter((x) => /^\d{15,25}$/.test(x)).slice(0, 100) : [];
    return { userId: r.user?.id ?? null, robloxUserId: r.user?.robloxUserId ?? null, requestId: r.requestId, guildId: (0, guild_context_1.currentGuild)(), discordId, roles };
});
const opt = (s) => s.nullish();
const text = (max) => zod_1.z.string().trim().max(max);
const coord = zod_1.z.number().finite().min(-100000).max(100000);
const incidentBody = zod_1.z.object({
    title: zod_1.z.string().trim().min(2).max(200), type: opt(text(32)), keyword: opt(text(80)), priority: zod_1.z.string().max(32).optional(), status: zod_1.z.string().max(32).optional(),
    location: opt(text(200)), description: opt(text(5000)), involved: opt(text(2000)), requiredUnits: opt(text(500)), internalNotes: opt(text(5000)),
    mapX: opt(coord), mapZ: opt(coord), dispatcherId: opt(zod_1.z.string().uuid()), restrictRoleIds: zod_1.z.array(zod_1.z.string().uuid()).max(20).optional(),
});
const unitBody = zod_1.z.object({
    callsign: zod_1.z.string().trim().min(2).max(16).regex(/^[A-Za-z0-9-_ ]+$/), name: opt(text(60)), type: opt(text(32)), color: opt(zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/)), icon: opt(text(16)),
    status: zod_1.z.string().max(32).optional(), discordRoleId: opt(sf), guildId: opt(sf), erlcTeam: opt(text(40)), operational: zod_1.z.boolean().optional(), vehicle: opt(text(64)), notes: opt(text(1000)),
    mapX: opt(coord), mapZ: opt(coord), statusRoleIds: zod_1.z.array(sf).max(20).optional(),
});
const memberBody = zod_1.z.object({
    userId: opt(zod_1.z.string().uuid()), discordId: opt(sf), discordName: opt(text(64)), robloxName: opt(text(40)), robloxId: opt(zod_1.z.string().regex(/^\d{1,20}$/)), erlcName: opt(text(40)),
    team: opt(text(40)), unitId: opt(zod_1.z.string().uuid()), zelloName: opt(text(64)), callsign: opt(text(24)), department: opt(text(60)), rank: opt(text(60)),
    extra: zod_1.z.record(zod_1.z.string().max(32), zod_1.z.union([zod_1.z.string().max(200), zod_1.z.number()])).nullish(),
});
const mapObjectBody = zod_1.z.object({
    kind: zod_1.z.enum(['POI', 'ZONE']), name: zod_1.z.string().trim().min(1).max(80), description: opt(text(1000)), category: opt(text(40)), layer: zod_1.z.string().max(32),
    icon: opt(text(16)), color: opt(zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/)), x: opt(coord), z: opt(coord), points: zod_1.z.array(zod_1.z.tuple([coord, coord])).max(200).nullish(),
    roleIds: zod_1.z.array(zod_1.z.string().uuid()).max(30).optional(), incidentType: opt(text(32)), autoAction: opt(zod_1.z.enum(['notify', 'warn'])),
});
const linkBody = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(80), sourceGuildId: sf, targetGuildId: sf, active: zod_1.z.boolean().optional(),
    sendTypes: zod_1.z.array(zod_1.z.enum(shared_1.CAD_LINK_SEND_TYPES)).max(shared_1.CAD_LINK_SEND_TYPES.length).optional(), allowActions: zod_1.z.array(zod_1.z.enum(shared_1.CAD_LINK_ACTIONS)).max(shared_1.CAD_LINK_ACTIONS.length).optional(),
    roleIds: zod_1.z.array(sf).max(30).optional(), channels: zod_1.z.record(zod_1.z.enum(shared_1.CAD_LINK_SEND_TYPES), zod_1.z.array(sf).max(10)).optional(), notify: zod_1.z.boolean().optional(),
});
const listQ = zod_1.z.object({ active: zod_1.z.enum(['true', 'false']).optional(), q: zod_1.z.string().max(80).optional(), take: zod_1.z.coerce.number().int().min(1).max(300).optional() });
const statusBody = zod_1.z.object({ status: zod_1.z.string().min(1).max(32), note: zod_1.z.string().trim().max(500).optional() });
const radioBody = zod_1.z.object({ text: zod_1.z.string().trim().min(1).max(500), unitId: opt(zod_1.z.string().uuid()), incidentId: opt(zod_1.z.string().uuid()), incidentNumber: opt(text(32)), callsign: opt(text(24)) });
let CadController = class CadController {
    s;
    cfg;
    perms;
    media;
    constructor(s, cfg, perms, media) {
        this.s = s;
        this.cfg = cfg;
        this.perms = perms;
        this.media = media;
    }
    // Konfiguration
    config() { return this.cfg.get(); }
    saveConfig(a, b) { return this.cfg.save(a, b); }
    saveMap(a, b) { return this.cfg.save(a, { map: b }); }
    /** Kartenbild hochladen (ER:LC-Karte, bis 40 MB) – wird danach als Kartenhintergrund gesetzt. */
    async mapImage(a, file, b) {
        if (!file || !/^image\/(png|jpeg|webp)$/.test(file.mimetype))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Bitte ein Bild (PNG, JPG oder WebP) hochladen.');
        const m = await this.media.upload(a, file, { linkedType: 'CadMap', linkedId: 'map' }, MAP_MAX_BYTES);
        return this.cfg.save(a, { map: { imageUrl: `/api/v1/media/${m.id}`, ...(b.width ? { width: b.width, originX: b.width / 2 } : {}), ...(b.height ? { height: b.height, originY: b.height / 2 } : {}) } });
    }
    overview(a) { return this.s.overview(a); }
    map(a) { return this.s.mapData(a); }
    // Einsätze
    async incidents(a, q) { await this.s.assertCrossServer(a, 'view_incidents', a.roles); return this.s.listIncidents({ active: q.active === 'true', q: q.q, take: q.take }, a); }
    async incident(a, id) { await this.s.assertCrossServer(a, 'view_incidents', a.roles); return this.s.getIncident(id, a); }
    createIncident(a, b) { return this.s.createIncident(a, b); }
    updateIncident(a, id, b) { return this.s.updateIncident(a, id, b); }
    async status(a, id, b) { await this.s.assertCrossServer(a, 'dispatch', a.roles); return this.s.setStatus(a, id, b.status, b.note); }
    note(a, id, b) { return this.s.addNote(a, id, b.text); }
    async assign(a, id, b) { await this.s.assertCrossServer(a, 'dispatch', a.roles); return this.s.assignUnit(a, id, b.unitId); }
    clear(a, id, unitId) { return this.s.clearUnit(a, id, unitId); }
    // Einheiten
    async units(a) { await this.s.assertCrossServer(a, 'view_incidents', a.roles); return this.s.listUnits(); }
    createUnit(a, b) { return this.s.createUnit(a, b); }
    updateUnit(a, id, b) { return this.s.updateUnit(a, id, b); }
    deleteUnit(a, id) { return this.s.deleteUnit(a, id); }
    /** Leitstelle oder die Besatzung selbst (auch vom verbundenen SEK/K9-Server, falls freigegeben). */
    unitStatus(a, id, b) { return this.s.setUnitStatus(a, id, b.status, a.roles); }
    // Notrufe
    async calls(a, q) { await this.s.assertCrossServer(a, 'view_incidents', a.roles); return this.s.listCalls({ status: q.status ?? 'ALL' }); }
    async callAction(a, id, action, body) {
        await this.s.assertCrossServer(a, 'dispatch', a.roles);
        const need = (p) => this.perms.assert(a.userId, p);
        if (action === 'claim' || action === 'close' || action === 'reopen') {
            await need('cad.edit_incident');
            return this.s.callAction(a, id, action);
        }
        if (action === 'incident') {
            await need('cad.create_incident');
            return this.s.incidentFromCall(a, id, (0, zod_pipe_1.zodBody)(incidentBody.partial()).transform(body ?? {}));
        }
        if (action === 'assign') {
            await need('cad.assign_unit');
            return this.s.assignToCall(a, id, (0, zod_pipe_1.zodBody)(zod_1.z.object({ unitId: zod_1.z.string().uuid() })).transform(body).unitId);
        }
        throw new errors_1.AppError('NOT_FOUND', 'Unbekannte Aktion.');
    }
    // Funk
    radio(q) { return this.s.listRadio(q); }
    /** Einheiten, als die man funken darf (Leitstelle: alle; sonst nur die eigene). */
    radioUnits(a) { return this.s.radioUnits(a); }
    sendRadio(a, b) { return this.s.sendRadio(a, b, a.roles); }
    announce(a, b) { return this.s.announce(a, b.text); }
    // Zuordnungen (Teamübersicht)
    members() { return this.s.listMembers(); }
    createMember(a, b) { return this.s.saveMember(a, null, b); }
    updateMember(a, id, b) { return this.s.saveMember(a, id, b); }
    deleteMember(a, id) { return this.s.deleteMember(a, id); }
    // Karte
    objects(a) { return this.s.listMapObjects(a); }
    createObject(a, b) { return this.s.saveMapObject(a, null, b); }
    updateObject(a, id, b) { return this.s.saveMapObject(a, id, b); }
    deleteObject(a, id) { return this.s.deleteMapObject(a, id); }
    // Server-Verbindungen
    links() { return this.s.listLinks(); }
    createLink(a, b) { return this.s.saveLink(a, null, b); }
    updateLink(a, id, b) { return this.s.saveLink(a, id, b); }
    deleteLink(a, id) { return this.s.deleteLink(a, id); }
    logs() { return this.s.logs(); }
};
exports.CadController = CadController;
__decorate([
    (0, common_1.Get)('config'),
    (0, decorators_1.RequirePermission)('cad.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CadController.prototype, "config", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, decorators_1.RequirePermission)('cad.manage_settings'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(cad_config_service_1.cadConfigSchema.omit({ map: true }).partial()))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "saveConfig", null);
__decorate([
    (0, common_1.Put)('config/map'),
    (0, decorators_1.RequirePermission)('cad.manage_map'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(cad_config_service_1.cadConfigSchema.shape.map.partial()))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "saveMap", null);
__decorate([
    (0, common_1.Post)('map/image'),
    (0, decorators_1.RequirePermission)('cad.manage_map'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { limits: { fileSize: MAP_MAX_BYTES, files: 1 } })),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ width: zod_1.z.coerce.number().int().min(100).max(20000).optional(), height: zod_1.z.coerce.number().int().min(100).max(20000).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], CadController.prototype, "mapImage", null);
__decorate([
    (0, common_1.Get)('overview'),
    (0, decorators_1.RequirePermission)('cad.view'),
    __param(0, Cad()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "overview", null);
__decorate([
    (0, common_1.Get)('map'),
    (0, decorators_1.RequirePermission)('cad.view'),
    __param(0, Cad()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "map", null);
__decorate([
    (0, common_1.Get)('incidents'),
    (0, decorators_1.RequirePermission)('cad.view'),
    __param(0, Cad()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", Promise)
], CadController.prototype, "incidents", null);
__decorate([
    (0, common_1.Get)('incidents/:id'),
    (0, decorators_1.RequirePermission)('cad.view'),
    __param(0, Cad()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CadController.prototype, "incident", null);
__decorate([
    (0, common_1.Post)('incidents'),
    (0, decorators_1.RequirePermission)('cad.create_incident'),
    __param(0, Cad()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(incidentBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "createIncident", null);
__decorate([
    (0, common_1.Patch)('incidents/:id'),
    (0, decorators_1.RequirePermission)('cad.edit_incident'),
    __param(0, Cad()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(incidentBody.partial()))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "updateIncident", null);
__decorate([
    (0, common_1.Post)('incidents/:id/status'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('cad.edit_incident'),
    __param(0, Cad()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(statusBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", Promise)
], CadController.prototype, "status", null);
__decorate([
    (0, common_1.Post)('incidents/:id/notes'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('cad.edit_incident'),
    __param(0, Cad()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ text: zod_1.z.string().trim().min(1).max(2000) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "note", null);
__decorate([
    (0, common_1.Post)('incidents/:id/units'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('cad.assign_unit'),
    __param(0, Cad()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ unitId: zod_1.z.string().uuid() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], CadController.prototype, "assign", null);
__decorate([
    (0, common_1.Delete)('incidents/:id/units/:unitId'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('cad.assign_unit'),
    __param(0, Cad()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('unitId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "clear", null);
__decorate([
    (0, common_1.Get)('units'),
    (0, decorators_1.RequirePermission)('cad.view'),
    __param(0, Cad()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CadController.prototype, "units", null);
__decorate([
    (0, common_1.Post)('units'),
    (0, decorators_1.RequirePermission)('cad.manage_units'),
    __param(0, Cad()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(unitBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "createUnit", null);
__decorate([
    (0, common_1.Patch)('units/:id'),
    (0, decorators_1.RequirePermission)('cad.manage_units'),
    __param(0, Cad()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(unitBody.partial()))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "updateUnit", null);
__decorate([
    (0, common_1.Delete)('units/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('cad.manage_units'),
    __param(0, Cad()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "deleteUnit", null);
__decorate([
    (0, common_1.Post)('units/:id/status'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('cad.view'),
    __param(0, Cad()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ status: zod_1.z.string().min(1).max(32) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "unitStatus", null);
__decorate([
    (0, common_1.Get)('calls'),
    (0, decorators_1.RequirePermission)('cad.view'),
    __param(0, Cad()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ status: zod_1.z.enum(['OPEN', 'CLAIMED', 'CLOSED', 'ALL']).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CadController.prototype, "calls", null);
__decorate([
    (0, common_1.Post)('calls/:id/:action'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('cad.view'),
    __param(0, Cad()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('action')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], CadController.prototype, "callAction", null);
__decorate([
    (0, common_1.Get)('radio'),
    (0, decorators_1.RequirePermission)('cad.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ incidentId: zod_1.z.string().uuid().optional(), take: zod_1.z.coerce.number().int().min(1).max(200).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "radio", null);
__decorate([
    (0, common_1.Get)('radio/units'),
    (0, decorators_1.RequirePermission)('cad.radio'),
    __param(0, Cad()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "radioUnits", null);
__decorate([
    (0, common_1.Post)('radio'),
    (0, decorators_1.RequirePermission)('cad.radio'),
    __param(0, Cad()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(radioBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "sendRadio", null);
__decorate([
    (0, common_1.Post)('announcements'),
    (0, decorators_1.RequirePermission)('cad.create_incident'),
    __param(0, Cad()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ text: zod_1.z.string().trim().min(3).max(1500) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "announce", null);
__decorate([
    (0, common_1.Get)('members'),
    (0, decorators_1.RequirePermission)('cad.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CadController.prototype, "members", null);
__decorate([
    (0, common_1.Post)('members'),
    (0, decorators_1.RequirePermission)('cad.manage_units'),
    __param(0, Cad()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(memberBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "createMember", null);
__decorate([
    (0, common_1.Patch)('members/:id'),
    (0, decorators_1.RequirePermission)('cad.manage_units'),
    __param(0, Cad()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(memberBody.partial()))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "updateMember", null);
__decorate([
    (0, common_1.Delete)('members/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('cad.manage_units'),
    __param(0, Cad()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "deleteMember", null);
__decorate([
    (0, common_1.Get)('map/objects'),
    (0, decorators_1.RequirePermission)('cad.view'),
    __param(0, Cad()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "objects", null);
__decorate([
    (0, common_1.Post)('map/objects'),
    (0, decorators_1.RequirePermission)('cad.manage_map'),
    __param(0, Cad()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(mapObjectBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "createObject", null);
__decorate([
    (0, common_1.Patch)('map/objects/:id'),
    (0, decorators_1.RequirePermission)('cad.manage_map'),
    __param(0, Cad()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(mapObjectBody.partial()))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "updateObject", null);
__decorate([
    (0, common_1.Delete)('map/objects/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('cad.manage_map'),
    __param(0, Cad()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "deleteObject", null);
__decorate([
    (0, common_1.Get)('links'),
    (0, decorators_1.RequirePermission)('cad.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CadController.prototype, "links", null);
__decorate([
    (0, common_1.Post)('links'),
    (0, decorators_1.RequirePermission)('cad.manage_cross_server'),
    __param(0, Cad()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(linkBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "createLink", null);
__decorate([
    (0, common_1.Patch)('links/:id'),
    (0, decorators_1.RequirePermission)('cad.manage_cross_server'),
    __param(0, Cad()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(linkBody.partial()))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "updateLink", null);
__decorate([
    (0, common_1.Delete)('links/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('cad.manage_cross_server'),
    __param(0, Cad()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CadController.prototype, "deleteLink", null);
__decorate([
    (0, common_1.Get)('logs'),
    (0, decorators_1.RequirePermission)('cad.view_logs'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CadController.prototype, "logs", null);
exports.CadController = CadController = __decorate([
    (0, swagger_1.ApiTags)('cad'),
    (0, common_1.Controller)('cad'),
    __metadata("design:paramtypes", [cad_service_1.CadService, cad_config_service_1.CadConfigService, permission_service_1.PermissionService, media_service_1.MediaService])
], CadController);
const commandBody = zod_1.z.object({ command: zod_1.z.string().trim().min(2).max(500), confirm: zod_1.z.boolean().optional() });
let ErlcController = class ErlcController {
    s;
    perms;
    records;
    constructor(s, perms, records) {
        this.s = s;
        this.perms = perms;
        this.records = records;
    }
    /** Personen-/Fahrzeugseite: wer bzw. was gerade im Spiel ist (aus der ER:LC-API), mit Link zur Akte. */
    livePersons() { return this.records.live('persons', (0, guild_context_1.currentGuild)()); }
    liveVehicles() { return this.records.live('vehicles', (0, guild_context_1.currentGuild)()); }
    async list(a) { return this.s.list(await this.perms.has(a.userId, 'cad.manage_erlc')); }
    create(a, b) { return this.s.create(a, b); }
    update(a, id, b) { return this.s.update(a, id, b); }
    remove(a, id) { return this.s.remove(a, id); }
    test(a, id) { return this.s.reconnect(a, id, 'test'); }
    reconnect(a, id) { return this.s.reconnect(a, id, 'reconnect'); }
    live(id) { return this.s.live(id); }
    command(a, id, b) { return this.s.runCommand(a, id, b.command, !!b.confirm); }
    commands(id) { return this.s.commandLog(id); }
    /** Event-Webhook von ER:LC (öffentlich, aber nur mit gültiger Ed25519-Signatur von PRC). */
    webhook(id, token, req, ts, sig) {
        return this.s.webhook(id, token, req.rawBody, ts, sig);
    }
};
exports.ErlcController = ErlcController;
__decorate([
    (0, common_1.Get)('live/persons'),
    (0, decorators_1.RequirePermission)('persons.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ErlcController.prototype, "livePersons", null);
__decorate([
    (0, common_1.Get)('live/vehicles'),
    (0, decorators_1.RequirePermission)('vehicles.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ErlcController.prototype, "liveVehicles", null);
__decorate([
    (0, common_1.Get)('servers'),
    (0, decorators_1.RequirePermission)('cad.view_erlc'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ErlcController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('servers'),
    (0, decorators_1.RequirePermission)('cad.manage_erlc'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(erlc_service_1.erlcServerInput))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], ErlcController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)('servers/:id'),
    (0, decorators_1.RequirePermission)('cad.manage_erlc'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(erlc_service_1.erlcServerInput.partial()))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], ErlcController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)('servers/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('cad.manage_erlc'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ErlcController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('servers/:id/test'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('cad.manage_erlc'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ErlcController.prototype, "test", null);
__decorate([
    (0, common_1.Post)('servers/:id/reconnect'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('cad.manage_erlc'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ErlcController.prototype, "reconnect", null);
__decorate([
    (0, common_1.Get)('servers/:id/live'),
    (0, decorators_1.RequirePermission)('cad.view_erlc'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ErlcController.prototype, "live", null);
__decorate([
    (0, common_1.Post)('servers/:id/command'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('cad.erlc_command'),
    __param(0, Cad()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(commandBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ErlcController.prototype, "command", null);
__decorate([
    (0, common_1.Get)('servers/:id/commands'),
    (0, decorators_1.RequirePermission)('cad.view_logs'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ErlcController.prototype, "commands", null);
__decorate([
    (0, common_1.Post)('webhook/:id/:token'),
    (0, decorators_1.Public)(),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('token')),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Headers)('x-signature-timestamp')),
    __param(4, (0, common_1.Headers)('x-signature-ed25519')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, String, String]),
    __metadata("design:returntype", void 0)
], ErlcController.prototype, "webhook", null);
exports.ErlcController = ErlcController = __decorate([
    (0, swagger_1.ApiTags)('erlc'),
    (0, common_1.Controller)('erlc'),
    __metadata("design:paramtypes", [erlc_service_1.ErlcService, permission_service_1.PermissionService, erlc_sync_service_1.ErlcSyncService])
], ErlcController);
//# sourceMappingURL=cad.controller.js.map