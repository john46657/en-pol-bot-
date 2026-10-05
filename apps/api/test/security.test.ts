import 'reflect-metadata';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { checkSecurityConfig } from '../src/common/security/config-check.js';
import { MemoryStore, RULES, decide } from '../src/common/security/rate-limit.js';
import {
  CsrfMiddleware,
  RateLimitMiddleware,
  SecurityHeadersMiddleware,
} from '../src/common/security/security.middleware.js';

const config = (env: Record<string, string> = {}) =>
  ({ get: (k: string) => ({ DASHBOARD_URL: 'https://dash.example.org', ...env })[k] }) as never;
const res = () => {
  const headers: Record<string, string> = {};
  const r: any = {
    headers,
    statusCode: 200,
    body: undefined,
    setHeader: (k: string, v: string) => void (headers[k] = v),
    removeHeader: vi.fn(),
    status(c: number) {
      r.statusCode = c;
      return r;
    },
    json(b: unknown) {
      r.body = b;
      return r;
    },
  };
  return r;
};
const run = (mw: { use: (...a: any[]) => unknown }, req: object) => {
  const r = res();
  const next = vi.fn();
  const out = mw.use(
    { method: 'GET', path: '/api/v1/x', headers: {}, ip: '1.2.3.4', ...req },
    r,
    next,
  );
  return Promise.resolve(out).then(() => ({ r, next }));
};

describe('Sicherheits-Header', () => {
  it('setzt strenge Header; HSTS nur in Produktion; /docs ohne CSP', async () => {
    const dev = await run(new SecurityHeadersMiddleware(config()), {});
    expect(dev.r.headers).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    });
    expect(dev.r.headers['Content-Security-Policy']).toContain("default-src 'none'");
    expect(dev.r.headers['Strict-Transport-Security']).toBeUndefined();
    expect(dev.next).toHaveBeenCalled();
    const prod = await run(new SecurityHeadersMiddleware(config({ NODE_ENV: 'production' })), {});
    expect(prod.r.headers['Strict-Transport-Security']).toContain('max-age=');
    const docs = await run(new SecurityHeadersMiddleware(config()), { path: '/docs' });
    expect(docs.r.headers['Content-Security-Policy']).toBeUndefined();
  });
});

describe('CSRF-Schutz', () => {
  const mw = new CsrfMiddleware(config());
  const post = (headers: Record<string, string>, method = 'POST') => run(mw, { method, headers });
  it('lässt sichere Methoden, Bearer-Token und Anfragen ohne Cookie durch', async () => {
    expect((await post({ cookie: 'nexus_session=x' }, 'GET')).next).toHaveBeenCalled();
    expect(
      (await post({ cookie: 'nexus_session=x', authorization: 'Bearer abc' })).next,
    ).toHaveBeenCalled();
    expect((await post({})).next).toHaveBeenCalled();
  });
  it('blockt Cookie-Anfragen mit fremder/fehlender Herkunft oder ohne Header', async () => {
    for (const h of [
      { cookie: 'nexus_session=x' },
      { cookie: 'nexus_session=x', origin: 'https://boese.example', 'x-requested-with': 'nexus' },
      { cookie: 'nexus_session=x', origin: 'https://dash.example.org' }, // Header fehlt
      {
        cookie: 'nexus_session=x',
        origin: 'https://dash.example.org.boese.example',
        'x-requested-with': 'nexus',
      },
      { cookie: 'nexus_session=x', origin: 'null', 'x-requested-with': 'nexus' },
    ]) {
      const { r, next } = await post(h, 'DELETE');
      expect(r.statusCode, JSON.stringify(h)).toBe(403);
      expect(next).not.toHaveBeenCalled();
    }
  });
  it('erlaubt Cookie-Anfragen vom Dashboard (Origin oder Referer) mit Header', async () => {
    expect(
      (
        await post(
          { cookie: 'x=1', origin: 'https://dash.example.org', 'x-requested-with': 'nexus' },
          'PUT',
        )
      ).next,
    ).toHaveBeenCalled();
    expect(
      (
        await post(
          {
            cookie: 'x=1',
            referer: 'https://dash.example.org/guilds/1',
            'x-requested-with': 'nexus',
          },
          'PATCH',
        )
      ).next,
    ).toHaveBeenCalled();
  });
});

