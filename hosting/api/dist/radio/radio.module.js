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
exports.RadioModule = void 0;
const common_1 = require("@nestjs/common");
const radio_controller_1 = require("./radio.controller");
const radio_whitelist_service_1 = require("./radio-whitelist.service");
/** Funk-Whitelist (externer Funkdienst). Jede Minute: abgelaufene Freigaben und Sperrfristen speichern. */
let RadioModule = class RadioModule {
    s;
    timer;
    constructor(s) {
        this.s = s;
    }
    onModuleInit() {
        if (process.env.NODE_ENV === 'test')
            return; // Tests rufen tick() gezielt auf
        const log = new common_1.Logger('RadioWhitelist');
        const run = () => void this.s.tick().then((r) => { if (r.expired || r.unsuspended)
            log.log(JSON.stringify(r)); }).catch((e) => log.error(e.message));
        this.timer = setInterval(run, 60_000);
        this.timer.unref();
        setTimeout(run, 5_000).unref(); // nach einem Neustart verpasste Abläufe sofort nachholen
    }
    onModuleDestroy() { if (this.timer)
        clearInterval(this.timer); }
};
exports.RadioModule = RadioModule;
exports.RadioModule = RadioModule = __decorate([
    (0, common_1.Module)({ controllers: [radio_controller_1.RadioWhitelistController, radio_controller_1.RadioWhitelistBotController], providers: [radio_whitelist_service_1.RadioWhitelistService], exports: [radio_whitelist_service_1.RadioWhitelistService] }),
    __metadata("design:paramtypes", [radio_whitelist_service_1.RadioWhitelistService])
], RadioModule);
//# sourceMappingURL=radio.module.js.map