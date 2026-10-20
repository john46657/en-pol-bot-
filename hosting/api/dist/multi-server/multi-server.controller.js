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
exports.BotServersController = exports.ServersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const pagination_1 = require("../common/pagination");
const servers_service_1 = require("./servers.service");
const sf = zod_1.z.string().regex(/^\d{15,25}$/, 'Discord-ID (15–25 Ziffern)');
const version = zod_1.z.number().int().min(0);
const name = zod_1.z.string().trim().min(1).max(80);
const createServer = zod_1.z.object({ guildId: sf, name }).strict();
const patchServer = zod_1.z.object({ name: name.optional(), status: zod_1.z.enum(['ACTIVE', 'DISABLED']).optional(), version }).strict();
const member = zod_1.z.object({ userId: zod_1.z.string().uuid(), member: zod_1.z.boolean() }).strict();
const moduleKey = zod_1.z.string().refine((k) => shared_1.MODULE_KEYS.includes(k), 'Unbekanntes Modul.');
const patchModule = zod_1.z.object({ enabled: zod_1.z.boolean().optional(), settings: zod_1.z.unknown().optional(), version }).strict();
const roleFields = { description: zod_1.z.string().max(300).nullable().optional(), color: zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(), icon: zod_1.z.string().max(40).nullable().optional(), active: zod_1.z.boolean().optional(), priority: zod_1.z.number().int().min(2).max(10_000).optional(), discordRoleIds: zod_1.z.array(sf).max(25).optional() };
const createRole = zod_1.z.object({ name: zod_1.z.string().trim().min(2).max(64), ...roleFields }).strict();
const updateRole = zod_1.z.object({ name: zod_1.z.string().trim().min(2).max(64).optional(), ...roleFields }).strict();
const grants = zod_1.z.object({ grants: zod_1.z.array(zod_1.z.object({ permission: zod_1.z.string().max(80), effect: zod_1.z.enum(['ALLOW', 'DENY']) })).max(500) }).strict();
const mappings = zod_1.z.object({ mappings: zod_1.z.array(zod_1.z.object({ discordRoleId: sf, roleId: zod_1.z.string().uuid() })).max(200) }).strict();
const auditQuery = pagination_1.pageQuery.extend({ action: zod_1.z.string().max(60).optional() });
/**
 * Server, Module, Rollen & Rechte je Server. Autorisierung im Service gegen den Server aus dem PFAD
 * (AuthorizationService: Mitgliedschaft, Modul, Recht) – Header oder Body können ihn nicht übersteuern.
 */
