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
exports.BotRemindersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const reminders_service_1 = require("./reminders.service");
const sf = zod_1.z.string().regex(/^\d{15,25}$/);
const create = zod_1.z.object({ discordId: sf, guildId: sf.nullish(), channelId: sf.nullish(), text: zod_1.z.string().max(shared_1.REMINDER_TEXT_MAX * 2), dm: zod_1.z.boolean(), delayMs: zod_1.z.number().int().min(shared_1.REMINDER_MIN_MS).max(shared_1.REMINDER_MAX_MS) });
const who = zod_1.z.object({ discordId: sf });
const snooze = zod_1.z.object({ discordId: sf, fire: zod_1.z.number().int().min(1), minutes: zod_1.z.number().int() });
const done = zod_1.z.object({ discordId: sf, fire: zod_1.z.number().int().min(1) });
/** Erinnerungen für den Bot (`/remind-me`, `/erinnerungen`, Buttons) – ohne verknüpftes Konto nutzbar, immer nur die eigenen. */
let BotRemindersController = class BotRemindersController {
    r;
    constructor(r) {
        this.r = r;
    }
    create(b) { return this.r.create(b); }
    list(q) { return this.r.list(q.discordId); }
    cancel(id, q) { return this.r.cancel(id, q.discordId); }
    snooze(id, b) { return this.r.snooze(id, b.discordId, b.fire, b.minutes); }
    done(id, b) { return this.r.done(id, b.discordId, b.fire); }
};
exports.BotRemindersController = BotRemindersController;
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(create))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotRemindersController.prototype, "create", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(who))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotRemindersController.prototype, "list", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(who))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0]),
    __metadata("design:returntype", void 0)
], BotRemindersController.prototype, "cancel", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)(':id/snooze'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(snooze))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0]),
    __metadata("design:returntype", void 0)
], BotRemindersController.prototype, "snooze", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)(':id/done'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(done))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0]),
    __metadata("design:returntype", void 0)
], BotRemindersController.prototype, "done", null);
exports.BotRemindersController = BotRemindersController = __decorate([
    (0, swagger_1.ApiTags)('bot'),
    (0, common_1.Controller)('bot/reminders'),
    __metadata("design:paramtypes", [reminders_service_1.RemindersService])
], BotRemindersController);
//# sourceMappingURL=reminders.controller.js.map