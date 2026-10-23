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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemindersModule = void 0;
const common_1 = require("@nestjs/common");
const reminders_controller_1 = require("./reminders.controller");
const reminders_service_1 = require("./reminders.service");
let RemindersModule = class RemindersModule {
    s;
    timer;
    constructor(s) {
        this.s = s;
    }
    /** Fällige Erinnerungen alle 15 s übergeben (beim Start sofort: verpasste nachholen) – nicht in Tests. */
    onApplicationBootstrap() {
        if (process.env.NODE_ENV === 'test')
            return;
        const log = new common_1.Logger('Reminders');
        const run = () => void this.s.tick().then((r) => { if (r.sent)
            log.log(`${r.sent} Erinnerung(en) übergeben`); }).catch((e) => log.error(e.message));
        setTimeout(run, 5_000).unref();
        this.timer = setInterval(run, 15_000);
        this.timer.unref();
    }
    onModuleDestroy() { if (this.timer)
        clearInterval(this.timer); }
};
exports.RemindersModule = RemindersModule;
exports.RemindersModule = RemindersModule = __decorate([
    (0, common_1.Module)({ controllers: [reminders_controller_1.BotRemindersController], providers: [reminders_service_1.RemindersService], exports: [reminders_service_1.RemindersService] }),
    __metadata("design:paramtypes", [reminders_service_1.RemindersService])
], RemindersModule);
//# sourceMappingURL=reminders.module.js.map