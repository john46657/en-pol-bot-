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
exports.ActivityInterceptor = void 0;
const common_1 = require("@nestjs/common");
const duty_service_1 = require("./duty.service");
/**
 * Jede Aktion (alles außer reinem Lesen) zählt als Aktivität für die Inaktivitäts-Erinnerung – im Dashboard/MDT wie per Discord-Befehl.
 * Reines Lesen nicht, weil das Dashboard sich alle paar Sekunden selbst aktualisiert; dafür meldet es echte Klicks/Eingaben separat.
 */
let ActivityInterceptor = class ActivityInterceptor {
    duty;
    constructor(duty) {
        this.duty = duty;
    }
    intercept(ctx, next) {
        if (ctx.getType() === 'http') {
            const req = ctx.switchToHttp().getRequest();
            if (req.user?.id && req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS')
                void this.duty.touch(req.user.id);
        }
        return next.handle();
    }
};
exports.ActivityInterceptor = ActivityInterceptor;
exports.ActivityInterceptor = ActivityInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [duty_service_1.DutyService])
], ActivityInterceptor);
//# sourceMappingURL=activity.interceptor.js.map