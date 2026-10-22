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
exports.BotApplicationProgressController = exports.saveProgress = exports.clearProgress = exports.POLICE_UNIT = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const prisma_service_1 = require("../prisma/prisma.service");
/** Schlüssel der Polizei-Bewerbung (wie im Bot); alles andere ist eine Einheit / Bewerbungsart. */
exports.POLICE_UNIT = '@polizei';
/** Nach dem Einreichen: angefangene Bewerbung aus der Liste „in Bearbeitung“ entfernen. */
const clearProgress = (prisma, discordId, unit) => discordId ? prisma.applicationProgress.deleteMany({ where: { discordId, unit } }).then(() => undefined, () => undefined) : Promise.resolve();
exports.clearProgress = clearProgress;
/** Angefangene Bewerbung merken bzw. Fortschritt aktualisieren (eine je Person und Bewerbung). */
const saveProgress = (prisma, p) => {
    const data = { discordName: p.discordName, unitName: p.unitName, guildId: p.guildId ?? null, source: p.source, answered: p.answered ?? null, total: p.total ?? null, expiresAt: p.expiresAt };
    return prisma.applicationProgress.upsert({ where: { discordId_unit: { discordId: p.discordId, unit: p.unit } }, create: { discordId: p.discordId, unit: p.unit, ...data, ...(p.startedAt ? { startedAt: p.startedAt } : {}) }, update: { ...data, ...(p.startedAt ? { startedAt: p.startedAt } : {}) } });
};
exports.saveProgress = saveProgress;
const discordId = zod_1.z.string().regex(/^\d{15,25}$/);
const progress = zod_1.z.object({
    discordId, discordName: zod_1.z.string().trim().min(1).max(100), unit: zod_1.z.string().min(1).max(24), unitName: zod_1.z.string().trim().min(1).max(120),
    guildId: zod_1.z.string().regex(/^\d{15,25}$/).optional(), answered: zod_1.z.number().int().min(0).max(500), total: zod_1.z.number().int().min(1).max(500),
    startedAt: zod_1.z.coerce.date(), expiresAt: zod_1.z.coerce.date(),
});
const clearQ = zod_1.z.object({ discordId, unit: zod_1.z.string().min(1).max(24).optional() });
/** Dienst-Endpunkte für den Bot: laufende Bewerbungen per Direktnachricht melden (Anzeige im Dashboard). */
let BotApplicationProgressController = class BotApplicationProgressController {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async save(b) { await (0, exports.saveProgress)(this.prisma, { ...b, source: 'DISCORD' }); }
    /** Abgebrochen oder abgelaufen (ohne `unit`: alle der Person). */
    async clear(q) { await this.prisma.applicationProgress.deleteMany({ where: { discordId: q.discordId, ...(q.unit ? { unit: q.unit } : {}) } }); }
    /** Bot-Neustart: laufende Bewerbungen im Speicher des Bots sind weg – also auch hier. */
    async reset() { await this.prisma.applicationProgress.deleteMany({ where: { source: 'DISCORD' } }); }
};
exports.BotApplicationProgressController = BotApplicationProgressController;
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(progress))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", Promise)
], BotApplicationProgressController.prototype, "save", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Delete)(),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(clearQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", Promise)
], BotApplicationProgressController.prototype, "clear", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('reset'),
    (0, common_1.HttpCode)(204),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BotApplicationProgressController.prototype, "reset", null);
exports.BotApplicationProgressController = BotApplicationProgressController = __decorate([
    (0, swagger_1.ApiTags)('bot'),
    (0, common_1.Controller)('bot/application-progress'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], BotApplicationProgressController);
//# sourceMappingURL=application-progress.js.map