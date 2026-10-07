"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OriginMiddleware = void 0;
const common_1 = require("@nestjs/common");
const errors_1 = require("./errors");
const env_1 = require("../config/env");
/** CSRF-Schutz zusätzlich zu SameSite=Strict: mutierende Requests mit Origin-Header müssen von WEB_ORIGIN stammen. */
let OriginMiddleware = class OriginMiddleware {
    allowed = (0, env_1.loadEnv)().WEB_ORIGIN.split(',').map((s) => s.trim());
    sameHost(origin, host) {
        try {
            return !!host && new URL(origin).host === host;
        }
        catch {
            return false;
        }
    }
    use(req, _res, next) {
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method))
            return next();
        const origin = req.headers.origin;
        // Erlaubt: konfigurierte Origins ODER dieselbe Origin wie der aufgerufene Host (same-origin, z. B. Ein-Prozess-Betrieb).
        // Cross-Site-Anfragen tragen die fremde Origin, aber den Ziel-Host → werden abgelehnt.
        if (origin && !this.allowed.includes(origin) && !this.sameHost(origin, req.headers.host))
            throw new errors_1.AppError('ORIGIN_REJECTED', 'Anfragen von dieser Herkunft sind nicht erlaubt.');
        next();
    }
};
exports.OriginMiddleware = OriginMiddleware;
exports.OriginMiddleware = OriginMiddleware = __decorate([
    (0, common_1.Injectable)()
], OriginMiddleware);
//# sourceMappingURL=origin.middleware.js.map