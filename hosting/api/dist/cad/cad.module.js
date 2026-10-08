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
exports.CadModule = void 0;
const common_1 = require("@nestjs/common");
const media_module_1 = require("../media/media.module");
const cad_controller_1 = require("./cad.controller");
const cad_service_1 = require("./cad.service");
const cad_tablet_service_1 = require("./cad-tablet.service");
const cad_config_service_1 = require("./cad-config.service");
const cad_notify_service_1 = require("./cad-notify.service");
const erlc_service_1 = require("./erlc.service");
const erlc_sync_service_1 = require("./erlc-sync.service");
/** CAD-Leitstelle + ER:LC-Integration. Der ER:LC-Abruf läuft ausschließlich hier im Backend. */
let CadModule = class CadModule {
    erlc;
    cad;
    timer;
    purgeTimer;
    running = false;
    constructor(erlc, cad) {
        this.erlc = erlc;
        this.cad = cad;
    }
    /** Planer: jede Sekunde prüfen, welche Server fällig sind (Intervall je Server, Backoff bei Fehlern). Nicht in Tests. */
    onApplicationBootstrap() {
        if (process.env.NODE_ENV === 'test')
            return;
        // Beendete Einsätze nach einem Tag löschen (stündlich prüfen)
        const purgeLog = new common_1.Logger('CAD');
        const purge = () => void this.cad.purgeClosedIncidents().then((n) => { if (n)
            purgeLog.log(`${n} beendete Einsätze gelöscht`); }).catch((e) => purgeLog.error(e.message));
        purge();
        this.purgeTimer = setInterval(purge, 60 * 60_000);
        this.purgeTimer.unref();
        if (process.env.ERLC_POLLING === 'false')
            return;
        const log = new common_1.Logger('ERLC');
        this.timer = setInterval(() => {
            if (this.running)
                return;
            this.running = true;
            void this.erlc.tick().catch((e) => log.error(e.message)).finally(() => { this.running = false; });
        }, 1000);
        this.timer.unref();
    }
    onModuleDestroy() { if (this.timer)
        clearInterval(this.timer); if (this.purgeTimer)
        clearInterval(this.purgeTimer); }
};
exports.CadModule = CadModule;
exports.CadModule = CadModule = __decorate([
    (0, common_1.Module)({
        imports: [media_module_1.MediaModule],
        controllers: [cad_controller_1.CadController, cad_controller_1.ErlcController],
        providers: [cad_service_1.CadService, cad_tablet_service_1.CadTabletService, cad_config_service_1.CadConfigService, cad_notify_service_1.CadNotifyService, erlc_service_1.ErlcService, erlc_sync_service_1.ErlcSyncService],
        exports: [cad_service_1.CadService, cad_config_service_1.CadConfigService, erlc_service_1.ErlcService],
    }),
    __metadata("design:paramtypes", [erlc_service_1.ErlcService, cad_service_1.CadService])
], CadModule);
//# sourceMappingURL=cad.module.js.map