describe('Rate Limits', () => {
  it('Fixed Window: blockt über dem Limit, öffnet nach dem Fenster; Benutzer unabhängig voneinander', async () => {
    let t = 0;
    const store = new MemoryStore(() => t);
    const hit = (userId: string) =>
      decide(store, { method: 'POST', path: '/api/v1/guilds/1/tickets', ip: '9.9.9.9', userId });
    for (let i = 0; i < 120; i++) expect((await hit('u1')).allowed).toBe(true);
    const blocked = await hit('u1');
    expect(blocked).toMatchObject({ allowed: false, rule: 'write', limit: 120 });
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect((await hit('u2')).allowed).toBe(true); // anderer Benutzer
    t += 61_000;
    expect((await hit('u1')).allowed).toBe(true); // neues Fenster
  });
  it('RATE_LIMIT_FACTOR vervielfacht die Grenzen (nur Tests); ungültige Werte gelten nicht', async () => {
    const run = async (factor: string | undefined) => {
      if (factor === undefined) delete process.env['RATE_LIMIT_FACTOR'];
      else process.env['RATE_LIMIT_FACTOR'] = factor;
      const store = new MemoryStore(() => 0);
      let last = await decide(store, { method: 'POST', path: '/x', ip: '1.1.1.1', userId: 'u' });
      for (let i = 0; i < 130; i++) last = await decide(store, { method: 'POST', path: '/x', ip: '1.1.1.1', userId: 'u' });
      return last;
    };
    try {
      expect(await run(undefined)).toMatchObject({ allowed: false, limit: 120 });
      expect(await run('0')).toMatchObject({ allowed: false, limit: 120 });
      expect(await run('abc')).toMatchObject({ allowed: false, limit: 120 });
      expect(await run('10')).toMatchObject({ allowed: true, limit: 1200 });
    } finally {
      delete process.env['RATE_LIMIT_FACTOR'];
    }
  });
  it('Auth-Routen sind je IP streng (30/min), Export je Benutzer (10/10 min)', async () => {
    const store = new MemoryStore(() => 0);
    let last;
    for (let i = 0; i < 31; i++)
      last = await decide(store, {
        method: 'GET',
        path: '/api/v1/auth/discord/callback',
        ip: '5.5.5.5',
      });
    expect(last).toMatchObject({ allowed: false, rule: 'auth' });
    let exp;
    for (let i = 0; i < 11; i++)
      exp = await decide(store, {
        method: 'GET',
        path: '/api/v1/guilds/1/audit-log/export',
        ip: '5.5.5.6',
        userId: 'u',
      });
    expect(exp).toMatchObject({ allowed: false, rule: 'export' });
    expect(RULES.map((r) => r.name)).toEqual(['auth', 'export', 'write', 'all']);
  });
  it('„/auth/me“ (jede Seite fragt es ab) fällt nicht unter die strenge Anmelde-Regel', async () => {
    const store = new MemoryStore();
    let last: any;
    for (let i = 0; i < 100; i++)
      last = await decide(store, {
        method: 'GET',
        path: '/api/v1/auth/me',
        ip: '6.6.6.6',
        userId: 'u1',
      });
    expect(last.allowed).toBe(true);
    expect(last.rule).toBe('all');
  });
  it('Middleware antwortet 429 mit Retry-After und Rate-Limit-Headern', async () => {
    const mw = new RateLimitMiddleware(config());
    let last: any;
    for (let i = 0; i < 31; i++)
      last = await run(mw, { path: '/api/v1/auth/discord/callback', ip: '7.7.7.7' });
    expect(last.r.statusCode).toBe(429);
    expect(last.r.headers['Retry-After']).toBeTruthy();
    expect(last.r.body.message).toContain('Zu viele Anfragen');
    const ok = await run(mw, { path: '/api/v1/guilds/1/x', ip: '8.8.8.8' });
    expect(ok.next).toHaveBeenCalled();
    expect(ok.r.headers['RateLimit-Limit']).toBe('600');
  });
});

describe('Konfigurationsprüfung (Secrets)', () => {
  const good = {
    NODE_ENV: 'production',
    AUTH_SECRET: 'a'.repeat(40) + 'Z9!x',
    JWT_ISSUER: 'nexus',
    DISCORD_TOKEN: 't',
    DASHBOARD_URL: 'https://dash.example.org',
    REDIS_URL: 'redis://r',
  };
  it('gültige Produktionskonfiguration ohne Fehler', () => {
    expect(checkSecurityConfig(good)).toEqual([]);
  });
  it.each([
    [{ AUTH_SECRET: 'kurz' }, 'zu kurz'],
    [{ AUTH_SECRET: 'change-me' }, 'zu kurz'],
    [{ AUTH_SECRET: 'secret' }, 'Platzhalter'],
    [{ JWT_ISSUER: '' }, 'JWT_ISSUER'],
    [{ DASHBOARD_URL: 'http://dash.example.org' }, 'https'],
    [{ DASHBOARD_URL: 'https://*.example.org' }, 'Platzhalter'],
    [{ DASHBOARD_URL: '' }, 'DASHBOARD_URL fehlt'],
  ])('Produktion: %j → Fehler', (over, text) => {
    const issues = checkSecurityConfig({ ...good, ...over });
    expect(
      issues.some((i) => i.level === 'error' && i.message.includes(text)),
      JSON.stringify(issues),
    ).toBe(true);
  });
  it('Entwicklung: nur Warnungen; Meldungen enthalten nie das Geheimnis', () => {
    const issues = checkSecurityConfig({ NODE_ENV: 'development', AUTH_SECRET: 'geheim123' });
    expect(issues.every((i) => i.level === 'warn')).toBe(true);
    expect(JSON.stringify(issues)).not.toContain('geheim123');
  });
});

