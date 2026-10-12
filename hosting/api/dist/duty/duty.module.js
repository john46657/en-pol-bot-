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
exports.DutyModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const activity_interceptor_1 = require("./activity.interceptor");
const duty_controller_1 = require("./duty.controller");
const duty_service_1 = require("./duty.service");
const shifts_1 = require("./shifts");
const weekly_reset_1 = require("./weekly-reset");
let DutyModule = class DutyModule {
    s;
    week;
    timer;
    weekTimer;
    constructor(s, week) {
        this.s = s;
        this.week = week;
    }
    /** Inaktivitäts-Erinnerung jede Minute prüfen; Wochen-Reset beim Start (verpasste nachholen) und alle 30 s – nicht in Tests. */
    onApplicationBootstrap() {
        if (process.env.NODE_ENV === 'test')
            return;
        const log = new common_1.Logger('Duty');
        this.timer = setInterval(() => void this.s.remindTick().then((r) => { if (r.reminded || r.ended)
            log.log(JSON.stringify(r)); }).catch((e) => log.error(e.message)), 60_000);
        this.timer.unref();
        const week = () => void this.week.tick().then((r) => { if (r.archived.length)
            log.log(`Wochen-Reset: ${JSON.stringify(r)}`); }).catch((e) => log.error(`Wochen-Reset: ${e.message}`));
        setTimeout(week, 5_000).unref();
        this.weekTimer = setInterval(week, 30_000);
        this.weekTimer.unref();
    }
    onModuleDestroy() { if (this.timer)
        clearInterval(this.timer); if (this.weekTimer)
        clearInterval(this.weekTimer); }
};
exports.DutyModule = DutyModule;
exports.DutyModule = DutyModule = __decorate([
    (0, common_1.Module)({ controllers: [duty_controller_1.DutyController, shifts_1.ShiftsController, shifts_1.BotShiftsController, weekly_reset_1.WeeklyResetController], providers: [duty_service_1.DutyService, shifts_1.ShiftsService, weekly_reset_1.WeeklyResetService, { provide: core_1.APP_INTERCEPTOR, useClass: activity_interceptor_1.ActivityInterceptor }], exports: [duty_service_1.DutyService, shifts_1.ShiftsService, weekly_reset_1.WeeklyResetService] }),
    __metadata("design:paramtypes", [duty_service_1.DutyService, weekly_reset_1.WeeklyResetService])
], DutyModule);
//# sourceMappingURL=duty.module.js.map