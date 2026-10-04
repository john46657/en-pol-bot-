import { Redis } from 'ioredis';

/**
 * Rate Limiting (Fixed Window). Standard: Speicher im Prozess; mit `REDIS_URL` gemeinsam für mehrere API-Instanzen.
 * Fällt Redis aus, wird **nicht** blockiert, sondern auf den lokalen Zähler zurückgefallen (Verfügbarkeit vor Strenge).
 */
export interface RateStore {
  /** Zählt einen Treffer und liefert (Anzahl im Fenster, ms bis Fensterende). */
  hit(key: string, windowMs: number): Promise<{ count: number; resetMs: number }>;
}

export class MemoryStore implements RateStore {
  private readonly map = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly now: () => number = Date.now) {}

  async hit(key: string, windowMs: number) {
    const t = this.now();
    let e = this.map.get(key);
    if (!e || e.resetAt <= t) {
      e = { count: 0, resetAt: t + windowMs };
      this.map.set(key, e);
      if (this.map.size > 50_000)
        for (const [k, v] of this.map) if (v.resetAt <= t) this.map.delete(k); // Aufräumen
    }
    e.count++;
    return { count: e.count, resetMs: e.resetAt - t };
  }
}

export class RedisStore implements RateStore {
  private readonly redis: Redis;
  private readonly fallback = new MemoryStore();
  constructor(url: string) {
    this.redis = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
    this.redis.on('error', () => undefined);
  }
  async hit(key: string, windowMs: number) {
    try {
      const k = `nexus:rl:${key}`;
      const count = await this.redis.incr(k);
      if (count === 1) await this.redis.pexpire(k, windowMs);
      const ttl = await this.redis.pttl(k);
      return { count, resetMs: ttl > 0 ? ttl : windowMs };
    } catch {
      return this.fallback.hit(key, windowMs);
    }
  }
}

export interface Rule {
  name: string;
  limit: number;
  windowMs: number;
  /** Trifft die Regel auf diese Anfrage zu? */
  match(method: string, path: string): boolean;
  /** `user` = angemeldeter Benutzer (sonst IP), `ip` = immer IP. */
  by: 'user' | 'ip';
}

const MIN = 60_000;
/** Regeln: spezifische zuerst (alle zutreffenden zählen, die strengste entscheidet). */
export const RULES: readonly Rule[] = [
  {
    name: 'auth',
    limit: 30,
    windowMs: MIN,
    by: 'ip',
    match: (_m, p) => p.startsWith('/api/v1/auth/') && !p.startsWith('/api/v1/auth/me'),
  }, // Anmeldung/Callback streng; „wer bin ich“ fragt jede Seite ab (fällt unter „all“)
  {
    name: 'export',
    limit: 10,
    windowMs: 10 * MIN,
    by: 'user',
    match: (_m, p) => p.endsWith('/export'),
  },
  {
    name: 'write',
    limit: 120,
    windowMs: MIN,
    by: 'user',
    match: (m) => m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS',
  },
  { name: 'all', limit: 600, windowMs: MIN, by: 'user', match: () => true },
];

export interface Decision {
  allowed: boolean;
  /** Strengste betroffene Regel (für Header). */
  rule: string;
  limit: number;
  remaining: number;
  retryAfterSec: number;
}

export async function decide(
  store: RateStore,
  req: { method: string; path: string; ip: string; userId?: string | undefined },
): Promise<Decision> {
  let worst: Decision = {
    allowed: true,
    rule: 'all',
    limit: Infinity,
    remaining: Infinity,
    retryAfterSec: 0,
  };
  for (const rule of RULES) {
    if (!rule.match(req.method.toUpperCase(), req.path)) continue;
    const id = rule.by === 'user' && req.userId ? `u:${req.userId}` : `ip:${req.ip}`;
    const { count, resetMs } = await store.hit(`${rule.name}:${id}`, rule.windowMs);
    const remaining = Math.max(0, rule.limit - count);
    const d: Decision = {
      allowed: count <= rule.limit,
      rule: rule.name,
      limit: rule.limit,
      remaining,
      retryAfterSec: Math.ceil(resetMs / 1000),
    };
    if (!d.allowed || remaining < worst.remaining) worst = d;
    if (!d.allowed) return d;
  }
  return worst;
}
