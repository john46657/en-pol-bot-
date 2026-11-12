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
exports.IntegrationsModule = void 0;
const common_1 = require("@nestjs/common");
const integrations_controller_1 = require("./integrations.controller");
const monitor_service_1 = require("./monitor.service");
/** Technische Überwachung (global, damit ER:LC-Abruf und Backups Störungen melden können, ohne Modul-Zyklen). */
let IntegrationsModule = class IntegrationsModule {
    monitor;
    timer;
    constructor(monitor) {
        this.monitor = monitor;
    }
    onApplicationBootstrap() {
        if (process.env.NODE_ENV === 'test')
            return;
        const log = new common_1.Logger('Monitor');
        this.timer = setInterval(() => void this.monitor.sweep().catch((e) => log.warn(e.message)), 60_000);
        this.timer.unref();
    }
    onModuleDestroy() { if (this.timer)
        clearInterval(this.timer); }
};
exports.IntegrationsModule = IntegrationsModule;
exports.IntegrationsModule = IntegrationsModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({ controllers: [integrations_controller_1.IntegrationsController], providers: [monitor_service_1.MonitorService], exports: [monitor_service_1.MonitorService] }),
    __metadata("design:paramtypes", [monitor_service_1.MonitorService])
], IntegrationsModule);
//# sourceMappingURL=integrations.module.js.map