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
exports.DocumentsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const documents_service_1 = require("./documents.service");
const listQ = zod_1.z.object({ q: zod_1.z.string().max(100).optional(), category: zod_1.z.enum(shared_1.DOCUMENT_CATEGORIES).optional(), archived: zod_1.z.enum(['true', 'false']).optional() });
const versionForm = zod_1.z.object({ note: zod_1.z.string().trim().max(500).optional() });
const archiveBody = zod_1.z.object({ archived: zod_1.z.boolean() });
const upload = (0, platform_express_1.FileInterceptor)('file', { limits: { fileSize: shared_1.DOCUMENT_MAX_BYTES, files: 1 } });
/** Dokumente. Ansehen: documents.view (+ Zugriffsgruppe je Dokument) · hochladen/neue Version: documents.upload · Zugriff/Archiv/Wiederherstellen: documents.manage. */
let DocumentsController = class DocumentsController {
    s;
    constructor(s) {
        this.s = s;
    }
    list(a, q) { return this.s.list(a, { ...q, archived: q.archived === 'true' }); }
    get(a, id) { return this.s.get(a, id); }
    async download(a, id, version, res) {
        const n = version && /^\d{1,6}$/.test(version) ? Number(version) : undefined;
        const f = await this.s.download(a, id, n);
        // nie inline: Download erzwingen, keine Ausführung/Darstellung im App-Ursprung
        res.set({ 'Content-Type': f.media.mime, 'Content-Disposition': `attachment; filename="${encodeURIComponent(f.filename)}"`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, no-store' });
        res.send(f.data);
    }
    create(a, file, b) { return this.s.create(a, b, file); }
    addVersion(a, id, file, b) { return this.s.addVersion(a, id, b.note, file); }
    restore(a, id, n) { return this.s.restoreVersion(a, id, n); }
    meta(a, id, b) { return this.s.updateMeta(a, id, b); }
    archive(a, id, b) { return this.s.setArchived(a, id, b.archived); }
};
exports.DocumentsController = DocumentsController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('documents.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('documents.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "get", null);
__decorate([
    (0, common_1.Get)(':id/download'),
    (0, decorators_1.RequirePermission)('documents.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Query)('version')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], DocumentsController.prototype, "download", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('documents.upload'),
    (0, common_1.UseInterceptors)(upload),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(documents_service_1.docForm))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, void 0]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/versions'),
    (0, decorators_1.RequirePermission)('documents.upload'),
    (0, common_1.UseInterceptors)(upload),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.UploadedFile)()),
    __param(3, (0, common_1.Body)((0, zod_pipe_1.zodBody)(versionForm))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, void 0]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "addVersion", null);
__decorate([
    (0, common_1.Post)(':id/versions/:n/restore'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('documents.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('n', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Number]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "restore", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, decorators_1.RequirePermission)('documents.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(documents_service_1.docMeta.extend({ version: zod_1.z.number().int().min(1) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "meta", null);
__decorate([
    (0, common_1.Post)(':id/archive'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('documents.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(archiveBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "archive", null);
exports.DocumentsController = DocumentsController = __decorate([
    (0, swagger_1.ApiTags)('documents'),
    (0, common_1.Controller)('documents'),
    __metadata("design:paramtypes", [documents_service_1.DocumentsService])
], DocumentsController);
//# sourceMappingURL=documents.controller.js.map