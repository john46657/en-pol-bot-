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
exports.BotBackupController = exports.BackupController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const backup_service_1 = require("./backup.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const errors_1 = require("../common/errors");
const guild_context_1 = require("../common/guild-context");
const sf = zod_1.z.string().regex(/^\d{15,25}$/);
const fileName = zod_1.z.string().regex(/^[a-z-]+-\d{8}-\d{6}(-[a-z0-9]{4})?\.json\.gz(\.enc)?$/);
const groups = zod_1.z.array(zod_1.z.enum(shared_1.BACKUP_MODULE_GROUPS.map((g) => g.key))).max(20).optional();
const createBody = zod_1.z.object({ scope: zod_1.z.enum(shared_1.BACKUP_SCOPES).default('DATABASE'), modules: groups, note: zod_1.z.string().trim().max(300).optional(), kind: zod_1.z.enum(['manuell', 'vor-update']).default('manuell') }).partial().default({});
const restoreBody = zod_1.z.object({ confirm: zod_1.z.literal('WIEDERHERSTELLEN'), groups, acknowledgeNewer: zod_1.z.boolean().optional() });
/**
 * Administration → Backup-Center. Daten-Backups enthalten alles (auch Konten): Recht `backup.*` UND globaler Systemadministrator.
 * Wiederherstellen: Integrität → Version → Sicherung des aktuellen Stands → Umfang/Plan → Bestätigung „WIEDERHERSTELLEN“
 * (neuere Daten zusätzlich `acknowledgeNewer`) → Einspielen → Protokoll → Prüfung.
 */
let BackupController = class BackupController {
    s;
    constructor(s) {
        this.s = s;
    }
    async config(a) { await this.s.requireGlobal(a); return this.s.config(); }
    async saveConfig(a, b) { await this.s.requireGlobal(a); return this.s.saveConfig(a, b); }
    /** Systemstatus (für MDT/Leitstelle/Bot nur über berechtigte Administratoren) */
    async status(a) { await this.s.requireGlobal(a); return this.s.status(); }
    async listData(a, q) { await this.s.requireGlobal(a); return this.s.listData({ archived: q.archived === '1' ? true : q.archived === 'all' ? undefined : q.archived === '0' ? false : undefined }); }
    async createData(a, b) { await this.s.requireGlobal(a); return this.s.createData(a, b.kind ?? 'manuell', { scope: b.scope, modules: b.modules, note: b.note }); }
    async download(a, name, res) {
        await this.s.requireGlobal(a);
        const buf = await this.s.downloadData(a, name);
        res.setHeader('content-type', name.endsWith('.enc') ? 'application/octet-stream' : 'application/gzip');
        res.setHeader('content-disposition', `attachment; filename="en-polizei-${name}"`);
        res.setHeader('cache-control', 'no-store');
        res.send(buf);
    }
    async deleteData(a, name) { await this.s.requireGlobal(a); return this.s.deleteData(a, name); }
    async verify(a, name) { await this.s.requireGlobal(a); return this.s.verify(a, name); }
    async archive(a, name, b) { await this.s.requireGlobal(a); return this.s.setArchived(a, name, b.archived); }
    /** Wiederherstellungsplan (ändert nichts) */
    async plan(a, name, b) { await this.s.requireGlobal(a); return this.s.plan({ name }, b.groups); }
    async restore(a, name, b) { await this.s.requireGlobal(a); return this.s.restoreData(a, { name }, { groups: b.groups, acknowledgeNewer: b.acknowledgeNewer }); }
    async restoreUpload(a, file, confirm, ack) {
        await this.s.requireGlobal(a);
        if (confirm !== 'WIEDERHERSTELLEN')
            throw new errors_1.AppError('VALIDATION_FAILED', 'Zum Bestätigen „WIEDERHERSTELLEN“ eingeben.');
        return this.s.restoreData(a, { buffer: file?.buffer }, { acknowledgeNewer: ack === 'true' });
    }
    listDiscord(q) { return this.s.listDiscord((0, guild_context_1.targetGuild)(q.guildId) ?? undefined); }
    getDiscord(id) { return this.s.getDiscord(id); }
    createDiscord(a, b) { return this.s.createDiscord(a, (0, guild_context_1.targetGuild)(b.guildId), b.name); }
    deleteDiscord(a, id) { return this.s.deleteDiscord(a, id); }
    restoreDiscord(a, id, b) { return this.s.restoreDiscord(a, id, { ...b, guildId: (0, guild_context_1.targetGuild)(b.guildId) ?? undefined }); }
};
exports.BackupController = BackupController;
__decorate([
    (0, common_1.Get)('config'),
    (0, decorators_1.RequirePermission)('backup.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "config", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, decorators_1.RequirePermission)('backup.settings'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.backupConfigSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "saveConfig", null);
__decorate([
    (0, common_1.Get)('status'),
    (0, decorators_1.RequirePermission)('backup.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "status", null);
__decorate([
    (0, common_1.Get)('data'),
    (0, decorators_1.RequirePermission)('backup.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ archived: zod_1.z.enum(['1', '0', 'all']).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "listData", null);
__decorate([
    (0, common_1.Post)('data'),
    (0, decorators_1.RequirePermission)('backup.create'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(createBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "createData", null);
__decorate([
    (0, common_1.Get)('data/:name'),
    (0, decorators_1.RequirePermission)('backup.download'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('name', (0, zod_pipe_1.zodBody)(fileName))),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "download", null);
__decorate([
    (0, common_1.Delete)('data/:name'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('backup.archive'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('name', (0, zod_pipe_1.zodBody)(fileName))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "deleteData", null);
__decorate([
    (0, common_1.Post)('data/:name/verify'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('backup.verify'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('name', (0, zod_pipe_1.zodBody)(fileName))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "verify", null);
__decorate([
    (0, common_1.Post)('data/:name/archive'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('backup.archive'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('name', (0, zod_pipe_1.zodBody)(fileName))),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ archived: zod_1.z.boolean().default(true) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "archive", null);
__decorate([
    (0, common_1.Post)('data/:name/plan'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('backup.restore'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('name', (0, zod_pipe_1.zodBody)(fileName))),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ groups })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "plan", null);
__decorate([
    (0, common_1.Post)('data/:name/restore'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('backup.restore'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('name', (0, zod_pipe_1.zodBody)(fileName))),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(restoreBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "restore", null);
__decorate([
    (0, common_1.Post)('data-upload/restore'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('backup.restore'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { limits: { fileSize: 500 * 1024 * 1024, files: 1 } })),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)('confirm')),
    __param(3, (0, common_1.Body)('acknowledgeNewer')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "restoreUpload", null);
__decorate([
    (0, common_1.Get)('discord'),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ guildId: sf.optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BackupController.prototype, "listDiscord", null);
__decorate([
    (0, common_1.Get)('discord/:id'),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BackupController.prototype, "getDiscord", null);
__decorate([
    (0, common_1.Post)('discord'),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ guildId: sf, name: zod_1.z.string().trim().max(80).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], BackupController.prototype, "createDiscord", null);
__decorate([
    (0, common_1.Delete)('discord/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], BackupController.prototype, "deleteDiscord", null);
__decorate([
    (0, common_1.Post)('discord/:id/restore'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ guildId: sf.optional(), parts: zod_1.z.array(zod_1.z.enum(shared_1.BACKUP_PARTS)).min(1), confirm: zod_1.z.literal('WIEDERHERSTELLEN') })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], BackupController.prototype, "restoreDiscord", null);
exports.BackupController = BackupController = __decorate([
    (0, swagger_1.ApiTags)('backups'),
    (0, common_1.Controller)('backups'),
    __metadata("design:paramtypes", [backup_service_1.BackupService])
], BackupController);
/** Dienstweg des Bots: gelesene Serverdaten abliefern, Backup zum Wiederherstellen holen, Ergebnis melden. */
let BotBackupController = class BotBackupController {
    s;
    constructor(s) {
        this.s = s;
    }
    async get(id) { const b = await this.s.getDiscord(id); return { id: b.id, guildId: b.guildId, data: b.data }; }
    save(id, b) { return this.s.botSaveData(id, b); }
    result(id, b) { return this.s.botRestoreResult(id, b); }
};
exports.BotBackupController = BotBackupController;
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BotBackupController.prototype, "get", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)(':id/data'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BotBackupController.prototype, "save", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)(':id/result'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BotBackupController.prototype, "result", null);
exports.BotBackupController = BotBackupController = __decorate([
    (0, swagger_1.ApiTags)('bot'),
    (0, common_1.Controller)('bot/discord-backups'),
    __metadata("design:paramtypes", [backup_service_1.BackupService])
], BotBackupController);
//# sourceMappingURL=backup.controller.js.map