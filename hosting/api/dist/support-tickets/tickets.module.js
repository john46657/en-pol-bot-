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
const transcript_service_1 = require("./transcript.service");
let SupportTicketsModule = class SupportTicketsModule {
    s;
    transcripts;
    timers = [];
    constructor(s, transcripts) {
        this.s = s;
        this.transcripts = transcripts;
    }
    /**
     * Automatik (Auto-Schließen, Löschen, befristeter Zugriff, SLA, Eskalation) jede Minute; Transkript-Aufträge alle 15 Sekunden
     * (nach einem Neustart werden offene und abgebrochene Aufträge dabei automatisch fortgesetzt) – nicht in Tests.
     */
    onApplicationBootstrap() {
        if (process.env.NODE_ENV === 'test')
            return;
        const log = new common_1.Logger('TicketAutomation');
        this.timers.push(setInterval(() => void this.s.runAutomation().then((r) => { if (r.closed || r.deleted || r.warned || r.expired || r.reminded || r.escalated)
            log.log(JSON.stringify(r)); }).catch((e) => log.error(e.message)), 60_000));
        this.timers.push(setInterval(() => void this.transcripts.processDue().then((r) => { if (r.done || r.failed)
            log.log(`transcripts ${JSON.stringify(r)}`); }).catch((e) => log.error(`transcripts: ${e.message}`)), 15_000));
        for (const t of this.timers)
            t.unref();
    }
    onModuleDestroy() { for (const t of this.timers)
        clearInterval(t); }
};
exports.SupportTicketsModule = SupportTicketsModule;
exports.SupportTicketsModule = SupportTicketsModule = __decorate([
    (0, common_1.Module)({ controllers: [tickets_controller_1.SupportTicketsController, tickets_controller_1.BotSupportTicketsController], providers: [tickets_service_1.SupportTicketsService, config_service_1.TicketConfigService, transcript_service_1.TicketTranscriptService], exports: [tickets_service_1.SupportTicketsService] }),
    __metadata("design:paramtypes", [tickets_service_1.SupportTicketsService, transcript_service_1.TicketTranscriptService])
], SupportTicketsModule);
//# sourceMappingURL=tickets.module.js.map