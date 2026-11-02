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
exports.ShiftPlanModule = void 0;
const common_1 = require("@nestjs/common");
const shiftplan_controller_1 = require("./shiftplan.controller");
const shiftplan_service_1 = require("./shiftplan.service");
let ShiftPlanModule = class ShiftPlanModule {
    s;
    timer;
    constructor(s) {
        this.s = s;
    }
    /** Jede Minute: vergangene Schichten abschließen, Erinnerungen vor Schichtbeginn – nicht in Tests. Zeiten liegen in der DB → übersteht Neustarts. */
    onApplicationBootstrap() {
        if (process.env.NODE_ENV === 'test')
            return;
        const log = new common_1.Logger('ShiftPlan');
        this.timer = setInterval(() => void this.s.tick().then((r) => { if (r.completed || r.reminded)
            log.log(JSON.stringify(r)); }).catch((e) => log.error(e.message)), 60_000);
        this.timer.unref();
    }
    onModuleDestroy() { if (this.timer)
        clearInterval(this.timer); }
};
exports.ShiftPlanModule = ShiftPlanModule;
exports.ShiftPlanModule = ShiftPlanModule = __decorate([
    (0, common_1.Module)({ controllers: [shiftplan_controller_1.ShiftPlanController], providers: [shiftplan_service_1.ShiftPlanService], exports: [shiftplan_service_1.ShiftPlanService] }),
    __metadata("design:paramtypes", [shiftplan_service_1.ShiftPlanService])
], ShiftPlanModule);
//# sourceMappingURL=shiftplan.module.js.map