/**
 * Autorisierungs-Sweep: Jede Route jedes Controllers muss serverseitig geschützt sein – entweder mit einem Recht
 * (`@RequirePermissions`/`@RequireAnyScope`), Server-Admin/Dashboard-Zugriff oder ausdrücklich `@Public`.
 * Das Frontend ist nie die einzige Sicherheitsinstanz.
 */
describe('Autorisierungs-Sweep über alle API-Routen', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) =>
      statSync(join(dir, f)).isDirectory()
        ? walk(join(dir, f))
        : f.endsWith('.controller.ts')
          ? [join(dir, f)]
          : [],
    );
  const files = walk(join(__dirname, '../src/modules'));
  const KEYS = [
    'nexus:permissions',
    'nexus:any-scope',
    'nexus:guild-admin',
    'nexus:dashboard-access',
    'nexus:public',
  ];
  it('findet die Controller', () => {
    expect(files.length).toBeGreaterThan(20);
  });
  it('jede Route hat Schutz oder ist ausdrücklich öffentlich (und die öffentlichen sind eine kleine, bekannte Liste)', async () => {
    const unprotected: string[] = [];
    const publics: string[] = [];
    for (const file of files) {
      const mod = (await import(file)) as Record<string, unknown>;
      for (const cls of Object.values(mod)) {
        if (typeof cls !== 'function' || !Reflect.getMetadata('path', cls)) continue;
        const proto = (cls as { prototype: Record<string, unknown> }).prototype;
        for (const name of Object.getOwnPropertyNames(proto)) {
          const handler = proto[name];
          if (
            name === 'constructor' ||
            typeof handler !== 'function' ||
            Reflect.getMetadata('method', handler) === undefined
          )
            continue;
          const keys = KEYS.filter(
            (k) =>
              Reflect.getMetadata(k, handler) !== undefined ||
              Reflect.getMetadata(k, cls) !== undefined,
          );
          const label = `${(cls as { name: string }).name}.${name}`;
          if (keys.includes('nexus:public')) publics.push(label);
          else if (keys.length === 0) unprotected.push(label);
        }
      }
    }
    // Nur Anmeldung nötig (globaler JwtAuthGuard) – Selbstauskunft des angemeldeten Benutzers, keine fremden Daten
    expect(unprotected.sort()).toEqual([
      'AuthController.me',
      'AuthController.myGuilds',
      'AuthController.myPermissions',
    ]);
    expect(publics.sort()).toEqual(expect.arrayContaining([]));
    expect(publics.length).toBeLessThanOrEqual(8);
  });
});

describe('Quellcode-Hygiene', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) =>
      ['node_modules', 'dist'].includes(f)
        ? []
        : statSync(join(dir, f)).isDirectory()
          ? walk(join(dir, f))
          : f.endsWith('.ts') || f.endsWith('.tsx')
            ? [join(dir, f)]
            : [],
    );
  const root = join(__dirname, '../../..');
  const sources = [
    ...walk(join(root, 'apps/api/src')),
    ...walk(join(root, 'apps/bot/src')),
    ...walk(join(root, 'apps/dashboard/src')),
    ...walk(join(root, 'packages')).filter((f) => !f.includes('/test/')),
  ];
  it('keine unsicheren Roh-SQL-Aufrufe (nur parametrisierte Tagged Templates)', () => {
    const bad = sources.filter((f) =>
      /\$(queryRawUnsafe|executeRawUnsafe)/.test(readFileSync(f, 'utf8')),
    );
    expect(bad).toEqual([]);
  });
  it('keine fest eingetragenen Geheimnisse (Discord-Token-Muster, JWT, private Schlüssel)', () => {
    const patterns = [
      /[MN][A-Za-z\d]{23,25}\.[\w-]{6}\.[\w-]{27,}/,
      /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
      /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\./,
    ];
    const bad = sources.filter((f) => patterns.some((p) => p.test(readFileSync(f, 'utf8'))));
    expect(bad).toEqual([]);
  });
  it('kein dangerouslySetInnerHTML/eval im Dashboard (XSS)', () => {
    const bad = sources.filter(
      (f) =>
        f.includes('/dashboard/') &&
        /dangerouslySetInnerHTML|\beval\(|new Function\(/.test(readFileSync(f, 'utf8')),
    );
    expect(bad).toEqual([]);
  });
});
