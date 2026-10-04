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
exports.ERLCClient = exports.ERLCError = exports.ERLC_FETCH = void 0;
const common_1 = require("@nestjs/common");
const env_1 = require("../config/env");
exports.ERLC_FETCH = 'ERLC_FETCH';
class ERLCError extends Error {
    kind;
    retryAfterSeconds;
    constructor(kind, message, retryAfterSeconds) {
        super(message);
        this.kind = kind;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
exports.ERLCError = ERLCError;
const num = (v) => (v === null || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));
/** Dünner HTTP-Client für die dokumentierte ER:LC-API (Header `server-key`). Ruft nur Endpunkte auf, die in der Doku stehen. */
let ERLCClient = class ERLCClient {
    env = (0, env_1.loadEnv)();
    doFetch;
    constructor(f) { this.doFetch = f ?? ((u, i) => fetch(u, i)); }
    get configured() { return !!this.env.ERLC_API_KEY; }
    async get(path, opts = {}) {
        if (!this.env.ERLC_API_KEY)
            throw new ERLCError('NOT_CONFIGURED', 'ER:LC API key is not configured.');
        const retries = opts.retries ?? 2;
        let lastErr;
        for (let attempt = 0; attempt <= retries; attempt++) {
            if (attempt > 0)
                await new Promise((r) => setTimeout(r, Math.min(500 * 2 ** (attempt - 1), 4000) + Math.random() * 100)); // exponential backoff + jitter
            const started = Date.now();
            const ctl = new AbortController();
            const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 8000);
            try {
                const res = await this.doFetch(`${this.env.ERLC_BASE_URL}${path}`, { headers: { 'server-key': this.env.ERLC_API_KEY, accept: 'application/json' }, signal: ctl.signal });
                const resetEpoch = num(res.headers.get('x-ratelimit-reset'));
                const rateLimit = { bucket: res.headers.get('x-ratelimit-bucket') ?? undefined, limit: num(res.headers.get('x-ratelimit-limit')), remaining: num(res.headers.get('x-ratelimit-remaining')), resetAt: resetEpoch ? new Date(resetEpoch * 1000) : undefined };
                // Dokumentiert: bei 429 sofort stoppen und Retry-After abwarten – daher KEIN Retry.
                if (res.status === 429)
                    throw new ERLCError('RATE_LIMITED', 'Rate limited by ER:LC.', num(res.headers.get('retry-after')) ?? 60);
                if (res.status === 403 || res.status === 401)
                    throw new ERLCError('UNAUTHORIZED', 'ER:LC rejected the server key.');
                if (res.status >= 500) {
                    lastErr = new ERLCError('UPSTREAM', `ER:LC responded ${res.status}.`);
                    continue;
                }
                if (res.status !== 200)
                    throw new ERLCError('UPSTREAM', `Unexpected ER:LC status ${res.status}.`);
                return { data: (await res.json()), latencyMs: Date.now() - started, rateLimit };
            }
            catch (e) {
                if (e instanceof ERLCError) {
                    if (e.kind === 'UPSTREAM') {
                        lastErr = e;
                        continue;
                    }
                    throw e;
                }
                lastErr = new ERLCError('NETWORK', e instanceof Error && e.name === 'AbortError' ? 'ER:LC request timed out.' : 'ER:LC request failed.');
            }
            finally {
                clearTimeout(timer);
            }
        }
        throw lastErr ?? new ERLCError('UPSTREAM', 'ER:LC request failed.');
    }
};
exports.ERLCClient = ERLCClient;
exports.ERLCClient = ERLCClient = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(0, (0, common_1.Inject)(exports.ERLC_FETCH)),
    __metadata("design:paramtypes", [Function])
], ERLCClient);
//# sourceMappingURL=erlc.client.js.map