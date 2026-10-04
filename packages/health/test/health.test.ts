import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { HEARTBEAT_TTL_S, checkHealth, renderHealth, writeHeartbeat, type KeyValue } from '../src/index.js';

const NOW = new Date('2026-10-04T12:00:00Z');
const memory = (): KeyValue & { data: Map<string, string>; down?: boolean } => {
  const data = new Map<string, string>();
  const self = {
    data,
    down: false,
    get: async (k: string) => (self.down ? Promise.reject(new Error('x')) : (data.get(k) ?? null)),
    set: async (k: string, v: string) => void data.set(k, v),
    ping: async () => (self.down ? Promise.reject(new Error('x')) : 'PONG'),
  };
  return self;
};
const ok = async () => 1;
const at = (s: number) => new Date(NOW.getTime() - s * 1000);

describe('checkHealth', () => {
  it('alles aktiv → up; Discord kommt aus dem Bot-Herzschlag', async () => {
    const kv = memory();
    await writeHeartbeat(kv, 'bot', { ready: true, ping: 40 }, 'nexus', at(10));
    await writeHeartbeat(kv, 'worker', undefined, 'nexus', at(20));
    const r = await checkHealth({ database: ok, redis: kv, now: NOW });
    expect(r.status).toBe('up');
    expect(Object.values(r.components).map((c) => c.state)).toEqual(['up', 'up', 'up', 'up', 'up', 'up']);
    expect(r.components.discord.detail).toContain('40 ms');
  });

  it('Datenbank down ⇒ gesamt down; ohne Bot/Worker ⇒ eingeschränkt, nicht down', async () => {
    const kv = memory();
    expect((await checkHealth({ database: async () => { throw new Error('geheim: postgres://user:pw@host'); }, redis: kv, now: NOW })).status).toBe('down');
    const r = await checkHealth({ database: ok, redis: kv, now: NOW });
    expect(r.status).toBe('degraded');
    expect(r.components.bot.state).toBe('down');
    expect(r.components.workers.state).toBe('down');
    expect(r.components.discord.state).toBe('down');
  });

  it('verspäteter Herzschlag ⇒ degraded; Bot nicht mit Discord verbunden / langsam', async () => {
    const kv = memory();
    await writeHeartbeat(kv, 'bot', { ready: false }, 'nexus', at(100));
    await writeHeartbeat(kv, 'worker', undefined, 'nexus', at(5));
    let r = await checkHealth({ database: ok, redis: kv, now: NOW });
    expect(r.components.bot.state).toBe('degraded');
    expect(r.components.discord).toMatchObject({ state: 'down' });
    await writeHeartbeat(kv, 'bot', { ready: true, ping: 3000 }, 'nexus', at(5));
    r = await checkHealth({ database: ok, redis: kv, now: NOW });
    expect(r.components.discord.state).toBe('degraded');
  });

  it('Redis down oder nicht konfiguriert ⇒ degraded (API läuft ohne Redis weiter); hängende Prüfung läuft in den Timeout', async () => {
    const kv = memory();
    kv.down = true;
    const r = await checkHealth({ database: ok, redis: kv, now: NOW });
    expect(r.status).toBe('degraded');
    expect(r.components.redis.state).toBe('down');
    expect((await checkHealth({ database: ok, redis: null, now: NOW })).components.redis.detail).toBe('nicht konfiguriert');
    const t = Date.now();
    const slow = await checkHealth({ database: () => new Promise(() => undefined), redis: null, now: NOW, timeoutMs: 50 });
    expect(slow.status).toBe('down');
    expect(Date.now() - t).toBeLessThan(1000);
  });

  it('Ausgabe enthält keine Fehlertexte/Geheimnisse und zeigt die Symbole', async () => {
    const r = await checkHealth({ database: async () => { throw new Error('postgres://user:pw@host'); }, redis: null, now: NOW });
    const text = renderHealth(r) + JSON.stringify(r);
    expect(text).not.toContain('pw@host');
    expect(renderHealth(r)).toContain('🔴 Datenbank');
    expect(renderHealth(r)).toContain('🟢 API');
  });
});

describe('Herzschlag in echtem Redis', () => {
  const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
  afterAll(async () => { await redis.del('healthtest:health:bot'); redis.disconnect(); });
  it('wird geschrieben, läuft per TTL ab und wird gelesen', async () => {
    try { await redis.connect(); } catch { return; } // ohne Redis überspringen
    await writeHeartbeat(redis, 'bot', { ready: true, ping: 1 }, 'healthtest');
    expect(await redis.ttl('healthtest:health:bot')).toBeGreaterThan(HEARTBEAT_TTL_S - 5);
    const r = await checkHealth({ database: ok, redis, prefix: 'healthtest' });
    expect(r.components.bot.state).toBe('up');
    expect(r.components.discord.state).toBe('up');
  });
});

describe('startHeartbeat', () => {
  it('schreibt den ersten Herzschlag sofort nach dem Verbinden (nicht erst nach 30 s)', async () => {
    const { startHeartbeat } = await import('../src/index.js');
    const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    const probe = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
    try { await probe.connect(); } catch { return; }
    await probe.del('hbtest:health:worker');
    const stop = startHeartbeat(url, 'worker', () => ({ x: 1 }), 'hbtest');
    await new Promise((r) => setTimeout(r, 800));
    expect(await probe.get('hbtest:health:worker')).toContain('"x":1');
    stop();
    await probe.del('hbtest:health:worker');
    probe.disconnect();
  });
});