let ServersController = class ServersController {
    s;
    constructor(s) {
        this.s = s;
    }
    list(a) { return this.s.list(a); }
    create(a, b) { return this.s.create(a, b); }
    get(a, id) { return this.s.access(a, id, 'servers.view'); }
    patch(a, id, b) { return this.s.update(a, id, b); }
    remove(a, id) { return this.s.archive(a, id); }
    members(a, id) { return this.s.members(a, id); }
    setMember(a, id, b) { return this.s.setManualMember(a, id, b.userId, b.member); }
    modules(a, id) { return this.s.modules(a, id); }
    module(a, id, key) { return this.s.module(a, id, key); }
    patchModule(a, id, key, b) { return this.s.patchModule(a, id, key, b); }
    roles(a, id) { return this.s.listRoles(a, id); }
    createRole(a, id, b) { return this.s.createRole(a, id, b); }
    updateRole(a, id, roleId, b) { return this.s.updateRole(a, id, roleId, b); }
    async deleteRole(a, id, roleId) { await this.s.deleteRole(a, id, roleId); }
    permissions(a, id) { return this.s.permissionCatalog(a, id); }
    rolePermissions(a, id, roleId) { return this.s.rolePermissions(a, id, roleId); }
    setRolePermissions(a, id, roleId, b) { return this.s.setRolePermissions(a, id, roleId, b.grants); }
    effective(a, id, userId) { return this.s.effective(a, id, userId); }
    roleMappings(a, id) { return this.s.roleMappings(a, id); }
    setRoleMappings(a, id, b) { return this.s.setRoleMappings(a, id, b.mappings); }
    audit(a, id, q) { return this.s.auditLogs(a, id, q); }
};
exports.ServersController = ServersController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(createServer))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':serverId'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "get", null);
__decorate([
    (0, common_1.Patch)(':serverId'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(patchServer))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "patch", null);
__decorate([
    (0, common_1.Delete)(':serverId'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)(':serverId/members'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "members", null);
__decorate([
    (0, common_1.Put)(':serverId/members'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(member))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "setMember", null);
__decorate([
    (0, common_1.Get)(':serverId/modules'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "modules", null);
__decorate([
    (0, common_1.Get)(':serverId/modules/:moduleKey'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('moduleKey', (0, zod_pipe_1.zodBody)(moduleKey))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "module", null);
__decorate([
    (0, common_1.Patch)(':serverId/modules/:moduleKey'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('moduleKey', (0, zod_pipe_1.zodBody)(moduleKey))),
    __param(3, (0, common_1.Body)((0, zod_pipe_1.zodBody)(patchModule))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, void 0]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "patchModule", null);
__decorate([
    (0, common_1.Get)(':serverId/roles'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "roles", null);
__decorate([
    (0, common_1.Post)(':serverId/roles'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(createRole))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "createRole", null);
__decorate([
    (0, common_1.Patch)(':serverId/roles/:roleId'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('roleId', common_1.ParseUUIDPipe)),
    __param(3, (0, common_1.Body)((0, zod_pipe_1.zodBody)(updateRole))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, void 0]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "updateRole", null);
__decorate([
    (0, common_1.Delete)(':serverId/roles/:roleId'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('roleId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], ServersController.prototype, "deleteRole", null);
__decorate([
    (0, common_1.Get)(':serverId/permissions'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "permissions", null);
__decorate([
    (0, common_1.Get)(':serverId/roles/:roleId/permissions'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('roleId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "rolePermissions", null);
__decorate([
    (0, common_1.Put)(':serverId/roles/:roleId/permissions'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('roleId', common_1.ParseUUIDPipe)),
    __param(3, (0, common_1.Body)((0, zod_pipe_1.zodBody)(grants))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, void 0]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "setRolePermissions", null);
__decorate([
    (0, common_1.Get)(':serverId/users/:userId/effective-permissions'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "effective", null);
__decorate([
    (0, common_1.Get)(':serverId/role-mappings'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "roleMappings", null);
__decorate([
    (0, common_1.Put)(':serverId/role-mappings'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(mappings))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "setRoleMappings", null);
__decorate([
    (0, common_1.Get)(':serverId/audit-logs'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Query)((0, zod_pipe_1.zodBody)(auditQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "audit", null);
exports.ServersController = ServersController = __decorate([
    (0, swagger_1.ApiTags)('servers'),
    (0, decorators_1.ServiceAuthorized)(),
    (0, common_1.Controller)('servers'),
    __metadata("design:paramtypes", [servers_service_1.ServersService])
], ServersController);
/** Für den Bot: abgeschaltete Module eines Servers (Befehle werden je Server danach registriert). Nur per Bot-Token. */
let BotServersController = class BotServersController {
    s;
    constructor(s) {
        this.s = s;
    }
    modules(guildId) { return this.s.botModules(guildId); }
};
exports.BotServersController = BotServersController;
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)(':guildId/modules'),
    __param(0, (0, common_1.Param)('guildId', (0, zod_pipe_1.zodBody)(sf))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BotServersController.prototype, "modules", null);
exports.BotServersController = BotServersController = __decorate([
    (0, swagger_1.ApiTags)('bot'),
    (0, common_1.Controller)('bot/servers'),
    __metadata("design:paramtypes", [servers_service_1.ServersService])
], BotServersController);
//# sourceMappingURL=multi-server.controller.js.map