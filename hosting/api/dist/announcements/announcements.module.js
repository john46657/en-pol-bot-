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
exports.AnnouncementsModule = void 0;
const common_1 = require("@nestjs/common");
const announcements_controller_1 = require("./announcements.controller");
const announcements_service_1 = require("./announcements.service");
let AnnouncementsModule = class AnnouncementsModule {
    s;
    timer;
    constructor(s) {
        this.s = s;
    }
    /** Jede Minute geplante/wiederkehrende Ankündigungen veröffentlichen – nicht in Tests. Zeitpunkte liegen in der DB → übersteht Neustarts. */
    onApplicationBootstrap() {
        if (process.env.NODE_ENV === 'test')
            return;
        const log = new common_1.Logger('Announcements');
        this.timer = setInterval(() => void this.s.tick().then((r) => { if (r.published)
            log.log(JSON.stringify(r)); }).catch((e) => log.error(e.message)), 60_000);
        this.timer.unref();
    }
    onModuleDestroy() { if (this.timer)
        clearInterval(this.timer); }
};
exports.AnnouncementsModule = AnnouncementsModule;
exports.AnnouncementsModule = AnnouncementsModule = __decorate([
    (0, common_1.Module)({ controllers: [announcements_controller_1.AnnouncementsController], providers: [announcements_service_1.AnnouncementsService], exports: [announcements_service_1.AnnouncementsService] }),
    __metadata("design:paramtypes", [announcements_service_1.AnnouncementsService])
], AnnouncementsModule);
//# sourceMappingURL=announcements.module.js.map