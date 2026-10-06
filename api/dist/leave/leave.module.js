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
exports.LeaveModule = void 0;
const common_1 = require("@nestjs/common");
const leave_controller_1 = require("./leave.controller");
const leave_service_1 = require("./leave.service");
let LeaveModule = class LeaveModule {
    s;
    timer;
    constructor(s) {
        this.s = s;
    }
    /** Beginn/Ende der Abmeldungen jede Minute prüfen (Rolle vergeben/entfernen) – nicht in Tests. */
    onApplicationBootstrap() {
        if (process.env.NODE_ENV === 'test')
            return;
        const log = new common_1.Logger('Leave');
        this.timer = setInterval(() => void this.s.tick().then((r) => { if (r.started || r.ended)
            log.log(JSON.stringify(r)); }).catch((e) => log.error(e.message)), 60_000);
        this.timer.unref();
    }
    onModuleDestroy() { if (this.timer)
        clearInterval(this.timer); }
};
exports.LeaveModule = LeaveModule;
exports.LeaveModule = LeaveModule = __decorate([
    (0, common_1.Module)({ controllers: [leave_controller_1.LeaveController], providers: [leave_service_1.LeaveService], exports: [leave_service_1.LeaveService] }),
    __metadata("design:paramtypes", [leave_service_1.LeaveService])
], LeaveModule);
//# sourceMappingURL=leave.module.js.map