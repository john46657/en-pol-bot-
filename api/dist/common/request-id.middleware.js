"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestIdMiddleware = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
let RequestIdMiddleware = class RequestIdMiddleware {
    log = new common_1.Logger('HTTP');
    use(req, res, next) {
        req.requestId = (0, node_crypto_1.randomUUID)();
        res.setHeader('x-request-id', req.requestId);
        const start = process.hrtime.bigint();
        res.on('finish', () => {
            const ms = Number(process.hrtime.bigint() - start) / 1e6;
            // Nur Pfad ohne Query-String; keine Header/Bodies (Secrets!).
            this.log.log(JSON.stringify({ requestId: req.requestId, userId: req.user?.id, method: req.method, route: req.path, status: res.statusCode, ms: Math.round(ms) }));
        });
        next();
    }
};
exports.RequestIdMiddleware = RequestIdMiddleware;
exports.RequestIdMiddleware = RequestIdMiddleware = __decorate([
    (0, common_1.Injectable)()
], RequestIdMiddleware);
//# sourceMappingURL=request-id.middleware.js.map