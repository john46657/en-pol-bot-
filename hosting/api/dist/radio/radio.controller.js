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
exports.RadioWhitelistBotController = exports.RadioWhitelistController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const radio_whitelist_service_1 = require("./radio-whitelist.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const errors_1 = require("../common/errors");
const snowflake = zod_1.z.string().regex(/^\d{15,25}$/, 'Ungültige Discord-ID.');
const target = zod_1.z.object({ userId: zod_1.z.string().uuid().optional(), discordId: snowflake.optional() }).refine((v) => !!v.userId !== !!v.discordId, 'Bitte genau einen Benutzer oder eine Discord-ID angeben.');
const text = (max) => zod_1.z.string().trim().max(max);
const optText = (max) => text(max).nullish().transform((v) => (v ? v : null));
const date = zod_1.z.coerce.date();
const reason = text(1000).min(3, 'Bitte eine Begründung angeben (mind. 3 Zeichen).');
const version = zod_1.z.number().int().positive().optional();
const statusFilter = zod_1.z.enum(['active', 'suspended', 'expired', 'pending', 'disabled', 'revoked', 'all', 'open']).default('open');
const page = { page: zod_1.z.coerce.number().int().min(1).default(1), pageSize: zod_1.z.coerce.number().int().min(1).max(200).default(50), q: zod_1.z.string().trim().max(100).optional() };
const listQ = zod_1.z.object({ status: statusFilter, ...page });
const createB = zod_1.z.object({ discordId: snowflake, discordName: optText(100), rank: optText(80), department: optText(80), externalName: optText(100), reason, expiresAt: date.nullish(), status: zod_1.z.enum(['ACTIVE', 'PENDING']).default('ACTIVE') });
const updateB = zod_1.z.object({ version: zod_1.z.number().int().positive(), discordName: optText(100).optional(), rank: optText(80).optional(), department: optText(80).optional(), externalName: optText(100).optional(), reason: optText(1000).optional() });
const activateB = zod_1.z.object({ reason: optText(1000), expiresAt: date.nullish(), version });
const reasonB = zod_1.z.object({ reason, version });
const extendB = zod_1.z.object({ expiresAt: date.nullable(), reason: optText(1000), version });
const suspendB = zod_1.z.object({ reason, until: date.nullish(), version });
const unsuspendB = zod_1.z.object({ reason: optText(1000), version });
const restoreB = zod_1.z.object({ reason, expiresAt: date.nullish() });
const discordIdB = zod_1.z.object({ discordId: snowflake });
const requestsQ = zod_1.z.object({ status: zod_1.z.enum(['PENDING', 'DONE', 'ALL']).default('PENDING'), ...page });
const decideB = zod_1.z.object({ decision: zod_1.z.enum(['APPROVE', 'REJECT']), reason: optText(1000), expiresAt: date.nullish() });
const roleIds = zod_1.z.array(snowflake).max(50);
const rolesB = zod_1.z.object({
    roleSync: zod_1.z.object({ enabled: zod_1.z.boolean(), grantRoleIds: roleIds, requiredRoleIds: roleIds, onRoleGain: zod_1.z.enum(['ACTIVATE', 'PENDING', 'NONE']), onRoleLoss: zod_1.z.enum(['REVOKE', 'DISABLE', 'NONE']), manualOnRoleLoss: zod_1.z.enum(['KEEP', 'DISABLE', 'REVOKE']) }),
    radioRoleIds: roleIds,
});
const panelB = zod_1.z.object({ channelId: snowflake.nullable(), title: text(256).min(1), text: text(4000).min(1), buttonLabel: text(80).min(1), color: zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Farbe als #RRGGBB.') });
const formField = zod_1.z.object({ key: zod_1.z.string().regex(/^[a-z0-9_]{1,30}$/, 'Feld-Schlüssel: nur a–z, 0–9, _'), label: text(45).min(1), placeholder: text(100).default(''), paragraph: zod_1.z.boolean(), required: zod_1.z.boolean(), maxLength: zod_1.z.number().int().min(1).max(1000) });
const formB = zod_1.z.object({ title: text(45).min(1), fields: zod_1.z.array(formField).min(1).max(5, 'Discord erlaubt höchstens 5 Felder.') })
    .refine((f) => new Set(f.fields.map((x) => x.key)).size === f.fields.length, 'Jedes Feld braucht einen eigenen Schlüssel.')
    .refine((f) => f.fields.some((x) => x.key === 'reason'), 'Das Feld „Begründung“ (reason) muss enthalten sein.');
const requestsB = zod_1.z.object({ requests: zod_1.z.object({ enabled: zod_1.z.boolean(), preventDuplicates: zod_1.z.boolean(), notifyChannelId: snowflake.nullable(), panel: panelB, form: formB }), notifyMembers: zod_1.z.boolean() });
const integrationB = zod_1.z.object({
    provider: zod_1.z.enum(['NONE', 'ZELLO_WORK', 'ZELLO_APP', 'OTHER_MANUAL']), displayName: text(80).min(1), network: optText(63), channel: optText(100), adminUsername: optText(100),
    password: zod_1.z.string().max(200).optional(), apiKey: zod_1.z.string().max(500).optional(), clearCredentials: zod_1.z.boolean().optional(), autoSync: zod_1.z.boolean(), version: zod_1.z.number().int().positive(),
});
const exportQ = zod_1.z.object({ status: statusFilter });
const importB = zod_1.z.object({ csv: zod_1.z.string().min(1).max(2_000_000), dryRun: zod_1.z.boolean().default(true) });
const logsQ = zod_1.z.object(page);
/** 🎙️ Funk-Whitelist im Dashboard. Jede Route mit eigenem, granularem Recht (deny-by-default). */
let RadioWhitelistController = class RadioWhitelistController {
    s;
    constructor(s) {
        this.s = s;
    }
    list(q) { return this.s.list(q); }
    summary() { return this.s.counts(); }
    get(id) { return this.s.get(id); }
    create(a, b) { return this.s.create(a, b); }
    update(a, id, b) { return this.s.update(a, id, b); }
    activate(a, id, b) { return this.s.activate(a, id, b); }
    deactivate(a, id, b) { return this.s.deactivate(a, id, b); }
    extend(a, id, b) { return this.s.extend(a, id, b); }
    restore(a, id, b) { return this.s.restore(a, id, b); }
    discordId(a, id, b) { return this.s.setDiscordId(a, id, b.discordId); }
    externalDone(a, id) { return this.s.markExternalDone(a, id); }
    suspend(a, id, b) { return this.s.suspend(a, id, b); }
    unsuspend(a, id, b) { return this.s.unsuspend(a, id, b); }
    revoke(a, id, b) { return this.s.revoke(a, id, b); }
    requests(q) { return this.s.listRequests(q); }
    decide(a, id, b) { return this.s.decide(a, id, b); }
    config() { return this.s.config(); }
    roles(a, b) { return this.s.updateRoleConfig(a, b); }
    requestConfig(a, b) { return this.s.updateRequestConfig(a, b); }
    requestPanel(a) { return this.s.postRequestPanel(a); }
    roleSyncStatus() { return this.s.roleSyncStatus(); }
    roleSync(a) { return this.s.requestRoleSync(a); }
    integration() { return this.s.integration(); }
    saveIntegration(a, b) { return this.s.updateIntegration(a, b); }
    test(a) { return this.s.testConnection(a); }
    sync(a) { return this.s.runSync(a); }
    async export(q, res) {
        const csv = await this.s.exportCsv(q.status);
        res.type('text/csv; charset=utf-8').setHeader('content-disposition', `attachment; filename="funk-whitelist-${new Date().toISOString().slice(0, 10)}.csv"`).send(csv);
    }
    import(a, b) { return this.s.importCsv(a, b.csv, b.dryRun); }
    logs(q) { return this.s.logs(q); }
    // ---- bisherige Schnittstelle (Bot-Befehl /funkfreigabe, Altversionen) ----
    legacyList() { return this.s.legacyList(); }
    /** Nur Ja/Nein für eine Person (wie bisher für das ganze Team). */
    check(q) { return this.s.legacyCheck(q); }
    add(a, b) { return this.s.legacyAdd(a, b); }
    remove(a, b) { return this.s.legacyRemove(a, b); }
};
exports.RadioWhitelistController = RadioWhitelistController;
__decorate([
    (0, common_1.Get)('grants'),
    (0, decorators_1.RequirePermission)('radiowhitelist.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('summary'),
    (0, decorators_1.RequirePermission)('radiowhitelist.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "summary", null);
__decorate([
    (0, common_1.Get)('grants/:id'),
    (0, decorators_1.RequirePermission)('radiowhitelist.view'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "get", null);
__decorate([
    (0, common_1.Post)('grants'),
    (0, decorators_1.RequirePermission)('radiowhitelist.grant'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(createB))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)('grants/:id'),
    (0, decorators_1.RequirePermission)('radiowhitelist.grant'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(updateB))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "update", null);
__decorate([
    (0, common_1.Post)('grants/:id/activate'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('radiowhitelist.grant'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(activateB))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "activate", null);
__decorate([
    (0, common_1.Post)('grants/:id/deactivate'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('radiowhitelist.grant'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(reasonB))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "deactivate", null);
__decorate([
    (0, common_1.Post)('grants/:id/extend'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('radiowhitelist.grant'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(extendB))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "extend", null);
__decorate([
    (0, common_1.Post)('grants/:id/restore'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('radiowhitelist.grant'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(restoreB))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "restore", null);
__decorate([
    (0, common_1.Post)('grants/:id/discord-id'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('radiowhitelist.grant'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(discordIdB))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "discordId", null);
__decorate([
    (0, common_1.Post)('grants/:id/external-done'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('radiowhitelist.grant'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "externalDone", null);
__decorate([
    (0, common_1.Post)('grants/:id/suspend'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('radiowhitelist.suspend'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(suspendB))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "suspend", null);
__decorate([
    (0, common_1.Post)('grants/:id/unsuspend'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('radiowhitelist.suspend'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(unsuspendB))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "unsuspend", null);
__decorate([
    (0, common_1.Post)('grants/:id/revoke'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('radiowhitelist.remove'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(reasonB))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "revoke", null);
__decorate([
    (0, common_1.Get)('requests'),
    (0, decorators_1.RequirePermission)('radiowhitelist.requests'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(requestsQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "requests", null);
__decorate([
    (0, common_1.Post)('requests/:id/decision'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('radiowhitelist.requests'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(decideB))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "decide", null);
__decorate([
    (0, common_1.Get)('config'),
    (0, decorators_1.RequirePermission)('radiowhitelist.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "config", null);
__decorate([
    (0, common_1.Put)('config/roles'),
    (0, decorators_1.RequirePermission)('radiowhitelist.roles'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(rolesB))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "roles", null);
__decorate([
    (0, common_1.Put)('config/requests'),
    (0, decorators_1.RequirePermission)('radiowhitelist.requests'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(requestsB))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "requestConfig", null);
__decorate([
    (0, common_1.Post)('request-panel'),
    (0, common_1.HttpCode)(202),
    (0, decorators_1.RequirePermission)('radiowhitelist.requests'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "requestPanel", null);
__decorate([
    (0, common_1.Get)('role-sync'),
    (0, decorators_1.RequirePermission)('radiowhitelist.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "roleSyncStatus", null);
__decorate([
    (0, common_1.Post)('role-sync/run'),
    (0, common_1.HttpCode)(202),
    (0, decorators_1.RequirePermission)('radiowhitelist.roles'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "roleSync", null);
__decorate([
    (0, common_1.Get)('integration'),
    (0, decorators_1.RequirePermission)('radiowhitelist.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "integration", null);
__decorate([
    (0, common_1.Put)('integration'),
    (0, decorators_1.RequirePermission)('radiowhitelist.integration'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(integrationB))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "saveIntegration", null);
__decorate([
    (0, common_1.Post)('integration/test'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('radiowhitelist.integration'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "test", null);
__decorate([
    (0, common_1.Post)('integration/sync'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('radiowhitelist.integration'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "sync", null);
__decorate([
    (0, common_1.Get)('export'),
    (0, decorators_1.RequirePermission)('radiowhitelist.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(exportQ))),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0, Object]),
    __metadata("design:returntype", Promise)
], RadioWhitelistController.prototype, "export", null);
__decorate([
    (0, common_1.Post)('import'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('radiowhitelist.grant'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(importB))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "import", null);
__decorate([
    (0, common_1.Get)('logs'),
    (0, decorators_1.RequirePermission)('radiowhitelist.logs'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(logsQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "logs", null);
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('radiowhitelist.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "legacyList", null);
__decorate([
    (0, common_1.Get)('check'),
    (0, decorators_1.RequirePermission)('team.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(target))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "check", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('radiowhitelist.grant'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(target))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "add", null);
__decorate([
    (0, common_1.Post)('remove'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('radiowhitelist.remove'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(target))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistController.prototype, "remove", null);
exports.RadioWhitelistController = RadioWhitelistController = __decorate([
    (0, swagger_1.ApiTags)('radio-whitelist'),
    (0, common_1.Controller)('radio-whitelist'),
    __metadata("design:paramtypes", [radio_whitelist_service_1.RadioWhitelistService])
], RadioWhitelistController);
const botRequestB = zod_1.z.object({ guildId: snowflake.nullable(), discordId: snowflake, discordName: optText(100), rank: optText(80), department: optText(80), reason: text(1000).min(3, 'Bitte begründe deinen Antrag.'), answers: zod_1.z.record(zod_1.z.string().regex(/^[a-z0-9_]{1,30}$/), zod_1.z.string().max(1000)).optional() });
const snapshotB = zod_1.z.object({ guildId: snowflake, full: zod_1.z.boolean().default(false), members: zod_1.z.array(zod_1.z.object({ discordId: snowflake, name: optText(100), roleIds: zod_1.z.array(snowflake).max(250).nullable() })).max(1000) });
/** Bot-Dienst (nur mit Bot-Token): Anträge aus Discord, Rollenstände für den Abgleich, Status für das Mitglied. */
let RadioWhitelistBotController = class RadioWhitelistBotController {
    s;
    constructor(s) {
        this.s = s;
    }
    request(b) { return this.s.createRequest(b); }
    status(id) {
        if (!/^\d{15,25}$/.test(id))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Ungültige Discord-ID.');
        return this.s.memberStatus(id);
    }
    targets() { return this.s.syncTargets(); }
    roles(b) { return this.s.applyRoleSnapshot(b.guildId, b.members, b.full); }
};
exports.RadioWhitelistBotController = RadioWhitelistBotController;
__decorate([
    (0, common_1.Post)('requests'),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(botRequestB))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistBotController.prototype, "request", null);
__decorate([
    (0, common_1.Get)('status/:discordId'),
    __param(0, (0, common_1.Param)('discordId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RadioWhitelistBotController.prototype, "status", null);
__decorate([
    (0, common_1.Get)('sync-targets'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], RadioWhitelistBotController.prototype, "targets", null);
__decorate([
    (0, common_1.Post)('roles'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(snapshotB))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], RadioWhitelistBotController.prototype, "roles", null);
exports.RadioWhitelistBotController = RadioWhitelistBotController = __decorate([
    (0, swagger_1.ApiTags)('bot'),
    (0, common_1.Controller)('bot/radio-whitelist'),
    (0, decorators_1.BotService)(),
    __metadata("design:paramtypes", [radio_whitelist_service_1.RadioWhitelistService])
], RadioWhitelistBotController);
//# sourceMappingURL=radio.controller.js.map