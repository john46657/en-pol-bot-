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
exports.MeController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma_service_1 = require("../prisma/prisma.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const me_schemas_1 = require("./me.schemas");
const prefsBody = zod_1.z.object({ preferences: me_schemas_1.preferencesSchema });
const layoutsBody = zod_1.z.object({ layouts: me_schemas_1.layoutsSchema.nullable() });
/**
 * Persönliche Einstellungen und Startseiten-Layouts – je Benutzer (bei Discord-Login: je Discord-Konto) in der Datenbank,
 * damit sie auf jedem Gerät gleich sind. Jeder ändert ausschließlich seine eigenen Daten (Benutzer-ID aus der Session).
 */
let MeController = class MeController {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async get(a) {
        const s = await this.prisma.userSettings.findUnique({ where: { userId: a.userId } });
        return { preferences: s?.preferences ?? {}, layouts: s?.layouts ?? null, updatedAt: new Date() };
    }
    async setPreferences(a, b) {
        const value = b.preferences;
        await this.prisma.userSettings.upsert({ where: { userId: a.userId }, create: { userId: a.userId, preferences: value }, update: { preferences: value } });
        return { preferences: b.preferences, savedAt: new Date() };
    }
    /** Layouts (Widgets, Reihenfolge, Größe). `null` = auf den Standard zurücksetzen. */
    async setLayouts(a, b) {
        const value = b.layouts === null ? client_1.Prisma.DbNull : b.layouts;
        await this.prisma.userSettings.upsert({ where: { userId: a.userId }, create: { userId: a.userId, layouts: value }, update: { layouts: value } });
        return { layouts: b.layouts, savedAt: new Date() };
    }
};
exports.MeController = MeController;
__decorate([
    (0, common_1.Get)('preferences'),
    (0, decorators_1.RequirePermission)('dashboard.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MeController.prototype, "get", null);
__decorate([
    (0, common_1.Put)('preferences'),
    (0, decorators_1.RequirePermission)('dashboard.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(prefsBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", Promise)
], MeController.prototype, "setPreferences", null);
__decorate([
    (0, common_1.Put)('layouts'),
    (0, decorators_1.RequirePermission)('dashboard.customize'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(layoutsBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", Promise)
], MeController.prototype, "setLayouts", null);
exports.MeController = MeController = __decorate([
    (0, swagger_1.ApiTags)('me'),
    (0, common_1.Controller)('me'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MeController);
//# sourceMappingURL=me.controller.js.map