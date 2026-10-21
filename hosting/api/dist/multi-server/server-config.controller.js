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
exports.ServerConfigController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const server_config_service_1 = require("./server-config.service");
const sf = zod_1.z.string().regex(/^\d{15,25}$/, 'Discord-ID (15–25 Ziffern)');
const version = zod_1.z.number().int().min(0);
const save = zod_1.z.object({ data: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()), version, note: zod_1.z.string().trim().max(200).optional() }).strict();
const setup = zod_1.z.object({ step: zod_1.z.number().int().min(0).max(7), complete: zod_1.z.boolean().optional() }).strict();
const restore = zod_1.z.object({ version, modules: zod_1.z.boolean().default(false) }).strict();
const upload = zod_1.z.object({ kind: zod_1.z.enum(Object.keys(shared_1.BRANDING_IMAGES)) });
const MAX_UPLOAD = Math.max(...Object.values(shared_1.BRANDING_IMAGES).map((r) => r.maxBytes));
const UPLOAD_RATE = { default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 30, ttl: 60_000 } };
/**
 * Server-Konfiguration: Name, Branding, Bilder, Design, Einrichtungsassistent, Versionen.
 * Autorisierung im Service gegen den Server aus dem PFAD (Mitgliedschaft + Recht genau dort); Header/Body können ihn nicht ändern.
 */
let ServerConfigController = class ServerConfigController {
    c;
    constructor(c) {
        this.c = c;
    }
    /** Branding des gewählten Servers fürs Dashboard (nur Mitglieder dieses Servers). */
    branding(a, guildId) { return this.c.branding(a, guildId); }
    get(a, id) { return this.c.get(a, id); }
    save(a, id, b) { return this.c.save(a, id, b); }
    setup(a, id, b) { return this.c.setup(a, id, b); }
    revisions(a, id) { return this.c.revisions(a, id); }
    restore(a, id, v, b) { return this.c.restore(a, id, v, b); }
    upload(a, id, file, b) { return this.c.upload(a, id, b.kind, file); }
    async asset(a, id, assetId, res) {
        const f = await this.c.asset(a, id, assetId);
        res.setHeader('Content-Type', f.mime);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        res.setHeader('Content-Disposition', 'inline');
        // Bilder ändern sich nie (neue Datei = neue ID); nur im eigenen Browser zwischenspeichern
        res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
        res.send(f.data);
    }
    remove(a, id, assetId, confirm) { return this.c.removeAsset(a, id, assetId, confirm === 'true'); }
};
exports.ServerConfigController = ServerConfigController;
__decorate([
    (0, common_1.Get)('branding/:guildId'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('guildId', (0, zod_pipe_1.zodBody)(sf))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ServerConfigController.prototype, "branding", null);
__decorate([
    (0, common_1.Get)(':serverId/config'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ServerConfigController.prototype, "get", null);
__decorate([
    (0, common_1.Put)(':serverId/config'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(save))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ServerConfigController.prototype, "save", null);
__decorate([
    (0, common_1.Post)(':serverId/config/setup'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(setup))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], ServerConfigController.prototype, "setup", null);
__decorate([
    (0, common_1.Get)(':serverId/config/revisions'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ServerConfigController.prototype, "revisions", null);
__decorate([
    (0, common_1.Post)(':serverId/config/revisions/:version/restore'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('version', common_1.ParseIntPipe)),
    __param(3, (0, common_1.Body)((0, zod_pipe_1.zodBody)(restore))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Number, void 0]),
    __metadata("design:returntype", void 0)
], ServerConfigController.prototype, "restore", null);
__decorate([
    (0, common_1.Post)(':serverId/assets'),
    (0, throttler_1.Throttle)(UPLOAD_RATE),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { limits: { fileSize: MAX_UPLOAD, files: 1, fields: 5 } })),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.UploadedFile)()),
    __param(3, (0, common_1.Body)((0, zod_pipe_1.zodBody)(upload))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, void 0]),
    __metadata("design:returntype", void 0)
], ServerConfigController.prototype, "upload", null);
__decorate([
    (0, common_1.Get)(':serverId/assets/:assetId'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('assetId', common_1.ParseUUIDPipe)),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], ServerConfigController.prototype, "asset", null);
__decorate([
    (0, common_1.Delete)(':serverId/assets/:assetId'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('serverId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('assetId', common_1.ParseUUIDPipe)),
    __param(3, (0, common_1.Query)('confirm')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], ServerConfigController.prototype, "remove", null);
exports.ServerConfigController = ServerConfigController = __decorate([
    (0, swagger_1.ApiTags)('servers'),
    (0, decorators_1.ServiceAuthorized)(),
    (0, common_1.Controller)('servers'),
    __metadata("design:paramtypes", [server_config_service_1.ServerConfigService])
], ServerConfigController);
//# sourceMappingURL=server-config.controller.js.map