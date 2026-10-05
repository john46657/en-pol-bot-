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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const zod_1 = require("zod");
const auth_service_1 = require("./auth.service");
const decorators_1 = require("../authz/decorators");
const guards_1 = require("../authz/guards");
const zod_pipe_1 = require("../common/zod.pipe");
const env_1 = require("../config/env");
const loginSchema = zod_1.z.object({ username: zod_1.z.string().min(1).max(64), password: zod_1.z.string().min(1).max(256) });
let AuthController = class AuthController {
    auth;
    env = (0, env_1.loadEnv)();
    constructor(auth) {
        this.auth = auth;
    }
    async login(body, req, res) {
        const r = await this.auth.login(body.username, body.password, { ip: req.ip, userAgent: req.headers['user-agent'], requestId: req.requestId });
        res.cookie(guards_1.SESSION_COOKIE, r.token, { httpOnly: true, sameSite: 'strict', secure: this.env.COOKIE_SECURE ? this.env.COOKIE_SECURE === 'true' : this.env.NODE_ENV === 'production', expires: r.expiresAt, path: '/' });
        return r.user;
    }
    async logout(user, actor, res) {
        await this.auth.logout(actor, user.sessionId);
        res.clearCookie(guards_1.SESSION_COOKIE, { path: '/' });
    }
    me(user) {
        return this.auth.profile(user.id);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, decorators_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : (0, env_1.loadEnv)().LOGIN_RATE_LIMIT, ttl: 60_000 } }),
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(loginSchema))),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, decorators_1.CurrentActor)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Get)('me'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "me", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map