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
exports.BotWelcomeController = exports.WelcomeController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const zod_1 = require("zod");
const welcome_service_1 = require("./welcome.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const guild_context_1 = require("../common/guild-context");
const errors_1 = require("../common/errors");
const sf = zod_1.z.string().regex(/^\d{15,25}$/);
const guildQ = zod_1.z.object({ guildId: sf.optional() });
const memberBody = zod_1.z.object({ guildId: sf, discordId: sf });
/** Admin → Welcome & Goodbye. Server = `guildId` oder der oben gewählte Server; ohne Server die gemeinsame Grundeinstellung. */
let WelcomeController = class WelcomeController {
    s;
    constructor(s) {
        this.s = s;
    }
    config(q) { return this.s.config(q.guildId ?? (0, guild_context_1.currentGuild)()); }
    save(a, q, b) { return this.s.save(a, b, q.guildId ?? (0, guild_context_1.currentGuild)()); }
    /** Test-Nachricht in Discord (gespeicherte Einstellungen, dein Profil als Beispiel-Mitglied). */
    test(a, q, b) { return this.s.test(a, q.guildId ?? (0, guild_context_1.currentGuild)(), b.kind); }
    reset(a, q) {
        const g = q.guildId ?? (0, guild_context_1.currentGuild)();
        if (!g)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Wähle zuerst einen Server.');
        return this.s.reset(a, g);
    }
};
exports.WelcomeController = WelcomeController;
__decorate([
    (0, common_1.Get)('config'),
    (0, decorators_1.RequirePermission)('settings.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], WelcomeController.prototype, "config", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildQ))),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(welcome_service_1.welcomeConfigSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0, Object]),
    __metadata("design:returntype", void 0)
], WelcomeController.prototype, "save", null);
__decorate([
    (0, common_1.Post)('test'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildQ))),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ kind: zod_1.z.enum(['welcome', 'goodbye', 'dm']) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0, Object]),
    __metadata("design:returntype", void 0)
], WelcomeController.prototype, "test", null);
__decorate([
    (0, common_1.Delete)('config'),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], WelcomeController.prototype, "reset", null);
exports.WelcomeController = WelcomeController = __decorate([
    (0, swagger_1.ApiTags)('welcome'),
    (0, common_1.Controller)('welcome'),
    __metadata("design:paramtypes", [welcome_service_1.WelcomeService])
], WelcomeController);
/** Dienstweg des Bots: Einstellungen beim Beitritt lesen, Austritt melden. */
let BotWelcomeController = class BotWelcomeController {
    s;
    constructor(s) {
        this.s = s;
    }
    config(q) { return this.s.config(q.guildId); }
    banner(id) { return this.s.banner(id); }
    memberLeft(b) { return this.s.memberLeft(b.guildId, b.discordId); }
};
exports.BotWelcomeController = BotWelcomeController;
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)('welcome'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ guildId: sf })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BotWelcomeController.prototype, "config", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)('welcome/banner/:id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BotWelcomeController.prototype, "banner", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, throttler_1.Throttle)({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 120, ttl: 60_000 } }),
    (0, common_1.Post)('member-left'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(memberBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotWelcomeController.prototype, "memberLeft", null);
exports.BotWelcomeController = BotWelcomeController = __decorate([
    (0, swagger_1.ApiTags)('bot'),
    (0, common_1.Controller)('bot'),
    __metadata("design:paramtypes", [welcome_service_1.WelcomeService])
], BotWelcomeController);
//# sourceMappingURL=welcome.controller.js.map