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
exports.GalaxyClient = exports.GALAXY_FETCH = void 0;
const common_1 = require("@nestjs/common");
const env_1 = require("../config/env");
const errors_1 = require("../common/errors");
exports.GALAXY_FETCH = 'GALAXY_FETCH';
/** Minimaler Claude-Messages-Client. Ohne AI_API_KEY ist Galaxy AI schlicht UNAVAILABLE (keine Fake-Antworten). */
let GalaxyClient = class GalaxyClient {
    env = (0, env_1.loadEnv)();
    doFetch;
    constructor(f) { this.doFetch = f ?? ((u, i) => fetch(u, i)); }
    get enabled() { return !!this.env.AI_API_KEY; }
    async complete(system, user) {
        if (!this.env.AI_API_KEY)
            throw new errors_1.AppError('CAPABILITY_UNAVAILABLE', 'Galaxy AI is not configured.');
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 30_000);
        try {
            const res = await this.doFetch(`${this.env.AI_BASE_URL}/v1/messages`, {
                method: 'POST', signal: ctl.signal,
                headers: { 'content-type': 'application/json', 'x-api-key': this.env.AI_API_KEY, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify({ model: this.env.AI_MODEL, max_tokens: 1024, system, messages: [{ role: 'user', content: user }] }),
            });
            if (res.status !== 200)
                throw new errors_1.AppError('CAPABILITY_UNAVAILABLE', 'Galaxy AI provider error.', { status: res.status });
            const body = (await res.json());
            const text = body.content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n').trim();
            if (!text)
                throw new errors_1.AppError('CAPABILITY_UNAVAILABLE', 'Galaxy AI returned no content.');
            return text;
        }
        catch (e) {
            if (e instanceof errors_1.AppError)
                throw e;
            throw new errors_1.AppError('CAPABILITY_UNAVAILABLE', 'Galaxy AI request failed.');
        }
        finally {
            clearTimeout(t);
        }
    }
};
exports.GalaxyClient = GalaxyClient;
exports.GalaxyClient = GalaxyClient = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(0, (0, common_1.Inject)(exports.GALAXY_FETCH)),
    __metadata("design:paramtypes", [Function])
], GalaxyClient);
//# sourceMappingURL=galaxy.client.js.map