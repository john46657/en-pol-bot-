/**
 * HTTP-Client für die ER:LC Private Server API (https://apidocs.erlc.gg).
 * - Eine Warteschlange je Server: Anfragen laufen nacheinander, nie parallel.
 * - Rate-Limits: X-RateLimit-* wird ausgewertet; bei 429 wird bis Retry-After NICHTS mehr gesendet (sonst drohen Sperren).
 * - Befehle: eigener Bucket (laut Doku 1 Anfrage / 5 s) – lokal zusätzlich abgesichert.
 * - Zeitlimit je Anfrage; Fehler kommen als Ergebnis zurück (keine Ausnahmen, keine Endlosschleifen).
 * Der Server-Key wird nur im Header `server-key` gesendet und taucht nie in Ergebnissen oder Fehlermeldungen auf.
 */
export type ErlcResult<T> =
  | { ok: true; status: number; data: T; latencyMs: number }
  | { ok: false; status: number; code?: number; message: string; retryAfterMs?: number; latencyMs: number; network?: boolean };

export interface RateState { bucket: string; limit: number | null; remaining: number | null; resetAt: number | null; blockedUntil: number | null }
type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

const COMMAND_SPACING_MS = 5_000;
const TIMEOUT_MS = 10_000;

interface PerServer { chain: Promise<unknown>; buckets: Map<string, RateState>; blockedUntil: number; lastCommandAt: number }

export class ErlcClient {
  private servers = new Map<string, PerServer>();
  constructor(private readonly fetchFn: FetchFn = (u, i) => fetch(u, i), private readonly base = process.env.ERLC_API_BASE || 'https://api.erlc.gg') {}

  private s(id: string): PerServer {
    let x = this.servers.get(id);
    if (!x) { x = { chain: Promise.resolve(), buckets: new Map(), blockedUntil: 0, lastCommandAt: 0 }; this.servers.set(id, x); }
    return x;
  }
  /** Rate-Limit-Stand für die Anzeige im Dashboard. */
  rate(id: string): { blockedUntil: number | null; buckets: RateState[] } {
    const x = this.servers.get(id);
    return { blockedUntil: x && x.blockedUntil > Date.now() ? x.blockedUntil : null, buckets: x ? [...x.buckets.values()] : [] };
  }
  /** Gesperrt bis (ms) – solange keine Anfragen senden. */
  blockedFor(id: string, bucket = 'global'): number {
    const x = this.servers.get(id);
    if (!x) return 0;
    const now = Date.now();
    const b = x.buckets.get(bucket);
    const bucketWait = b && b.remaining === 0 && b.resetAt && b.resetAt > now ? b.resetAt - now : 0;
    const cmdWait = bucket === 'command' ? Math.max(0, x.lastCommandAt + COMMAND_SPACING_MS - now) : 0;
    return Math.max(x.blockedUntil - now, bucketWait, cmdWait, 0);
  }
  forget(id: string) { this.servers.delete(id); }

  fetchServer(id: string, key: string, include: string[]) {
    const qs = include.length ? `?${include.map((k) => `${k}=true`).join('&')}` : '';
    return this.request<Record<string, unknown>>(id, key, 'GET', `/v2/server${qs}`, undefined, 'global');
  }
  runCommand(id: string, key: string, command: string) {
    return this.request<{ message?: string }>(id, key, 'POST', '/v2/server/command', { command }, 'command');
  }

  private request<T>(id: string, key: string, method: string, path: string, body: unknown, bucket: string): Promise<ErlcResult<T>> {
    const x = this.s(id);
    const run = async (): Promise<ErlcResult<T>> => {
      const wait = this.blockedFor(id, bucket);
      // Lieber ablehnen als warten oder blind senden: der Aufrufer plant den nächsten Versuch selbst
      if (wait > 0) return { ok: false, status: 429, code: 4001, message: 'Rate-Limit aktiv – Anfrage zurückgehalten.', retryAfterMs: wait, latencyMs: 0 };
      if (bucket === 'command') x.lastCommandAt = Date.now();
      const started = Date.now();
      let res: Response;
      try {
        res = await this.fetchFn(`${this.base}${path}`, {
          method, headers: { 'server-key': key, Accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (e) {
        const timeout = e instanceof Error && /abort|timeout/i.test(e.name + e.message);
        return { ok: false, status: 0, network: true, message: timeout ? 'Zeitüberschreitung bei der ER:LC-API.' : 'ER:LC-API nicht erreichbar.', latencyMs: Date.now() - started };
      }
      const latencyMs = Date.now() - started;
      this.readRate(x, res, bucket);
      const text = await res.text().catch(() => '');
      let data: unknown; try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
      if (res.ok) return { ok: true, status: res.status, data: (data ?? {}) as T, latencyMs };
      const d = (data ?? {}) as { code?: unknown; message?: unknown; error?: unknown; retry_after?: unknown };
      let retryAfterMs: number | undefined;
      if (res.status === 429) {
        const sec = Number(res.headers.get('retry-after') ?? d.retry_after ?? 5);
        retryAfterMs = Math.max(1000, (Number.isFinite(sec) ? sec : 5) * 1000);
        x.blockedUntil = Date.now() + retryAfterMs;
      }
      const msg = String(d.message ?? d.error ?? res.statusText ?? 'Fehler').slice(0, 300);
      return { ok: false, status: res.status, code: typeof d.code === 'number' ? d.code : undefined, message: scrub(msg, key), retryAfterMs, latencyMs };
    };
    const p = x.chain.then(run, run);
    x.chain = p.catch(() => undefined);
    return p;
  }

  private readRate(x: PerServer, res: Response, fallback: string) {
    const h = (n: string) => res.headers.get(n);
    const bucket = h('x-ratelimit-bucket') ?? fallback;
    const num = (v: string | null) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
    const reset = num(h('x-ratelimit-reset'));
    if (h('x-ratelimit-limit') === null && h('x-ratelimit-remaining') === null) return;
    x.buckets.set(bucket, { bucket, limit: num(h('x-ratelimit-limit')), remaining: num(h('x-ratelimit-remaining')), resetAt: reset ? (reset > 1e12 ? reset : reset * 1000) : null, blockedUntil: x.blockedUntil || null });
  }
}

/** Sicherheitsnetz: den Key niemals in Texten weitergeben, auch wenn die Gegenseite ihn zurückspiegelt. */
export const scrub = (text: string, key: string) => (key && key.length >= 4 ? text.split(key).join('••••') : text);
