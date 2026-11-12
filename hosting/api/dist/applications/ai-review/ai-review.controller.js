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
exports.BotAiReviewController = exports.AiReviewSettingsController = exports.QualificationAiReviewController = exports.PoliceAiReviewController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../../authz/decorators");
const guild_context_1 = require("../../common/guild-context");
const zod_pipe_1 = require("../../common/zod.pipe");
const ai_review_service_1 = require("./ai-review.service");
const startBody = zod_1.z.object({ force: zod_1.z.boolean().optional() });
const guildQ = zod_1.z.object({ guildId: zod_1.z.string().regex(/^\d{15,25}$/).optional() });
const who = (a, u) => ({ ...a, name: u?.displayName ?? null });
const via = (u) => (u?.sessionId === 'bot' ? 'DISCORD' : 'WEB');
/** Gegen versehentliche Mehrfach-Klicks zusätzlich zur Sperre im Service (10 Starts pro Minute und Benutzer/IP). */
const START_LIMIT = { default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 10, ttl: 60_000 } };
/** KI-Prüfung der Polizei-Bewerbung: Ansehen und Starten nur für Prüfer (applications.review) bzw. Discord-Manager-Rollen. */
let PoliceAiReviewController = class PoliceAiReviewController {
    ai;
    constructor(ai) {
        this.ai = ai;
    }
    /** Gespeicherter Stand – startet nie eine Analyse. */
    get(id) { return this.ai.state('POLICE', id); }
    /** Analyse ausdrücklich starten (`force` = trotz aktuellem Ergebnis neu analysieren). */
    start(a, u, id, b) {
        return this.ai.start(who(a, u), 'POLICE', id, { force: b.force, via: via(u) });
    }
};
exports.PoliceAiReviewController = PoliceAiReviewController;
__decorate([
    (0, common_1.Get)(':id/ai-review'),
    (0, decorators_1.RequirePermission)('applications.review'),
    (0, decorators_1.DiscordManagerAllows)('police'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PoliceAiReviewController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(':id/ai-review'),
    (0, common_1.HttpCode)(202),
    (0, throttler_1.Throttle)(START_LIMIT),
    (0, decorators_1.RequirePermission)('applications.review'),
    (0, decorators_1.DiscordManagerAllows)('police'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, decorators_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(3, (0, common_1.Body)((0, zod_pipe_1.zodBody)(startBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, void 0]),
    __metadata("design:returntype", void 0)
], PoliceAiReviewController.prototype, "start", null);
exports.PoliceAiReviewController = PoliceAiReviewController = __decorate([
    (0, swagger_1.ApiTags)('applications'),
    (0, common_1.Controller)('applications'),
    __metadata("design:paramtypes", [ai_review_service_1.AiReviewService])
], PoliceAiReviewController);
/** KI-Prüfung der Bewerbungen für Einheiten (SEK, Flugstaffel …): wer über sie entscheiden darf (qualifications.decide). */
let QualificationAiReviewController = class QualificationAiReviewController {
    ai;
    constructor(ai) {
        this.ai = ai;
    }
    get(id) { return this.ai.state('QUALIFICATION', id); }
    start(a, u, id, b) {
        return this.ai.start(who(a, u), 'QUALIFICATION', id, { force: b.force, via: via(u) });
    }
};
exports.QualificationAiReviewController = QualificationAiReviewController;
__decorate([
    (0, common_1.Get)(':id/ai-review'),
    (0, decorators_1.RequirePermission)('qualifications.decide'),
    (0, decorators_1.DiscordManagerAllows)('quali'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], QualificationAiReviewController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(':id/ai-review'),
    (0, common_1.HttpCode)(202),
    (0, throttler_1.Throttle)(START_LIMIT),
    (0, decorators_1.RequirePermission)('qualifications.decide'),
    (0, decorators_1.DiscordManagerAllows)('quali'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, decorators_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(3, (0, common_1.Body)((0, zod_pipe_1.zodBody)(startBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, void 0]),
    __metadata("design:returntype", void 0)
], QualificationAiReviewController.prototype, "start", null);
exports.QualificationAiReviewController = QualificationAiReviewController = __decorate([
    (0, swagger_1.ApiTags)('qualifications'),
    (0, common_1.Controller)('qualifications/applications'),
    __metadata("design:paramtypes", [ai_review_service_1.AiReviewService])
], QualificationAiReviewController);
/** Einstellungen (RP-Regeln, Auswahlkriterien, an/aus) je Server und Status (Schlüssel hinterlegt, Modell, Nutzung). */
let AiReviewSettingsController = class AiReviewSettingsController {
    ai;
    constructor(ai) {
        this.ai = ai;
    }
    status(q) { return this.ai.status(q.guildId ?? (0, guild_context_1.currentGuild)()); }
    settings(q) { return this.ai.settings(q.guildId ?? (0, guild_context_1.currentGuild)()); }
    save(a, q, b) {
        return this.ai.saveSettings(a, q.guildId ?? (0, guild_context_1.currentGuild)(), b);
    }
};
exports.AiReviewSettingsController = AiReviewSettingsController;
__decorate([
    (0, common_1.Get)('status'),
    (0, decorators_1.RequirePermission)('applications.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], AiReviewSettingsController.prototype, "status", null);
__decorate([
    (0, common_1.Get)('settings'),
    (0, decorators_1.RequirePermission)('applications.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], AiReviewSettingsController.prototype, "settings", null);
__decorate([
    (0, common_1.Put)('settings'),
    (0, decorators_1.RequirePermission)('qualifications.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildQ))),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(shared_1.aiReviewSettingsSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0, Object]),
    __metadata("design:returntype", void 0)
], AiReviewSettingsController.prototype, "save", null);
exports.AiReviewSettingsController = AiReviewSettingsController = __decorate([
    (0, swagger_1.ApiTags)('applications'),
    (0, common_1.Controller)('application-ai-review'),
    __metadata("design:paramtypes", [ai_review_service_1.AiReviewService])
], AiReviewSettingsController);
/** Integrationsdiagnose im Bot (`/system integrations`): nur ob eingerichtet, Modell und Nutzung – nie der Schlüssel. */
let BotAiReviewController = class BotAiReviewController {
    ai;
    constructor(ai) {
        this.ai = ai;
    }
    status(q) { return this.ai.status(q.guildId ?? null); }
};
exports.BotAiReviewController = BotAiReviewController;
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)('status'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotAiReviewController.prototype, "status", null);
exports.BotAiReviewController = BotAiReviewController = __decorate([
    (0, swagger_1.ApiTags)('bot'),
    (0, common_1.Controller)('bot/ai-review'),
    __metadata("design:paramtypes", [ai_review_service_1.AiReviewService])
], BotAiReviewController);
//# sourceMappingURL=ai-review.controller.js.map