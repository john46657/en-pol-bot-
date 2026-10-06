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
exports.BotQualificationsController = exports.QualificationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const qualifications_service_1 = require("./qualifications.service");
const qualifications_config_1 = require("./qualifications.config");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const discordId = zod_1.z.string().regex(/^\d{15,25}$/);
const list = zod_1.z.object({ unit: zod_1.z.string().max(24).optional(), status: zod_1.z.enum(['OPEN', 'ACCEPTED', 'REJECTED']).optional(), guildId: zod_1.z.string().regex(/^\d{15,25}$/).optional() });
const decision = zod_1.z.object({ status: zod_1.z.enum(['ACCEPTED', 'REJECTED']), reason: zod_1.z.string().trim().max(1000).optional() });
const historyQ = zod_1.z.object({ discordId });
const submit = zod_1.z.object({ guildId: zod_1.z.string().regex(/^\d{15,25}$/).optional(), unit: zod_1.z.string().max(24), discordId, discordName: zod_1.z.string().trim().min(1).max(100), durationSec: zod_1.z.number().int().min(0).max(86_400).optional(), joinedAt: zod_1.z.coerce.date().optional(), answers: zod_1.z.array(zod_1.z.object({ question: zod_1.z.string().max(300), answer: zod_1.z.union([zod_1.z.string().max(5000), zod_1.z.array(zod_1.z.string().max(100)).max(25)]).nullable() })).min(1).max(50) });
const openQ = zod_1.z.object({ discordId, unit: zod_1.z.string().max(24).optional() });
const guildQ = zod_1.z.object({ guildId: zod_1.z.string().regex(/^\d{15,25}$/).optional() });
const guildRequired = zod_1.z.object({ guildId: zod_1.z.string().regex(/^\d{15,25}$/) });
let QualificationsController = class QualificationsController {
    q;
    constructor(q) {
        this.q = q;
    }
    /** Panels, Einheiten und die Fragen der Polizei-Bewerbung (`policeForm`). */
    /** `?guildId=` – Einstellungen eines Servers (ohne eigene: die gemeinsamen, `own: false`). */
    config(q) { return this.q.setup(q.guildId); }
    save(a, q, b) { return this.q.saveConfig(a, b, q.guildId); }
    /** Eigene Einstellungen eines Servers entfernen (zurück zur gemeinsamen Grundeinstellung). */
    reset(a, q) { return this.q.resetGuild(a, q.guildId); }
    list(f) { return this.q.list(f); }
    history(q) { return this.q.history(q.discordId); }
    get(id) { return this.q.get(id); }
    /** Auch vom Bot (Button im Team-Channel) mit den Rechten des klickenden Benutzers. */
    decide(a, id, b) { return this.q.decide(a, id, b.status, b.reason); }
};
exports.QualificationsController = QualificationsController;
__decorate([
    (0, common_1.Get)('config'),
    (0, decorators_1.RequirePermission)('qualifications.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], QualificationsController.prototype, "config", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, decorators_1.RequirePermission)('qualifications.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildQ))),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(qualifications_config_1.saveSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0, void 0]),
    __metadata("design:returntype", void 0)
], QualificationsController.prototype, "save", null);
__decorate([
    (0, common_1.Delete)('config'),
    (0, decorators_1.RequirePermission)('qualifications.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildRequired))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], QualificationsController.prototype, "reset", null);
__decorate([
    (0, common_1.Get)('applications'),
    (0, decorators_1.RequirePermission)('qualifications.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(list))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], QualificationsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('history'),
    (0, decorators_1.RequirePermission)('qualifications.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(historyQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], QualificationsController.prototype, "history", null);
__decorate([
    (0, common_1.Get)('applications/:id'),
    (0, decorators_1.RequirePermission)('qualifications.view'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], QualificationsController.prototype, "get", null);
__decorate([
    (0, common_1.Post)('applications/:id/decision'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('qualifications.decide'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(decision))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], QualificationsController.prototype, "decide", null);
exports.QualificationsController = QualificationsController = __decorate([
    (0, swagger_1.ApiTags)('qualifications'),
    (0, common_1.Controller)('qualifications'),
    __metadata("design:paramtypes", [qualifications_service_1.QualificationsService])
], QualificationsController);
/** Dienst-Endpunkte für das Discord-Panel – Bewerben geht auch ohne verknüpftes Konto. */
let BotQualificationsController = class BotQualificationsController {
    q;
    constructor(q) {
        this.q = q;
    }
    config(q) { return this.q.config(q.guildId); }
    open(f) { return this.q.openFor(f.discordId, f.unit); }
    submit(b) { return this.q.submit(b); }
};
exports.BotQualificationsController = BotQualificationsController;
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotQualificationsController.prototype, "config", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)('open'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(openQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotQualificationsController.prototype, "open", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('applications'),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(submit))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotQualificationsController.prototype, "submit", null);
exports.BotQualificationsController = BotQualificationsController = __decorate([
    (0, swagger_1.ApiTags)('bot'),
    (0, common_1.Controller)('bot/qualifications'),
    __metadata("design:paramtypes", [qualifications_service_1.QualificationsService])
], BotQualificationsController);
//# sourceMappingURL=qualifications.controller.js.map