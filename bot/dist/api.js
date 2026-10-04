"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpApi = exports.BotApiError = void 0;
/** Fehler der System-API (mit Request-ID, ohne Stacktrace). */
class BotApiError extends Error {
    status;
    code;
    requestId;
    reason;
    constructor(status, code, message, requestId, reason) {
        super(message);
        this.status = status;
        this.code = code;
        this.requestId = requestId;
        this.reason = reason;
    }
}
exports.BotApiError = BotApiError;
class HttpApi {
    baseUrl;
    token;
    doFetch;
    constructor(baseUrl, token, doFetch = fetch) {
        this.baseUrl = baseUrl;
        this.token = token;
        this.doFetch = doFetch;
    }
    async call(method, path, discordId, body) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 10_000);
        try {
            const res = await this.doFetch(`${this.baseUrl}/api/v1${path}`, {
                method, signal: ctl.signal,
                headers: { authorization: `Bot ${this.token}`, ...(discordId ? { 'x-discord-user': discordId } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
                body: body ? JSON.stringify(body) : undefined,
            });
            const text = await res.text();
            let json;
            try {
                json = text ? JSON.parse(text) : undefined;
            }
            catch {
                json = undefined;
            }
            if (res.status >= 400) {
                const details = json?.details;
                throw new BotApiError(res.status, String(json?.code ?? 'ERROR'), String(json?.message ?? `HTTP ${res.status}`), json?.requestId, details?.reason);
            }
            return json;
        }
        catch (e) {
            if (e instanceof BotApiError)
                throw e;
            throw new BotApiError(0, 'UNREACHABLE', 'The EN Polizei API is not reachable.');
        }
        finally {
            clearTimeout(timer);
        }
    }
    asUser(discordId, method, path, body) { return this.call(method, path, discordId, body); }
    service(method, path, body) { return this.call(method, path, null, body); }
}
exports.HttpApi = HttpApi;
//# sourceMappingURL=api.js.map