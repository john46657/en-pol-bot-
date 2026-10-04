import { createServer, type Server } from 'node:http';
import { signSession } from '@nexus/auth';
import { LiveService } from '../src/modules/live/live.service.js';
import { authorizeLive, type LiveDeps } from '../src/modules/live/live.authorize.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

const SECRET = 'test-secret-test-secret-test-secret-123456';
const ISSUER = 'nexus-test';
const ORIGIN = 'http://localhost:3001';
const G = '123456789012345678';
const grants = vi.hoisted(() => ({ allow: new Set<string>() }));

vi.mock('@nexus/permissions', async (orig) => {
  const mod = await orig<typeof import('@nexus/permissions')>();
  return { ...mod, permissions: { ...mod.permissions, canAny: async (ctx: { bypass: boolean }, keys: readonly string[]) => ctx.bypass || keys.some((k) => grants.allow.has(k)) } };
});

const token = (sub: string) => signSession({ sub, username: 'u', guilds: [] } as never, { secret: SECRET, issuer: ISSUER, ttlSeconds: 600 } as never);
const deps = (over: Partial<LiveDeps> = {}): LiveDeps => ({ secret: SECRET, issuer: ISSUER, allowedOrigins: [ORIGIN], getMember: async () => ({ isMember: true, roleIds: ['r1'] }), getAccess: async () => ({ canManageGuild: false }), ...over });
const req = (o: { origin?: string | undefined; cookie?: string | undefined; guild?: string | undefined } = {}) => ({ url: `/api/v1/live${o.guild === undefined ? `?guildId=${G}` : o.guild ? `?guildId=${o.guild}` : ''}`, headers: { ...(o.origin !== undefined ? { origin: o.origin } : { origin: ORIGIN }), ...(o.cookie ? { cookie: o.cookie } : {}) } });

describe('Autorisierung der Live-Verbindung', () => {
  it('lehnt fremde Herkunft, fehlenden Server, fehlende/ungültige Session, Nicht-Mitglieder und fehlende Rechte ab', async () => {
    grants.allow = new Set(['shifts.view']);
    const good = `nexus_session=${await token('900000000000000001')}`;
    expect(await authorizeLive(req({ origin: 'https://boese.example', cookie: good }), deps())).toMatchObject({ ok: false, status: 403 });
    expect(await authorizeLive({ url: '/api/v1/live', headers: {} }, deps())).toMatchObject({ ok: false, status: 403 }); // ohne Origin
    expect(await authorizeLive(req({ guild: '', cookie: good }), deps())).toMatchObject({ ok: false, status: 400 });
    expect(await authorizeLive(req({}), deps())).toMatchObject({ ok: false, status: 401 });
    expect(await authorizeLive(req({ cookie: 'nexus_session=quatsch' }), deps())).toMatchObject({ ok: false, status: 401 });
    expect(await authorizeLive(req({ cookie: good }), deps({ getMember: async () => ({ isMember: false, roleIds: [] }) }))).toMatchObject({ ok: false, status: 403 });
    grants.allow = new Set();
    expect(await authorizeLive(req({ cookie: good }), deps())).toMatchObject({ ok: false, status: 403, message: expect.stringContaining('Berechtigung') });
  });
  it('erlaubt mit Session und Recht – nur die berechtigten Bereiche; Admins alle', async () => {
    const cookie = `other=1; nexus_session=${await token('900000000000000001')}`;
    grants.allow = new Set(['shifts.view', 'tickets.view']);
    const r = await authorizeLive(req({ cookie }), deps());
    expect(r).toMatchObject({ ok: true, userId: '900000000000000001', guildId: G });
    expect(r.ok && [...r.areas].sort()).toEqual(['shifts', 'tickets']);
    const admin = await authorizeLive(req({ cookie }), deps({ getAccess: async () => ({ canManageGuild: true }) }));
    expect(admin.ok && admin.areas.size).toBeGreaterThan(10);
  });
});

describe('WebSocket-Endpunkt (echter Server)', () => {
  let server: Server;
  let port = 0;
  let svc: LiveService;
  beforeAll(async () => {
    svc = new LiveService({ httpAdapter: { getHttpServer: () => server } } as never, { get: () => undefined } as never, {} as never);
    server = createServer((_q, res) => res.end('ok'));
    svc.attach(server, deps());
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as { port: number }).port;
    grants.allow = new Set(['shifts.view']);
  });
  afterAll(async () => {
    await svc.onApplicationShutdown();
    await new Promise<void>((r) => server.close(() => r()));
  });
  const open = async (cookie?: string, origin = ORIGIN) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/live?guildId=${G}`, { headers: { origin, ...(cookie ? { cookie } : {}) } });
    const msgs: any[] = [];
    ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
    const result = await new Promise<'open' | number>((resolve) => {
      ws.on('open', () => resolve('open'));
      ws.on('unexpected-response', (_q, res) => resolve(res.statusCode ?? 0));
      ws.on('error', () => undefined);
    });
    return { ws, msgs, result };
  };
  const until = async (c: () => boolean) => {
    const t = Date.now();
    while (!c() && Date.now() - t < 2000) await new Promise((r) => setTimeout(r, 20));
  };

  it('verbindet nur mit gültiger Session; bekommt nur Ereignisse seiner Bereiche', async () => {
    expect((await open(undefined)).result).toBe(401);
    expect((await open(`nexus_session=${await token('900000000000000002')}`, 'https://boese.example')).result).toBe(403);
    const c = await open(`nexus_session=${await token('900000000000000002')}`);
    expect(c.result).toBe('open');
    await until(() => c.msgs.length > 0);
    expect(c.msgs[0]).toEqual({ type: 'hello', areas: ['shifts'] });
    const ev = (area: string, guildId = G) => ({ guildId, area, action: `${area}.x`, resourceType: 'X', resourceId: '1', at: new Date().toISOString() });
    svc.hub.dispatch(ev('tickets')); // nicht berechtigt
    svc.hub.dispatch(ev('shifts', '999999999999999999')); // anderer Server
    svc.hub.dispatch(ev('shifts'));
    await until(() => c.msgs.length > 1);
    await new Promise((r) => setTimeout(r, 100));
    expect(c.msgs.slice(1)).toEqual([expect.objectContaining({ type: 'event', area: 'shifts', action: 'shifts.x' })]);
    c.ws.close();
    await until(() => svc.hub.size === 0);
    expect(svc.hub.size).toBe(0);
  });

  it('trennt Verbindungen über dem Limit je Benutzer', async () => {
    const cookie = `nexus_session=${await token('900000000000000003')}`;
    const conns = [];
    for (let i = 0; i < 8; i++) conns.push(await open(cookie));
    const ninth = await open(cookie);
    const closed = await new Promise<number>((r) => { ninth.ws.on('close', (c) => r(c)); setTimeout(() => r(-1), 1500); });
    expect(closed).toBe(4008);
    for (const c of conns) c.ws.close();
  });
});
