"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrub = exports.ErlcClient = void 0;
const COMMAND_SPACING_MS = 5_000;
const TIMEOUT_MS = 10_000;
class ErlcClient {
    fetchFn;
    base;
    servers = new Map();
    constructor(fetchFn = (u, i) => fetch(u, i), base = process.env.ERLC_API_BASE || 'https://api.erlc.gg') {
        this.fetchFn = fetchFn;
        this.base = base;
    }
    s(id) {
        let x = this.servers.get(id);
        if (!x) {
            x = { chain: Promise.resolve(), buckets: new Map(), blockedUntil: 0, lastCommandAt: 0 };
            this.servers.set(id, x);
        }
        return x;
    }
    /** Rate-Limit-Stand für die Anzeige im Dashboard. */
    rate(id) {
        const x = this.servers.get(id);
        return { blockedUntil: x && x.blockedUntil > Date.now() ? x.blockedUntil : null, buckets: x ? [...x.buckets.values()] : [] };
    }
    /** Gesperrt bis (ms) – solange keine Anfragen senden. */
    blockedFor(id, bucket = 'global') {
        const x = this.servers.get(id);
        if (!x)
            return 0;
        const now = Date.now();
        const b = x.buckets.get(bucket);
        const bucketWait = b && b.remaining === 0 && b.resetAt && b.resetAt > now ? b.resetAt - now : 0;
        const cmdWait = bucket === 'command' ? Math.max(0, x.lastCommandAt + COMMAND_SPACING_MS - now) : 0;
        return Math.max(x.blockedUntil - now, bucketWait, cmdWait, 0);
    }
    /** Neuer Key: Bucket-Stände vergessen, eine laufende Sperre (429/Retry-After) aber behalten. */
    forget(id) { const x = this.servers.get(id); if (x)
        x.buckets.clear(); }
    fetchServer(id, key, include) {
        const qs = include.length ? `?${include.map((k) => `${k}=true`).join('&')}` : '';
        return this.request(id, key, 'GET', `/v2/server${qs}`, undefined, 'global');
    }
    runCommand(id, key, command) {
        return this.request(id, key, 'POST', '/v2/server/command', { command }, 'command');
    }
    request(id, key, method, path, body, bucket) {
        const x = this.s(id);
        const run = async () => {
            const wait = this.blockedFor(id, bucket);
            // Lieber ablehnen als warten oder blind senden: der Aufrufer plant den nächsten Versuch selbst
            if (wait > 0)
                return { ok: false, status: 429, code: 4001, message: 'Rate-Limit aktiv – Anfrage zurückgehalten.', retryAfterMs: wait, latencyMs: 0 };
            if (bucket === 'command')
                x.lastCommandAt = Date.now();
            const started = Date.now();
            let res;
            try {
                res = await this.fetchFn(`${this.base}${path}`, {
                    method, headers: { 'server-key': key, Accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
                    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(TIMEOUT_MS),
                });
            }
            catch (e) {
                const timeout = e instanceof Error && /abort|timeout/i.test(e.name + e.message);
                return { ok: false, status: 0, network: true, message: timeout ? 'Zeitüberschreitung bei der ER:LC-API.' : 'ER:LC-API nicht erreichbar.', latencyMs: Date.now() - started };
            }
            const latencyMs = Date.now() - started;
            this.readRate(x, res, bucket);
            const text = await res.text().catch(() => '');
            let data;
            try {
                data = text ? JSON.parse(text) : undefined;
            }
            catch {
                data = undefined;
            }
            if (res.ok)
                return { ok: true, status: res.status, data: (data ?? {}), latencyMs };
            const d = (data ?? {});
            let retryAfterMs;
            if (res.status === 429) {
                const sec = Number(res.headers.get('retry-after') ?? d.retry_after ?? 5);
                retryAfterMs = Math.max(1000, (Number.isFinite(sec) ? sec : 5) * 1000);
                x.blockedUntil = Date.now() + retryAfterMs;
            }
            const msg = String(d.message ?? d.error ?? res.statusText ?? 'Fehler').slice(0, 300);
            return { ok: false, status: res.status, code: typeof d.code === 'number' ? d.code : undefined, message: (0, exports.scrub)(msg, key), retryAfterMs, latencyMs };
        };
        const p = x.chain.then(run, run);
        x.chain = p.catch(() => undefined);
        return p;
    }
    readRate(x, res, fallback) {
        const h = (n) => res.headers.get(n);
        // Befehle und Abrufe getrennt führen – die Bucket-Namen der API werden dem jeweiligen Aufruf zugeordnet
        const bucket = fallback;
        const num = (v) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
        const reset = num(h('x-ratelimit-reset'));
        if (h('x-ratelimit-limit') === null && h('x-ratelimit-remaining') === null)
            return;
        x.buckets.set(bucket, { bucket, limit: num(h('x-ratelimit-limit')), remaining: num(h('x-ratelimit-remaining')), resetAt: reset ? (reset > 1e12 ? reset : reset * 1000) : null, blockedUntil: x.blockedUntil || null });
    }
}
exports.ErlcClient = ErlcClient;
/** Sicherheitsnetz: den Key niemals in Texten weitergeben, auch wenn die Gegenseite ihn zurückspiegelt. */
const scrub = (text, key) => (key && key.length >= 4 ? text.split(key).join('••••') : text);
exports.scrub = scrub;
//# sourceMappingURL=erlc-client.js.map