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
exports.CalendarModule = void 0;
const common_1 = require("@nestjs/common");
const calendar_controller_1 = require("./calendar.controller");
const calendar_service_1 = require("./calendar.service");
const meetings_service_1 = require("./meetings.service");
let CalendarModule = class CalendarModule {
    s;
    timer;
    constructor(s) {
        this.s = s;
    }
    /** Jede Minute Erinnerungen und Abschluss vergangener Termine – nicht in Tests. */
    onApplicationBootstrap() {
        if (process.env.NODE_ENV === 'test')
            return;
        const log = new common_1.Logger('Calendar');
        this.timer = setInterval(() => void this.s.tick().then((r) => { if (r.completed || r.reminded)
            log.log(JSON.stringify(r)); }).catch((e) => log.error(e.message)), 60_000);
        this.timer.unref();
    }
    onModuleDestroy() { if (this.timer)
        clearInterval(this.timer); }
};
exports.CalendarModule = CalendarModule;
exports.CalendarModule = CalendarModule = __decorate([
    (0, common_1.Module)({ controllers: [calendar_controller_1.CalendarController, calendar_controller_1.MeetingsController], providers: [calendar_service_1.CalendarService, meetings_service_1.MeetingsService], exports: [calendar_service_1.CalendarService, meetings_service_1.MeetingsService] }),
    __metadata("design:paramtypes", [calendar_service_1.CalendarService])
], CalendarModule);
//# sourceMappingURL=calendar.module.js.map