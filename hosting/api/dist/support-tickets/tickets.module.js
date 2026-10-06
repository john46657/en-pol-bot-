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
exports.SupportTicketsModule = void 0;
const common_1 = require("@nestjs/common");
const tickets_controller_1 = require("./tickets.controller");
const tickets_service_1 = require("./tickets.service");
const config_service_1 = require("./config.service");
let SupportTicketsModule = class SupportTicketsModule {
    s;
    timer;
    constructor(s) {
        this.s = s;
    }
    /** Automatik (Auto-Schließen, Löschen, befristeter Zugriff) jede Minute – nicht in Tests. */
    onApplicationBootstrap() {
        if (process.env.NODE_ENV === 'test')
            return;
        const log = new common_1.Logger('TicketAutomation');
        this.timer = setInterval(() => void this.s.runAutomation().then((r) => { if (r.closed || r.deleted || r.warned || r.expired)
            log.log(JSON.stringify(r)); }).catch((e) => log.error(e.message)), 60_000);
        this.timer.unref();
    }
    onModuleDestroy() { if (this.timer)
        clearInterval(this.timer); }
};
exports.SupportTicketsModule = SupportTicketsModule;
exports.SupportTicketsModule = SupportTicketsModule = __decorate([
    (0, common_1.Module)({ controllers: [tickets_controller_1.SupportTicketsController, tickets_controller_1.BotSupportTicketsController], providers: [tickets_service_1.SupportTicketsService, config_service_1.TicketConfigService], exports: [tickets_service_1.SupportTicketsService] }),
    __metadata("design:paramtypes", [tickets_service_1.SupportTicketsService])
], SupportTicketsModule);
//# sourceMappingURL=tickets.module.js.map