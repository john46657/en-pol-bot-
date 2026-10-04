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
exports.MediaController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const media_service_1 = require("./media.service");
const decorators_1 = require("../authz/decorators");
const errors_1 = require("../common/errors");
const zod_pipe_1 = require("../common/zod.pipe");
const link = zod_1.z.object({ linkedType: zod_1.z.string().max(40), linkedId: zod_1.z.string().max(64) });
let MediaController = class MediaController {
    m;
    constructor(m) {
        this.m = m;
    }
    upload(a, file, b) {
        if (!file)
            throw new errors_1.AppError('VALIDATION_FAILED', 'file is required.');
        return this.m.upload(a, file, b);
    }
    list(a, q) { return this.m.list(a, q.linkedType, q.linkedId); }
    async download(a, id, res) {
        const { media, data } = await this.m.download(a, id);
        // Nie inline ausliefern: erzwingt Download und verhindert Ausführung/Rendern von Inhalten im App-Origin.
        res.set({ 'Content-Type': media.mime, 'Content-Disposition': `attachment; filename="${media.originalName}"`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
        res.send(data);
    }
};
exports.MediaController = MediaController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { limits: { fileSize: media_service_1.MAX_BYTES, files: 1 } })),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(link))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, void 0]),
    __metadata("design:returntype", void 0)
], MediaController.prototype, "upload", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(link))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], MediaController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], MediaController.prototype, "download", null);
exports.MediaController = MediaController = __decorate([
    (0, swagger_1.ApiTags)('media'),
    (0, common_1.Controller)('media'),
    __metadata("design:paramtypes", [media_service_1.MediaService])
], MediaController);
//# sourceMappingURL=media.controller.js.map